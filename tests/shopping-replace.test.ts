import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const tempDir = mkdtempSync(join(tmpdir(), "nomly-replace-"));
process.env.DATABASE_URL = join(tempDir, "test.db");
{
  const sqlite = new Database(process.env.DATABASE_URL);
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  sqlite.close();
}

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

type DbMod = typeof import("@/db");
type Schema = typeof import("@/db/schema");
let dbm: DbMod;
let s: Schema;
let replace: typeof import("@/lib/shopping/replace");
let items: typeof import("@/lib/shopping/items");
let merge: typeof import("@/lib/shopping/merge");
let similar: typeof import("@/lib/ingredients/similar");
let route: typeof import("@/app/api/v1/shopping/items/[id]/replace/route");

beforeAll(async () => {
  dbm = await import("@/db");
  s = await import("@/db/schema");
  replace = await import("@/lib/shopping/replace");
  items = await import("@/lib/shopping/items");
  merge = await import("@/lib/shopping/merge");
  similar = await import("@/lib/ingredients/similar");
  route = await import("@/app/api/v1/shopping/items/[id]/replace/route");
});

type Fixture = {
  ing: { raeucher: number; frittiert: number; jackfruit: number; salz: number };
  recipes: { a: number; b: number; c: number };
  rows: { aTofu: number; aSalz: number; bTofu: number; bJack: number; bAfter: number; cTofu: number };
  g: number;
};

function seed(): Fixture {
  const { db } = dbm;
  for (const t of [
    s.ingredientSubstitution,
    s.reparseMute,
    s.shoppingItemAmount,
    s.shoppingItemSource,
    s.shoppingItem,
    s.recipeIngredient,
    s.recipeSection,
    s.mealPlan,
    s.recipe,
    s.ingredientAlias,
    s.ingredient,
  ]) {
    db.delete(t).run();
  }
  const g =
    db.select({ id: s.unit.id }).from(s.unit).all()[0]?.id ??
    db
      .insert(s.unit)
      .values({ name: "g", dimension: "mass", factor: 1 })
      .returning({ id: s.unit.id })
      .all()[0].id;
  const ingId = (name: string) =>
    db.insert(s.ingredient).values({ name }).returning({ id: s.ingredient.id }).all()[0].id;
  const ing = {
    raeucher: ingId("Räuchertofu"),
    frittiert: ingId("Frittierter Tofu"),
    jackfruit: ingId("Jackfruit"),
    salz: ingId("Salz"),
  };
  const mkRecipe = (title: string) => {
    const recipeId = db
      .insert(s.recipe)
      .values({ title, servings: 2 })
      .returning({ id: s.recipe.id })
      .all()[0].id;
    const sectionId = db
      .insert(s.recipeSection)
      .values({ recipeId })
      .returning({ id: s.recipeSection.id })
      .all()[0].id;
    return { recipeId, sectionId };
  };
  const row = (v: typeof s.recipeIngredient.$inferInsert) =>
    db.insert(s.recipeIngredient).values(v).returning({ id: s.recipeIngredient.id }).all()[0].id;

  const a = mkRecipe("Bowl");
  const aTofu = row({
    sectionId: a.sectionId,
    ingredientId: ing.raeucher,
    displayName: "Räuchertofu",
    quantity: 200,
    unitId: g,
    rawLine: "200 g Räuchertofu",
    sortOrder: 0,
  });
  const aSalz = row({ sectionId: a.sectionId, ingredientId: ing.salz, sortOrder: 1 });

  const b = mkRecipe("Curry");
  const bTofu = row({
    sectionId: b.sectionId,
    ingredientId: ing.raeucher,
    displayName: "Räuchertofu",
    quantity: 100,
    unitId: g,
    rawLine: "100 g Räuchertofu oder Jackfruit",
    sortOrder: 0,
  });
  const bJack = row({
    sectionId: b.sectionId,
    ingredientId: ing.jackfruit,
    displayName: "Jackfruit",
    quantity: 100,
    unitId: g,
    isOptional: true,
    alternativeForId: bTofu,
    sortOrder: 1,
  });
  const bAfter = row({ sectionId: b.sectionId, ingredientId: ing.salz, sortOrder: 2 });

  const c = mkRecipe("Pfanne");
  const cTofu = row({
    sectionId: c.sectionId,
    ingredientId: ing.raeucher,
    displayName: "Räuchertofu",
    quantity: 150,
    unitId: g,
    sortOrder: 0,
  });

  const meal = (recipeId: number, date: string) =>
    db
      .insert(s.mealPlan)
      .values({ recipeId, date })
      .returning({ id: s.mealPlan.id })
      .all()[0].id;
  merge.addMealsToList([
    { mealPlanId: meal(a.recipeId, "2026-11-20"), ingredients: [{ recipeIngredientId: aTofu }] },
    { mealPlanId: meal(b.recipeId, "2026-11-21"), ingredients: [{ recipeIngredientId: bTofu }] },
    { mealPlanId: meal(c.recipeId, "2026-11-22"), ingredients: [{ recipeIngredientId: cTofu }] },
  ]);
  return {
    ing,
    recipes: { a: a.recipeId, b: b.recipeId, c: c.recipeId },
    rows: { aTofu, aSalz, bTofu, bJack, bAfter, cTofu },
    g,
  };
}

function itemFor(ingredientId: number) {
  return items.listShoppingItems({ skipSweep: true }).find((i) => i.refId === ingredientId);
}

function rowsOf(recipeId: number) {
  const { db } = dbm;
  const sections = new Set(
    db
      .select()
      .from(s.recipeSection)
      .all()
      .filter((x) => x.recipeId === recipeId)
      .map((x) => x.id),
  );
  return db
    .select()
    .from(s.recipeIngredient)
    .all()
    .filter((r) => sections.has(r.sectionId))
    .sort((x, y) => x.sortOrder - y.sortOrder);
}

let f: Fixture;
beforeEach(() => {
  f = seed();
});

describe("replaceShoppingItemIngredient", () => {
  it("moves only the chosen recipes and edits recipes per mode", () => {
    const old = itemFor(f.ing.raeucher)!;
    items.addItemAmount(old.id, { quantity: 50, unitId: f.g });

    const res = replace.replaceShoppingItemIngredient(old.id, {
      newIngredientId: f.ing.frittiert,
      recipes: [
        { recipeId: f.recipes.a, mode: "replace" },
        { recipeId: f.recipes.b, mode: "primary" },
        { recipeId: f.recipes.c, mode: "skip" },
      ],
      others: "keep",
    });
    expect(res.oldItemRemoved).toBe(false);
    expect(res.changedRecipeIds.sort()).toEqual([f.recipes.a, f.recipes.b].sort());

    const oldAfter = itemFor(f.ing.raeucher)!;
    expect(oldAfter.sources.map((x) => x.recipeId)).toEqual([f.recipes.c]);
    expect(oldAfter.manualAmounts).toHaveLength(1);

    const fresh = itemFor(f.ing.frittiert)!;
    expect(fresh.id).toBe(res.newItemId);
    expect(fresh.sources.map((x) => x.recipeId).sort()).toEqual(
      [f.recipes.a, f.recipes.b].sort(),
    );
    expect(fresh.amounts.map((a) => a.quantity)).toEqual([300]);

    // Recipe A: the line itself now names the new article; its source text
    // is muted for the bulk reparse.
    const a = rowsOf(f.recipes.a);
    expect(a.find((r) => r.id === f.rows.aTofu)).toMatchObject({
      ingredientId: f.ing.frittiert,
      displayName: "Frittierter Tofu",
      quantity: 200,
    });
    const mutes = dbm.db.select().from(s.reparseMute).all();
    expect(mutes.map((m) => [m.recipeId, m.rawLine])).toContainEqual([
      f.recipes.a,
      "200 g Räuchertofu",
    ]);

    // Recipe B: new article heads the line, Räuchertofu became an
    // alternative placed after the existing one, the next row shifted down.
    const b = rowsOf(f.recipes.b);
    expect(b.map((r) => [r.ingredientId, r.alternativeForId, r.isOptional])).toEqual([
      [f.ing.frittiert, null, false],
      [f.ing.jackfruit, f.rows.bTofu, true],
      [f.ing.raeucher, f.rows.bTofu, true],
      [f.ing.salz, null, false],
    ]);
    expect(b.map((r) => r.sortOrder)).toEqual([0, 1, 2, 3]);

    // Recipe C untouched.
    expect(rowsOf(f.recipes.c)[0].ingredientId).toBe(f.ing.raeucher);

    // Moved sources point at the row now holding the new article.
    const bSource = fresh.sources.find((x) => x.recipeId === f.recipes.b)!;
    expect(bSource.recipeIngredientId).toBe(f.rows.bTofu);
  });

  it("adds the new article as an alternative and points the meal at it", () => {
    const old = itemFor(f.ing.raeucher)!;
    replace.replaceShoppingItemIngredient(old.id, {
      newIngredientId: f.ing.frittiert,
      recipes: [
        { recipeId: f.recipes.a, mode: "alternative" },
        { recipeId: f.recipes.b, mode: "alternative" },
        { recipeId: f.recipes.c, mode: "once" },
      ],
    });
    expect(itemFor(f.ing.raeucher)).toBeUndefined();

    const a = rowsOf(f.recipes.a);
    expect(a.map((r) => [r.ingredientId, r.alternativeForId, r.sortOrder])).toEqual([
      [f.ing.raeucher, null, 0],
      [f.ing.frittiert, f.rows.aTofu, 1],
      [f.ing.salz, null, 2],
    ]);
    const alt = a[1];
    expect(alt).toMatchObject({ isOptional: true, quantity: 200, rawLine: null });

    const b = rowsOf(f.recipes.b);
    expect(b.map((r) => r.ingredientId)).toEqual([
      f.ing.raeucher,
      f.ing.jackfruit,
      f.ing.frittiert,
      f.ing.salz,
    ]);

    const fresh = itemFor(f.ing.frittiert)!;
    const aSource = fresh.sources.find((x) => x.recipeId === f.recipes.a)!;
    expect(aSource.recipeIngredientId).toBe(alt.id);
    // "once" leaves the recipe — and the meal's link to its line — alone.
    const cSource = fresh.sources.find((x) => x.recipeId === f.recipes.c)!;
    expect(cSource.recipeIngredientId).toBe(f.rows.cTofu);
    expect(rowsOf(f.recipes.c)[0].ingredientId).toBe(f.ing.raeucher);
    // No reparse mute for pure additions.
    expect(dbm.db.select().from(s.reparseMute).all()).toHaveLength(0);
  });

  it("replacing on the list only removes the old entry and learns the pair", () => {
    const old = itemFor(f.ing.raeucher)!;
    items.patchItem(old.id, { note: "die große Packung" });
    replace.replaceShoppingItemIngredient(old.id, {
      newIngredientId: f.ing.frittiert,
      recipes: [],
    });
    expect(itemFor(f.ing.raeucher)).toBeUndefined();
    const fresh = itemFor(f.ing.frittiert)!;
    expect(fresh.sources).toHaveLength(3);
    expect(fresh.note).toBe("die große Packung");
    for (const r of [f.recipes.a, f.recipes.b, f.recipes.c]) {
      expect(rowsOf(r)[0].ingredientId).toBe(f.ing.raeucher);
    }
    const learned = dbm.db.select().from(s.ingredientSubstitution).all();
    expect(learned).toMatchObject([
      { fromIngredientId: f.ing.raeucher, toIngredientId: f.ing.frittiert, uses: 1 },
    ]);

    // Swapping back and forth bumps the counter per direction.
    replace.replaceShoppingItemIngredient(fresh.id, {
      newIngredientId: f.ing.raeucher,
      recipes: [],
    });
    replace.replaceShoppingItemIngredient(itemFor(f.ing.raeucher)!.id, {
      newIngredientId: f.ing.frittiert,
      recipes: [],
    });
    const uses = dbm.db
      .select()
      .from(s.ingredientSubstitution)
      .all()
      .find((r) => r.fromIngredientId === f.ing.raeucher)!.uses;
    expect(uses).toBe(2);
  });

  it("merges into an existing entry of the new article", () => {
    const existing = items.addManualItem({
      ingredientId: f.ing.frittiert,
      quantity: 100,
      unitId: f.g,
    }).item;
    const old = itemFor(f.ing.raeucher)!;
    const res = replace.replaceShoppingItemIngredient(old.id, {
      newIngredientId: f.ing.frittiert,
      recipes: [],
    });
    expect(res.newItemId).toBe(existing.id);
    expect(itemFor(f.ing.frittiert)!.amounts.map((a) => a.quantity)).toEqual([550]);
  });

  it("primary on a line whose new article already is an alternative promotes it", () => {
    const old = itemFor(f.ing.raeucher)!;
    replace.replaceShoppingItemIngredient(old.id, {
      newIngredientId: f.ing.jackfruit,
      recipes: [
        { recipeId: f.recipes.b, mode: "primary" },
        { recipeId: f.recipes.a, mode: "skip" },
        { recipeId: f.recipes.c, mode: "skip" },
      ],
    });
    const b = rowsOf(f.recipes.b);
    expect(b.map((r) => [r.ingredientId, r.alternativeForId])).toEqual([
      [f.ing.jackfruit, null],
      [f.ing.raeucher, f.rows.bTofu],
      [f.ing.salz, null],
    ]);
  });

  it("rejects checked entries and unknown articles", async () => {
    const old = itemFor(f.ing.raeucher)!;
    expect(() =>
      replace.replaceShoppingItemIngredient(old.id, {
        newIngredientId: 999_999,
        recipes: [],
      }),
    ).toThrow(/ingredient not found/);
    items.patchItem(old.id, { checked: true });
    const res = await route.POST(
      new Request("http://x/api", {
        method: "POST",
        body: JSON.stringify({ newIngredientId: f.ing.frittiert, recipes: [] }),
      }),
      { params: Promise.resolve({ id: String(old.id) }) },
    );
    expect(res.status).toBe(409);
  });
});

describe("findSimilarIngredients", () => {
  it("suggests by name, recipe alternatives and learned swaps", () => {
    const { db } = dbm;
    const ingId = (name: string) =>
      db.insert(s.ingredient).values({ name }).returning({ id: s.ingredient.id }).all()[0].id;
    const seiden = ingId("Seidentofu");
    ingId("Zwiebelpulver");
    const tempeh = ingId("Tempeh");

    let list = similar.findSimilarIngredients(f.ing.raeucher);
    const names = list.map((x) => x.name);
    expect(names).toContain("Frittierter Tofu");
    expect(names).toContain("Seidentofu");
    // Jackfruit is an alternative of Räuchertofu in recipe B.
    expect(list.find((x) => x.name === "Jackfruit")?.reasons).toContain("alternative");
    expect(names).not.toContain("Salz");
    expect(names).not.toContain("Tempeh");
    void seiden;

    // A learned swap puts an otherwise unrelated article first.
    db.insert(s.ingredientSubstitution)
      .values({ fromIngredientId: f.ing.raeucher, toIngredientId: tempeh, uses: 2 })
      .run();
    list = similar.findSimilarIngredients(f.ing.raeucher);
    expect(list[0]).toMatchObject({ name: "Tempeh", substitutionUses: 2 });
  });
});

describe("nameSimilarity", () => {
  const sim = (a: string, b: string, sameCategory = false, vocab: string[] = []) =>
    similar.nameSimilarity(
      similar.nameShape(a),
      similar.nameShape(b),
      sameCategory,
      new Set(vocab),
    );

  it("relates German compounds through their head noun", () => {
    expect(sim("Räuchertofu", "Frittierter Tofu")).toBeGreaterThanOrEqual(4);
    expect(sim("Gelbe Zwiebel", "Rote Zwiebel")).toBe(5);
    expect(sim("Nudeln", "Schupfnudel")).toBeGreaterThanOrEqual(4);
    expect(sim("Käse", "Veganer Frischkäse")).toBeGreaterThanOrEqual(4);
    expect(sim("Seidentofu", "Räuchertofu", false, ["tofu"])).toBe(3.5);
  });

  it("does not match on adjectives, suffixes or short endings alone", () => {
    expect(sim("Veganer Käse", "Veganer Joghurt")).toBe(0);
    expect(sim("Reis", "Brei")).toBe(0);
    expect(sim("Seidentofu", "Räuchertofu")).toBe(0); // "tofu" not a word here
    expect(sim("Drilling", "Seitling")).toBe(0); // "-ling" is no word
    expect(sim("Kartoffel", "Zwiebel", true, ["ol"])).toBe(0);
    expect(sim("Olivenöl", "Rapsöl", true, ["ol"])).toBe(2);
    expect(sim("Olivenöl", "Rapsöl", false, ["ol"])).toBe(0);
  });
});

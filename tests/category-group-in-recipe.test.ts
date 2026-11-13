import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const tempDir = mkdtempSync(join(tmpdir(), "nomly-category-group-"));
process.env.DATABASE_URL = join(tempDir, "test.db");

{
  const sqlite = new Database(process.env.DATABASE_URL);
  const tmpDb = drizzle(sqlite);
  migrate(tmpDb, { migrationsFolder: "./drizzle" });
  sqlite.close();
}

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

const ids = { gewuerze: 0, obst: 0, oel: 0, salz: 0, apfel: 0, pfeffer: 0 };

beforeAll(async () => {
  const { db } = await import("@/db");
  const { ingredient } = await import("@/db/schema");
  const { createCategory } = await import("@/lib/stammdaten/category/service");

  ids.gewuerze = createCategory({ name: "Gewürze", aliases: [], groupInRecipe: true }).id;
  ids.obst = createCategory({ name: "Obst", aliases: [] }).id;

  const add = (name: string, defaultCategoryId: number | null) =>
    db.insert(ingredient).values({ name, defaultCategoryId }).returning().get().id;
  ids.salz = add("Salz", ids.gewuerze);
  ids.pfeffer = add("Pfeffer", ids.gewuerze);
  ids.apfel = add("Apfel", ids.obst);
  ids.oel = add("Öl", null);
});

describe("category.groupInRecipe", () => {
  it("defaults to false and is kept when an update omits it", async () => {
    const { getCategoryDetail, updateCategory } = await import(
      "@/lib/stammdaten/category/service"
    );
    expect(getCategoryDetail(ids.obst)?.groupInRecipe).toBe(false);
    expect(getCategoryDetail(ids.gewuerze)?.groupInRecipe).toBe(true);

    updateCategory(ids.gewuerze, { name: "Gewürze", aliases: ["Spices"] });
    expect(getCategoryDetail(ids.gewuerze)?.groupInRecipe).toBe(true);

    updateCategory(ids.obst, { name: "Obst", aliases: [], groupInRecipe: true });
    expect(getCategoryDetail(ids.obst)?.groupInRecipe).toBe(true);
    updateCategory(ids.obst, { name: "Obst", aliases: [], groupInRecipe: false });
    expect(getCategoryDetail(ids.obst)?.groupInRecipe).toBe(false);
  });

  it("getRecipe tags rows of grouped categories with their group", async () => {
    const { createRecipe, getRecipe } = await import("@/lib/recipes/service");
    const line = (ingredientName: string, ingredientId: number | null) => ({
      ingredientName,
      ingredientId,
      unassigned: ingredientId == null,
      quantity: null,
      unitId: null,
      displayUnit: null,
      notes: null,
      isOptional: false,
      fixedAmount: false,
    });
    const recipeId = createRecipe({
      title: "Gruppiert",
      description: null,
      servings: 2,
      prepTimeMin: null,
      cookTimeMin: null,
      sourceUrl: null,
      photoPath: null,
      tags: [],
      sections: [
        {
          title: null,
          instructions: "",
          ingredients: [
            line("Salz", ids.salz),
            line("Apfel", ids.apfel),
            line("Öl", ids.oel),
            line("Pfeffer", ids.pfeffer),
            line("etwas Deko", null),
          ],
        },
      ],
    });
    const view = getRecipe(recipeId)!;
    const groups = view.sections[0].ingredients.map((i) => [
      i.ingredientName,
      i.ingredientGroup?.name ?? null,
    ]);
    expect(groups).toEqual([
      ["Salz", "Gewürze"],
      ["Apfel", null],
      ["Öl", null],
      ["Pfeffer", "Gewürze"],
      ["etwas Deko", null],
    ]);
  });
});

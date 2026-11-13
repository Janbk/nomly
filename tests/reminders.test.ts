import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type { RecipeInput } from "@/lib/recipes/types";

const tempDir = mkdtempSync(join(tmpdir(), "nomly-reminders-"));
process.env.DATABASE_URL = join(tempDir, "test.db");

{
  const sqlite = new Database(process.env.DATABASE_URL);
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  sqlite.close();
}

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

function baseInput(overrides: Partial<RecipeInput> = {}): RecipeInput {
  return {
    title: "Hummus",
    description: null,
    servings: 2,
    prepTimeMin: null,
    cookTimeMin: null,
    sourceUrl: null,
    photoPath: null,
    tags: [],
    sections: [{ title: null, instructions: "", ingredients: [] }],
    ...overrides,
  };
}

describe("recipe reminders — persistence", () => {
  it("stores reminders in order, trimmed, dropping empty texts", async () => {
    const { createRecipe, getRecipe } = await import("@/lib/recipes/service");
    const id = createRecipe(
      baseInput({
        reminders: [
          { daysBefore: 1, hour: 18, text: "  Kichererbsen einweichen " },
          { daysBefore: 0, hour: 8, text: "   " },
          { daysBefore: 0, hour: 9, text: "Abtropfen lassen" },
        ],
      }),
    );
    const view = getRecipe(id)!;
    expect(view.reminders.map(({ daysBefore, hour, text }) => ({ daysBefore, hour, text }))).toEqual([
      { daysBefore: 1, hour: 18, text: "Kichererbsen einweichen" },
      { daysBefore: 0, hour: 9, text: "Abtropfen lassen" },
    ]);
  });

  it("update without `reminders` leaves them untouched; [] clears them", async () => {
    const { createRecipe, getRecipe, updateRecipe } = await import(
      "@/lib/recipes/service"
    );
    const id = createRecipe(
      baseInput({ reminders: [{ daysBefore: 2, hour: 20, text: "Teig ansetzen" }] }),
    );
    updateRecipe(id, baseInput({ title: "Hummus 2" }));
    expect(getRecipe(id)!.reminders).toHaveLength(1);

    updateRecipe(id, baseInput({ reminders: [{ daysBefore: 0, hour: 7, text: "Neu" }] }));
    expect(getRecipe(id)!.reminders.map((r) => r.text)).toEqual(["Neu"]);

    updateRecipe(id, baseInput({ reminders: [] }));
    expect(getRecipe(id)!.reminders).toEqual([]);
  });

  it("validation rejects out-of-range values", async () => {
    const { recipeInputSchema } = await import("@/lib/recipes/validate");
    const ok = (r: unknown) =>
      recipeInputSchema.safeParse({ ...baseInput(), reminders: [r] }).success;
    expect(ok({ daysBefore: 0, hour: 0, text: "x" })).toBe(true);
    expect(ok({ daysBefore: 14, hour: 23, text: "x" })).toBe(true);
    expect(ok({ daysBefore: 15, hour: 12, text: "x" })).toBe(false);
    expect(ok({ daysBefore: -1, hour: 12, text: "x" })).toBe(false);
    expect(ok({ daysBefore: 0, hour: 24, text: "x" })).toBe(false);
    expect(ok({ daysBefore: 0, hour: 12, text: "  " })).toBe(false);
  });
});

describe("recipe reminders — occurrences", () => {
  let hummus: number;
  let bread: number;
  let plain: number;

  beforeAll(async () => {
    const { createRecipe } = await import("@/lib/recipes/service");
    hummus = createRecipe(
      baseInput({
        title: "Hummus",
        reminders: [
          { daysBefore: 1, hour: 18, text: "Kichererbsen einweichen" },
          { daysBefore: 0, hour: 9, text: "Kichererbsen kochen" },
        ],
      }),
    );
    bread = createRecipe(
      baseInput({
        title: "Brot",
        reminders: [{ daysBefore: 2, hour: 20, text: "Sauerteig auffrischen" }],
      }),
    );
    plain = createRecipe(baseInput({ title: "Nudeln" }));
  });

  beforeEach(async () => {
    const { db } = await import("@/db");
    const { mealPlan } = await import("@/db/schema");
    db.delete(mealPlan).run();
  });

  it("puts each reminder on mealDate − daysBefore, including meals after `to`", async () => {
    const { createMeal } = await import("@/lib/meal-plans/service");
    const { listReminders } = await import("@/lib/reminders/service");
    const h = createMeal({ recipeId: hummus, date: "2026-05-22" });
    const b = createMeal({ recipeId: bread, date: "2026-05-23" });
    createMeal({ recipeId: plain, date: "2026-05-21" });

    const day21 = listReminders("2026-05-21", "2026-05-21");
    expect(day21.map((r) => [r.text, r.mealPlanId, r.mealDate, r.time])).toEqual([
      ["Kichererbsen einweichen", h, "2026-05-22", "18:00"],
      ["Sauerteig auffrischen", b, "2026-05-23", "20:00"],
    ]);
    expect(listReminders("2026-05-22", "2026-05-22").map((r) => r.text)).toEqual([
      "Kichererbsen kochen",
    ]);
    expect(listReminders("2026-05-23", "2026-05-30")).toEqual([]);
  });

  it("skips leftover days", async () => {
    const { createMeal } = await import("@/lib/meal-plans/service");
    const { listReminders } = await import("@/lib/reminders/service");
    createMeal({ recipeId: hummus, date: "2026-05-22", isLeftover: true });
    expect(listReminders("2026-05-01", "2026-05-31")).toEqual([]);
  });

  it("filters by hour and sorts by day, then hour", async () => {
    const { createMeal } = await import("@/lib/meal-plans/service");
    const { listReminders } = await import("@/lib/reminders/service");
    createMeal({ recipeId: hummus, date: "2026-05-22" });
    createMeal({ recipeId: hummus, date: "2026-05-23" });

    const all = listReminders("2026-05-21", "2026-05-23");
    expect(all.map((r) => `${r.date} ${r.time}`)).toEqual([
      "2026-05-21 18:00",
      "2026-05-22 09:00",
      "2026-05-22 18:00",
      "2026-05-23 09:00",
    ]);
    expect(
      listReminders("2026-05-22", "2026-05-22", { hour: 18 }).map((r) => r.text),
    ).toEqual(["Kichererbsen einweichen"]);
  });

  it("GET /api/v1/reminders validates input and filters by hour", async () => {
    const { createMeal } = await import("@/lib/meal-plans/service");
    const { GET } = await import("@/app/api/v1/reminders/route");
    createMeal({ recipeId: hummus, date: "2026-05-22" });

    const call = async (qs: string) => {
      const res = await GET(new Request(`http://x/api/v1/reminders?${qs}`));
      return { status: res.status, body: await res.json() };
    };
    expect((await call("from=2026-05-21")).status).toBe(400);
    expect((await call("from=2026-05-22&to=2026-05-21")).status).toBe(400);
    expect((await call("from=2026-05-21&to=2026-05-21&hour=24")).status).toBe(400);

    const due = await call("from=2026-05-21&to=2026-05-21&hour=18");
    expect(due.status).toBe(200);
    expect(due.body.reminders.map((r: { text: string }) => r.text)).toEqual([
      "Kichererbsen einweichen",
    ]);
    expect((await call("from=2026-05-21&to=2026-05-21&hour=17")).body.reminders).toEqual([]);
  });
});

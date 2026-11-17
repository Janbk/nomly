import { describe, expect, it } from "vitest";
import { formatMealDate, recipeDays } from "@/lib/shopping/recipe-days";

const src = (recipeId: number | null, recipeTitle: string | null, mealDate: string | null) => ({
  recipeId,
  recipeTitle,
  mealDate,
});

describe("recipeDays", () => {
  it("folds sources per recipe, dates ascending and deduplicated, recipes by first day", () => {
    expect(
      recipeDays([
        src(2, "Suppe", "2026-11-20"),
        src(1, "Lasagne", "2026-11-21"),
        src(2, "Suppe", "2026-11-18"),
        src(2, "Suppe", "2026-11-20"),
        src(3, "Brot", null),
      ]),
    ).toEqual([
      { title: "Suppe", dates: ["2026-11-18", "2026-11-20"] },
      { title: "Lasagne", dates: ["2026-11-21"] },
      { title: "Brot", dates: [] },
    ]);
  });

  it("names a deleted recipe and returns nothing without sources", () => {
    expect(recipeDays([src(null, null, "2026-11-18")])).toEqual([
      { title: "Gelöschtes Rezept", dates: ["2026-11-18"] },
    ]);
    expect(recipeDays([])).toEqual([]);
  });
});

describe("formatMealDate", () => {
  it("shows weekday and day.month", () => {
    expect(formatMealDate("2026-11-18")).toMatch(/^Mi\.?, 18\.11\.$/);
  });
});

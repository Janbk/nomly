import type { ShoppingItemSourceView } from "./items";

/** "Mo., 18.11." for an ISO date (the meal's calendar day, no timezone). */
export function formatMealDate(iso: string): string {
  const dt = new Date(`${iso}T00:00:00Z`);
  const weekday = dt.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" });
  const dm = dt.toLocaleDateString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  });
  return `${weekday}, ${dm}`;
}

export type RecipeDays = {
  /** Recipe title; "Gelöschtes Rezept" once the recipe link is gone. */
  title: string;
  /** ISO meal dates, ascending, without duplicates. */
  dates: string[];
};

/**
 * Which recipe needs the item on which days: the item's meal sources folded
 * per recipe, recipes ordered by their first day (undated ones last).
 */
export function recipeDays(
  sources: ReadonlyArray<Pick<ShoppingItemSourceView, "recipeId" | "recipeTitle" | "mealDate">>,
): RecipeDays[] {
  const byRecipe = new Map<string, RecipeDays>();
  for (const s of sources) {
    const title = s.recipeTitle ?? "Gelöschtes Rezept";
    const key = s.recipeId != null ? `id:${s.recipeId}` : `title:${title}`;
    const entry = byRecipe.get(key) ?? { title, dates: [] };
    if (s.mealDate && !entry.dates.includes(s.mealDate)) entry.dates.push(s.mealDate);
    byRecipe.set(key, entry);
  }
  const out = [...byRecipe.values()];
  for (const r of out) r.dates.sort();
  return out.sort((a, b) => {
    const da = a.dates[0];
    const db = b.dates[0];
    if (da && db) return da.localeCompare(db) || a.title.localeCompare(b.title, "de");
    if (da) return -1;
    if (db) return 1;
    return a.title.localeCompare(b.title, "de");
  });
}

import type { IngredientGroup } from "./types.ts";

type GroupableRow = {
  alternativeForId: number | null;
  ingredientGroup: IngredientGroup | null;
};

export type IngredientBlock<T> = {
  /** Null for the leading block of ungrouped rows (rendered without heading). */
  group: IngredientGroup | null;
  rows: T[];
};

/**
 * Split a section's ingredient rows (already in recipe order) into display
 * blocks: first the ungrouped rows, then one block per "in Rezepten
 * gruppieren" category, ordered by the category's rank. Each block keeps the
 * recipe order of its rows.
 *
 * Alternatives always travel with their primary — the primary's group decides
 * the block — so the alternative rendering (rows directly after their
 * primary) stays intact. Like the read view's alternative grouping, an
 * alternative attaches to the row right before it.
 *
 * Empty blocks are omitted; a recipe without grouped rows yields exactly one
 * ungrouped block (or none for an empty list).
 */
export function groupIngredientsByCategory<T extends GroupableRow>(
  rows: T[],
): IngredientBlock<T>[] {
  const ungrouped: T[] = [];
  const byCategory = new Map<number, IngredientBlock<T>>();
  let current: T[] | null = null;
  for (const row of rows) {
    if (row.alternativeForId != null && current != null) {
      current.push(row);
      continue;
    }
    const group = row.ingredientGroup;
    if (group == null) {
      current = ungrouped;
    } else {
      let block = byCategory.get(group.categoryId);
      if (!block) {
        block = { group, rows: [] };
        byCategory.set(group.categoryId, block);
      }
      current = block.rows;
    }
    current.push(row);
  }
  const grouped = [...byCategory.values()].sort(
    (a, b) => a.group!.rank - b.group!.rank,
  );
  return [
    ...(ungrouped.length > 0 ? [{ group: null, rows: ungrouped }] : []),
    ...grouped,
  ];
}

import { describe, expect, it } from "vitest";
import { groupIngredientsByCategory } from "@/lib/recipes/ingredient-groups";
import type { IngredientGroup } from "@/lib/recipes/types";

const gewuerze: IngredientGroup = { categoryId: 7, name: "Gewürze", rank: 1 };
const backen: IngredientGroup = { categoryId: 3, name: "Backzutaten", rank: 0 };

type Row = {
  id: number;
  alternativeForId: number | null;
  ingredientGroup: IngredientGroup | null;
};

function row(
  id: number,
  group: IngredientGroup | null = null,
  alternativeForId: number | null = null,
): Row {
  return { id, alternativeForId, ingredientGroup: group };
}

function shape(rows: Row[]) {
  return groupIngredientsByCategory(rows).map((b) => [
    b.group?.name ?? null,
    b.rows.map((r) => r.id),
  ]);
}

describe("groupIngredientsByCategory", () => {
  it("returns a single ungrouped block when nothing is grouped", () => {
    expect(shape([row(1), row(2), row(3)])).toEqual([[null, [1, 2, 3]]]);
  });

  it("returns no blocks for an empty list", () => {
    expect(shape([])).toEqual([]);
  });

  it("puts ungrouped rows first and keeps recipe order inside each block", () => {
    expect(
      shape([
        row(1, gewuerze),
        row(2),
        row(3, gewuerze),
        row(4),
        row(5, gewuerze),
      ]),
    ).toEqual([
      [null, [2, 4]],
      ["Gewürze", [1, 3, 5]],
    ]);
  });

  it("orders grouped blocks by category rank, not first appearance", () => {
    expect(shape([row(1, gewuerze), row(2, backen), row(3)])).toEqual([
      [null, [3]],
      ["Backzutaten", [2]],
      ["Gewürze", [1]],
    ]);
  });

  it("omits the ungrouped block when every row is grouped", () => {
    expect(shape([row(1, gewuerze), row(2, gewuerze)])).toEqual([
      ["Gewürze", [1, 2]],
    ]);
  });

  it("keeps alternatives with their primary, whatever their own category", () => {
    expect(
      shape([
        row(1, gewuerze),
        row(2, null, 1), // ungrouped alternative of a spice → stays with spice
        row(3),
        row(4, gewuerze, 3), // spice alternative of an ungrouped row → stays up
      ]),
    ).toEqual([
      [null, [3, 4]],
      ["Gewürze", [1, 2]],
    ]);
  });
});

"use client";

import * as React from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ReasonForm } from "@/components/recipes/needs-update-toggle";
import type { ShoppingItemView } from "@/lib/shopping/items";
import type { RecipeUpdateMark } from "./api";
import { uniqueRecipes, type ItemRecipe } from "./shopping-item-row";

/**
 * "Update vormerken" from a shopping-list row. Asks for an optional reason
 * and — when the item is tied to more than one recipe — which of them to flag
 * (all start checked). Marking is one-way (sets needsUpdate=true). Each
 * flagged recipe also gets the recipe line(s) this item came from marked, so
 * the recipe view shows which ingredient prompted the flag.
 */
export function MarkRecipeUpdateDialog({
  item,
  onClose,
  onConfirm,
}: {
  item: ShoppingItemView | null;
  onClose: () => void;
  onConfirm: (marks: RecipeUpdateMark[], note: string) => void;
}) {
  return (
    <Dialog
      open={item != null}
      onOpenChange={(v) => (!v ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-md">
        {/* Keyed per item so the reason and selection start fresh. */}
        {item ? (
          <MarkForm
            key={item.id}
            item={item}
            onClose={onClose}
            onConfirm={onConfirm}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function MarkForm({
  item,
  onClose,
  onConfirm,
}: {
  item: ShoppingItemView;
  onClose: () => void;
  onConfirm: (marks: RecipeUpdateMark[], note: string) => void;
}) {
  const recipes = React.useMemo(() => uniqueRecipes(item.sources), [item]);
  const [selected, setSelected] = React.useState<Set<number>>(
    () => new Set(recipes.map((r) => r.recipeId)),
  );

  const toggle = (recipeId: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });

  const single = recipes.length === 1;
  return (
    <ReasonForm
      description={describe(item.name, recipes)}
      submitDisabled={selected.size === 0}
      onCancel={onClose}
      onSubmit={(note) => {
        onConfirm(marksFor(item, selected), note);
        onClose();
      }}
    >
      {single ? null : (
        <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
          {recipes.map((r) => (
            <li key={r.recipeId}>
              <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(r.recipeId)}
                  onChange={() => toggle(r.recipeId)}
                  className="size-4"
                />
                <span className="font-medium">{r.recipeTitle ?? "Rezept"}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </ReasonForm>
  );
}

function describe(itemName: string | null, recipes: ItemRecipe[]): string {
  const name = itemName ? `„${itemName}"` : "Die Zutat";
  if (recipes.length === 1) {
    const title = recipes[0].recipeTitle ?? "das Rezept";
    return `„${title}" wird für ein Update vorgemerkt, ${name} wird darin markiert.`;
  }
  return `${name} stammt aus mehreren Rezepten. Welche sollen für ein Update vorgemerkt werden? Die Zutat wird darin markiert.`;
}

/** Per selected recipe, the recipe lines this item's sources point at. A
 *  source whose line link is gone (recipe edited since) contributes none. */
function marksFor(item: ShoppingItemView, selected: Set<number>): RecipeUpdateMark[] {
  const byRecipe = new Map<number, Set<number>>();
  for (const id of selected) byRecipe.set(id, new Set());
  for (const s of item.sources) {
    if (s.recipeId == null || s.recipeIngredientId == null) continue;
    byRecipe.get(s.recipeId)?.add(s.recipeIngredientId);
  }
  return [...byRecipe].map(([recipeId, ids]) => ({
    recipeId,
    recipeIngredientIds: [...ids],
  }));
}

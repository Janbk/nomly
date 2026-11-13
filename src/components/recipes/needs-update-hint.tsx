import { Wrench } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RecipeView } from "@/lib/recipes/types";

/**
 * Background tint for a recipe line flagged as part of the "needs update"
 * reminder. Shared by the recipe view and the preview dialog.
 */
export const flaggedIngredientRowClass =
  "-mx-1 rounded-sm bg-[color-mix(in_srgb,var(--color-warning),transparent_85%)] px-1";

/** Trailing wrench on a flagged recipe line. */
export function FlaggedIngredientMarker() {
  return (
    <Wrench
      className="ml-1.5 inline size-3.5 align-[-0.125em] text-[var(--color-warning)]"
      aria-label="Für das Update markiert"
    />
  );
}

/**
 * The "needs update" reminder at the top of a recipe: the reason(s) the user
 * gave when flagging, and the lines it was flagged through. Renders nothing
 * unless the recipe is flagged and there is a reason or a flagged line to
 * show — a bare flag is already visible on the wrench button.
 */
export function NeedsUpdateHint({
  recipe,
  className,
}: {
  recipe: Pick<RecipeView, "needsUpdate" | "needsUpdateNote" | "sections">;
  className?: string;
}) {
  if (!recipe.needsUpdate) return null;
  const note = recipe.needsUpdateNote?.trim() || null;
  const flagged = [
    ...new Set(
      recipe.sections.flatMap((s) =>
        s.ingredients.filter((i) => i.needsUpdate).map((i) => i.ingredientName),
      ),
    ),
  ];
  if (!note && flagged.length === 0) return null;
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3 rounded-[var(--radius)] border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning),transparent_92%)] px-4 py-3 text-sm",
        className,
      )}
    >
      <Wrench className="mt-0.5 size-4 shrink-0 text-[var(--color-warning)]" />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium">Für ein Update vorgemerkt</p>
        {note ? (
          <p className="whitespace-pre-line break-words text-[var(--color-fg)]">{note}</p>
        ) : null}
        {flagged.length > 0 ? (
          <p className="text-[var(--color-muted-fg)]">
            Markierte Zutat{flagged.length === 1 ? "" : "en"}: {flagged.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}

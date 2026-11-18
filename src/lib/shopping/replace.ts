import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import {
  ingredient,
  ingredientSubstitution,
  recipe,
  recipeIngredient,
  recipeSection,
  reparseMute,
  shoppingItem,
  shoppingItemAmount,
  shoppingItemSource,
  shoppingItemStapleSource,
} from "../../db/schema.ts";
import { upsertShoppingItemForIngredient } from "./itemUpsert.ts";
import { ShoppingApiError } from "./items.ts";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * What "Ersetzen" does with one recipe the shopping item came from:
 *
 *   once        only this list: the recipe's contributions move to the new
 *               article, the recipe stays as it is
 *   replace     also in the recipe: the line now points at the new article
 *   alternative the new article is added to the recipe line as an
 *               alternative (the line itself is unchanged)
 *   primary     the new article becomes the line's main ingredient and the
 *               old one stays as its alternative
 *   skip        nothing changes — the recipe keeps the old article, also on
 *               this list
 *
 * Every mode but `skip` moves the recipe's contributions to the new article's
 * list entry.
 */
export type ReplaceRecipeMode =
  | "once"
  | "replace"
  | "alternative"
  | "primary"
  | "skip";

export const REPLACE_RECIPE_MODES: readonly ReplaceRecipeMode[] = [
  "once",
  "replace",
  "alternative",
  "primary",
  "skip",
];

export type ReplaceInput = {
  newIngredientId: number;
  /** Per recipe (by id) what to do. Recipes of the item that are not listed
   *  are replaced on the list only (`once`). */
  recipes: Array<{ recipeId: number; mode: ReplaceRecipeMode }>;
  /**
   * Contributions that don't belong to a live recipe — manual amounts,
   * staple groups ("Grundbedarf"), sources whose recipe was deleted: move
   * them to the new article (`replace`, default) or leave them (`keep`).
   */
  others?: "replace" | "keep";
};

export type ReplaceResult = {
  /** The new article's list entry, or null when nothing moved (every recipe
   *  skipped and the others kept). */
  newItemId: number | null;
  /** True when the old entry was left with nothing and removed. */
  oldItemRemoved: boolean;
  /** Recipes whose ingredient list was edited. */
  changedRecipeIds: number[];
};

/**
 * Replace a shopping item's article by another one, per recipe as chosen (see
 * {@link ReplaceRecipeMode}). One transaction: list moves, recipe edits and
 * the learned substitution (`ingredient_substitution`) land together.
 *
 * The old entry keeps whatever stays (skipped recipes, kept others, its
 * "Auf Lager" line); left with no contribution at all it is removed. The new
 * article's entry is found or created like any add (a recently checked one is
 * reactivated). Only open (unchecked) entries can be replaced.
 */
export function replaceShoppingItemIngredient(
  itemId: number,
  input: ReplaceInput,
): ReplaceResult {
  return db.transaction((tx) => {
    const item = tx
      .select({
        id: shoppingItem.id,
        ingredientId: shoppingItem.ingredientId,
        checked: shoppingItem.checked,
        note: shoppingItem.note,
      })
      .from(shoppingItem)
      .where(eq(shoppingItem.id, itemId))
      .get();
    if (!item) throw new ShoppingApiError("item not found", 404);
    if (item.checked) {
      throw new ShoppingApiError("checked items cannot be replaced", 409);
    }
    const oldIngredientId = item.ingredientId;
    if (input.newIngredientId === oldIngredientId) {
      throw new ShoppingApiError("new ingredient equals the current one", 400);
    }
    const target = tx
      .select({ id: ingredient.id, name: ingredient.name })
      .from(ingredient)
      .where(eq(ingredient.id, input.newIngredientId))
      .get();
    if (!target) throw new ShoppingApiError("ingredient not found", 404);

    const modeByRecipe = new Map(input.recipes.map((r) => [r.recipeId, r.mode]));
    const moveOthers = (input.others ?? "replace") === "replace";

    const sources = tx
      .select({
        id: shoppingItemSource.id,
        recipeId: shoppingItemSource.recipeId,
        recipeIngredientId: shoppingItemSource.recipeIngredientId,
      })
      .from(shoppingItemSource)
      .where(eq(shoppingItemSource.itemId, itemId))
      .all();
    // A source whose recipe link survives but the recipe row is gone can't
    // happen (SET NULL), so `recipeId != null` means a live recipe.
    const modeOf = (s: { recipeId: number | null }): ReplaceRecipeMode | "other" =>
      s.recipeId == null ? "other" : (modeByRecipe.get(s.recipeId) ?? "once");

    const movingSources = sources.filter((s) => {
      const m = modeOf(s);
      return m === "other" ? moveOthers : m !== "skip";
    });
    const staying = sources.length - movingSources.length;

    const stapleIds = tx
      .select({ id: shoppingItemStapleSource.id })
      .from(shoppingItemStapleSource)
      .where(eq(shoppingItemStapleSource.itemId, itemId))
      .all()
      .map((r) => r.id);
    const manualIds = tx
      .select({ id: shoppingItemAmount.id })
      .from(shoppingItemAmount)
      .where(eq(shoppingItemAmount.itemId, itemId))
      .all()
      .map((r) => r.id);
    const othersStaying = moveOthers ? 0 : stapleIds.length + manualIds.length;
    const oldEmptied = staying === 0 && othersStaying === 0;

    // ---- recipes -------------------------------------------------------
    const changedRecipeIds: number[] = [];
    /** recipe_ingredient id → the row of the same recipe line that now holds
     *  the new article (moved sources are re-pointed there). */
    const repoint = new Map<number, number>();
    const recipeIds = [
      ...new Set(
        sources.map((s) => s.recipeId).filter((id): id is number => id != null),
      ),
    ];
    for (const recipeId of recipeIds) {
      const mode = modeByRecipe.get(recipeId) ?? "once";
      if (mode === "once" || mode === "skip") continue;
      const linked = sources
        .filter((s) => s.recipeId === recipeId && s.recipeIngredientId != null)
        .map((s) => s.recipeIngredientId as number);
      const changed = editRecipe(tx, {
        recipeId,
        linkedRowIds: linked,
        oldIngredientId,
        newIngredient: target,
        mode,
        repoint,
      });
      if (changed) changedRecipeIds.push(recipeId);
    }

    // ---- shopping list -------------------------------------------------
    let newItemId: number | null = null;
    const movesAnything =
      movingSources.length > 0 ||
      (moveOthers && (stapleIds.length > 0 || manualIds.length > 0));
    if (movesAnything || oldEmptied) {
      const upsert = upsertShoppingItemForIngredient(tx, target.id);
      newItemId = upsert.itemId;
      for (const s of movingSources) {
        const next =
          s.recipeIngredientId != null ? repoint.get(s.recipeIngredientId) : undefined;
        tx.update(shoppingItemSource)
          .set({
            itemId: newItemId,
            ...(next !== undefined ? { recipeIngredientId: next } : {}),
          })
          .where(eq(shoppingItemSource.id, s.id))
          .run();
      }
      if (moveOthers && stapleIds.length > 0) {
        tx.update(shoppingItemStapleSource)
          .set({ itemId: newItemId })
          .where(inArray(shoppingItemStapleSource.id, stapleIds))
          .run();
      }
      if (moveOthers && manualIds.length > 0) {
        tx.update(shoppingItemAmount)
          .set({ itemId: newItemId })
          .where(inArray(shoppingItemAmount.id, manualIds))
          .run();
      }
      // The entry's comment goes along when the old entry disappears and
      // the new one has none.
      if (oldEmptied && item.note) {
        tx.update(shoppingItem)
          .set({ note: item.note })
          .where(and(eq(shoppingItem.id, newItemId), isNull(shoppingItem.note)))
          .run();
      }
    }

    if (oldEmptied) {
      tx.delete(shoppingItem).where(eq(shoppingItem.id, itemId)).run();
    } else {
      tx.update(shoppingItem)
        .set({
          version: sql`${shoppingItem.version} + 1`,
          updatedAt: sql`unixepoch()`,
        })
        .where(eq(shoppingItem.id, itemId))
        .run();
    }

    // ---- learn ---------------------------------------------------------
    tx.insert(ingredientSubstitution)
      .values({ fromIngredientId: oldIngredientId, toIngredientId: target.id })
      .onConflictDoUpdate({
        target: [
          ingredientSubstitution.fromIngredientId,
          ingredientSubstitution.toIngredientId,
        ],
        set: {
          uses: sql`${ingredientSubstitution.uses} + 1`,
          lastUsedAt: sql`unixepoch()`,
        },
      })
      .run();

    return { newItemId, oldItemRemoved: oldEmptied, changedRecipeIds };
  });
}

// ---------------------------------------------------------------------------
// Recipe edits
// ---------------------------------------------------------------------------

type Row = typeof recipeIngredient.$inferSelect;

function loadRecipeRows(tx: Tx, recipeId: number): Row[] {
  return tx
    .select({ row: recipeIngredient })
    .from(recipeIngredient)
    .innerJoin(recipeSection, eq(recipeSection.id, recipeIngredient.sectionId))
    .where(eq(recipeSection.recipeId, recipeId))
    .all()
    .map((r) => r.row);
}

/** The amount-and-wording fields that travel when a line's article moves to
 *  another row of the same group. */
function amountFields(r: Row) {
  return {
    quantity: r.quantity,
    quantityLow: r.quantityLow,
    unitId: r.unitId,
    displayUnit: r.displayUnit,
    quantifierId: r.quantifierId,
    displayQuantifier: r.displayQuantifier,
  };
}

/**
 * Insert an alternative into the group rooted at `rootId`, right after the
 * group's last member (later rows of the section shift down by one).
 */
function insertAlternative(
  tx: Tx,
  rootId: number,
  values: Omit<
    typeof recipeIngredient.$inferInsert,
    "id" | "sectionId" | "sortOrder" | "alternativeForId" | "isOptional"
  >,
): number {
  const root = tx
    .select({ sectionId: recipeIngredient.sectionId })
    .from(recipeIngredient)
    .where(eq(recipeIngredient.id, rootId))
    .get();
  if (!root) throw new Error(`recipe_ingredient ${rootId} vanished`);
  const last =
    tx
      .select({ max: sql<number | null>`MAX(${recipeIngredient.sortOrder})` })
      .from(recipeIngredient)
      .where(
        and(
          eq(recipeIngredient.sectionId, root.sectionId),
          or(
            eq(recipeIngredient.id, rootId),
            eq(recipeIngredient.alternativeForId, rootId),
          ),
        ),
      )
      .get()?.max ?? 0;
  tx.update(recipeIngredient)
    .set({ sortOrder: sql`${recipeIngredient.sortOrder} + 1` })
    .where(
      and(
        eq(recipeIngredient.sectionId, root.sectionId),
        gt(recipeIngredient.sortOrder, last),
      ),
    )
    .run();
  return tx
    .insert(recipeIngredient)
    .values({
      ...values,
      sectionId: root.sectionId,
      sortOrder: last + 1,
      alternativeForId: rootId,
      // Alternatives are always optional (see the schema note).
      isOptional: true,
      needsUpdate: false,
      // Hand-made alternatives carry no source line; the bulk reparse
      // absorbs them into their primary's group.
      rawLine: null,
    })
    .returning({ id: recipeIngredient.id })
    .all()[0].id;
}

function pointRowAt(
  tx: Tx,
  rowId: number,
  ing: { id: number; name: string },
  extra: Partial<typeof recipeIngredient.$inferInsert> = {},
): void {
  tx.update(recipeIngredient)
    .set({ ingredientId: ing.id, displayName: ing.name, ...extra })
    .where(eq(recipeIngredient.id, rowId))
    .run();
}

/**
 * Apply one recipe's mode to the line(s) the shopping item came from. The
 * lines are the ones the item's sources link to (still on the old article);
 * when those links are gone (recipe edited since it was added) every line of
 * the recipe on the old article is used. Returns whether anything changed.
 */
function editRecipe(
  tx: Tx,
  args: {
    recipeId: number;
    linkedRowIds: number[];
    oldIngredientId: number;
    newIngredient: { id: number; name: string };
    mode: "replace" | "alternative" | "primary";
    repoint: Map<number, number>;
  },
): boolean {
  const { recipeId, oldIngredientId, newIngredient, mode, repoint } = args;
  const initial = loadRecipeRows(tx, recipeId);
  const onOld = initial.filter((r) => r.ingredientId === oldIngredientId);
  const linked = new Set(args.linkedRowIds);
  const targets = onOld.some((r) => linked.has(r.id))
    ? onOld.filter((r) => linked.has(r.id))
    : onOld;
  if (targets.length === 0) return false;

  const mutedLines = new Set<string>();
  let changed = false;

  for (const t of targets) {
    // Re-read: an earlier target may have reshaped this group.
    const rows = loadRecipeRows(tx, recipeId);
    const r = rows.find((x) => x.id === t.id);
    if (!r || r.ingredientId !== oldIngredientId) continue;
    const rootId = r.alternativeForId ?? r.id;
    const group = rows.filter((x) => x.id === rootId || x.alternativeForId === rootId);
    const primary = group.find((x) => x.id === rootId) ?? r;
    const existingNew = group.find((x) => x.ingredientId === newIngredient.id);

    if (mode === "alternative") {
      if (existingNew) {
        repoint.set(r.id, existingNew.id);
        continue;
      }
      const id = insertAlternative(tx, rootId, {
        ingredientId: newIngredient.id,
        displayName: newIngredient.name,
        ...amountFields(r),
        notes: r.notes,
        fixedAmount: r.fixedAmount,
      });
      repoint.set(r.id, id);
      changed = true;
      continue;
    }

    if (mode === "replace") {
      if (existingNew && existingNew.id !== r.id) {
        // The group already offers the new article. A replaced alternative
        // simply goes (the existing one takes over); a replaced primary takes
        // the new article and the now-duplicate alternative goes.
        if (r.alternativeForId != null) {
          tx.delete(recipeIngredient).where(eq(recipeIngredient.id, r.id)).run();
          repoint.set(r.id, existingNew.id);
          changed = true;
          continue;
        }
        tx.delete(recipeIngredient).where(eq(recipeIngredient.id, existingNew.id)).run();
      }
      pointRowAt(tx, r.id, newIngredient);
      if (r.rawLine) mutedLines.add(r.rawLine);
      repoint.set(r.id, r.id);
      changed = true;
      continue;
    }

    // mode === "primary": the new article heads the group, the old one stays
    // as an alternative.
    if (primary.ingredientId === newIngredient.id) {
      repoint.set(r.id, primary.id);
      continue;
    }
    if (existingNew && existingNew.id !== primary.id) {
      tx.delete(recipeIngredient).where(eq(recipeIngredient.id, existingNew.id)).run();
    }
    // Keep what the primary currently says as an alternative …
    insertAlternative(tx, rootId, {
      ingredientId: primary.ingredientId,
      displayName: primary.displayName,
      ...amountFields(primary),
      notes: primary.notes,
      fixedAmount: primary.fixedAmount,
    });
    // … and put the new article on the primary row. Replacing an alternative
    // of the line, the new article takes over that alternative's amount.
    pointRowAt(
      tx,
      primary.id,
      newIngredient,
      primary.id === r.id ? {} : amountFields(r),
    );
    if (primary.rawLine) mutedLines.add(primary.rawLine);
    repoint.set(r.id, primary.id);
    changed = true;
  }

  if (!changed) return false;

  // The line's source text still names the old article; keep the bulk
  // reparse from offering to "fix" the deliberate change back.
  for (const line of mutedLines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;
    const exists = tx
      .select({ id: reparseMute.id })
      .from(reparseMute)
      .where(and(eq(reparseMute.recipeId, recipeId), eq(reparseMute.rawLine, trimmed)))
      .get();
    if (!exists) tx.insert(reparseMute).values({ recipeId, rawLine: trimmed }).run();
  }
  tx.update(recipe)
    .set({ updatedAt: sql`unixepoch()` })
    .where(eq(recipe.id, recipeId))
    .run();
  return true;
}

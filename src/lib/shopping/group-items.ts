import type { ShoppingItemView } from "@/lib/shopping/items";
import type { LearnedOrder } from "@/lib/shopping/learned-order";
import { isSkippedToday, localDateIso } from "@/lib/shopping/local-date";

export type SupermarketSummary = {
  id: number;
  name: string;
  categories: Array<{ categoryId: number; sortOrder: number }>;
  /** Walking order learned from past check-offs at this store, when any. */
  learnedOrder?: LearnedOrder;
};

export type ShoppingGroup = {
  key: string;
  /** Section heading: the category name. In learned order a category the
   *  walk visits more than once heads several sections. */
  label: string;
  items: ShoppingItemView[];
};

/** "category": aisle groups by the store's category order (the default).
 *  "learned": the store's learned check-off order, cut into a new category
 *  section wherever the category changes. */
export type ShoppingSortMode = "category" | "learned";

export type GroupOptions = {
  sortMode?: ShoppingSortMode;
  /** Device-local ISO date; a skip marker only hides its item on this day. */
  today?: string;
};

export type GroupedShoppingItems = {
  /** Visible open items, bucketed by category and ordered for the store. */
  openGroups: ShoppingGroup[];
  /** Visible checked items, flat, most-recently-checked first. */
  checkedItems: ShoppingItemView[];
  /** Open items that pass the active store filter. */
  visibleOpen: number;
  /** Checked items that pass the active store filter. */
  visibleChecked: number;
  /** Open items hidden by the active store filter (0 when no store selected). */
  hiddenOpen: number;
  /** Checked items hidden by the active store filter (0 when no store selected). */
  hiddenChecked: number;
  /**
   * Articles the user explicitly marked "not available here" at the active
   * store (open or checked). Subset of the hidden items — excludes the ones
   * merely hidden because the store doesn't carry their category. Drives the
   * "Nicht verfügbar" tab, whose reverse button clears the marker. Empty when
   * no store is selected.
   */
  unavailableHere: ShoppingItemView[];
  /**
   * Open items marked "gab es hier heute nicht" at the active store today
   * (and not also permanently unavailable there). Hidden from the open list;
   * listed on the "Nicht verfügbar" tab where the marker can be lifted.
   */
  skippedHere: ShoppingItemView[];
  /** True when the open list is in learned order (mode on, store selected and
   *  the store has learned data); false when it fell back to categories. */
  learnedOrderApplied: boolean;
};

/**
 * Returns true when `item` should be hidden for the given supermarket: the
 * user marked it unavailable there, it is still open and was skipped there
 * today, or its category isn't carried by that store. Uncategorized items
 * always pass — the user hasn't tagged them either way, so we surface them
 * rather than risk dropping them silently.
 */
function hiddenAtStore(
  item: ShoppingItemView,
  storeId: number | null,
  allowedCategoryIds: Set<number> | null,
  today: string,
): boolean {
  if (storeId == null || allowedCategoryIds == null) return false;
  if (item.unavailableSupermarketIds.includes(storeId)) return true;
  if (!item.checked && isSkippedToday(item, storeId, today)) return true;
  return item.categoryId != null && !allowedCategoryIds.has(item.categoryId);
}

const byName = (a: ShoppingItemView, b: ShoppingItemView) =>
  a.name.localeCompare(b.name, "de", { sensitivity: "base" });

/**
 * Sorts open items into the store's learned walking order.
 *
 *   1. Articles with their own learned score at this store are placed by it.
 *   2. An article without one, whose category has no own-scored article on
 *      the list but a learned category score, is placed by that score.
 *   3. An article never bought here whose category already shows up on the
 *      list (via an own-scored article) joins that category's first run.
 *   4. What is left (nothing learned at all) is slotted in by the store's
 *      configured category order: right after the first run of the nearest
 *      earlier configured category on the list, else before the first run of
 *      the nearest later one, else at the end. Categories the store doesn't
 *      configure follow; uncategorized articles go last.
 *
 * Ties by name. The result is flat; {@link runsByCategory} cuts it into
 * sections.
 */
function sortByLearnedOrder(
  items: ShoppingItemView[],
  store: SupermarketSummary,
  order: LearnedOrder,
): ShoppingItemView[] {
  const ingredientScore = new Map(
    order.ingredients.map((e) => [e.ingredientId, e.score]),
  );
  const categoryScore = new Map(
    order.categories.map((e) => [e.categoryId, e.score]),
  );
  const configured = [...store.categories]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((c) => c.categoryId);
  const configuredRank = new Map(configured.map((id, i) => [id, i]));

  // Categories that are on the list through an article with its own score.
  const anchored = new Set<number>();
  for (const item of items) {
    if (item.categoryId != null && ingredientScore.has(item.refId)) {
      anchored.add(item.categoryId);
    }
  }

  const placed: Array<{ item: ShoppingItemView; key: number }> = [];
  const joining: ShoppingItemView[] = [];
  const unplaced: ShoppingItemView[] = [];
  for (const item of items) {
    const own = ingredientScore.get(item.refId);
    const cat = item.categoryId;
    if (own != null) placed.push({ item, key: own });
    else if (cat != null && anchored.has(cat)) joining.push(item);
    else if (cat != null && categoryScore.has(cat)) {
      placed.push({ item, key: categoryScore.get(cat)! });
    } else unplaced.push(item);
  }
  placed.sort((a, b) => a.key - b.key || byName(a.item, b.item));
  const seq = placed.map((e) => e.item);

  const firstIndex = (categoryId: number) =>
    seq.findIndex((i) => i.categoryId === categoryId);
  /** Index just past the first run of `categoryId` in `seq`, or -1. */
  const endOfFirstRun = (categoryId: number): number => {
    const start = firstIndex(categoryId);
    if (start < 0) return -1;
    let end = start + 1;
    while (end < seq.length && seq[end].categoryId === categoryId) end += 1;
    return end;
  };

  for (const [cat, group] of groupByCategory(joining)) {
    seq.splice(endOfFirstRun(cat!), 0, ...group);
  }

  const rest = groupByCategory(unplaced);
  const restCats = [...rest.keys()].sort(
    (a, b) =>
      (a != null ? configuredRank.get(a) ?? Infinity : Infinity) -
      (b != null ? configuredRank.get(b) ?? Infinity : Infinity),
  );
  const tail: ShoppingItemView[] = [];
  for (const cat of restCats) {
    const group = rest.get(cat)!;
    const rank = cat != null ? configuredRank.get(cat) : undefined;
    if (rank == null) {
      tail.push(...group);
      continue;
    }
    let at = -1;
    for (let r = rank - 1; r >= 0 && at < 0; r -= 1) {
      at = endOfFirstRun(configured[r]);
    }
    for (let r = rank + 1; r < configured.length && at < 0; r += 1) {
      at = firstIndex(configured[r]);
    }
    seq.splice(at < 0 ? seq.length : at, 0, ...group);
  }
  // Categories the store doesn't configure (by name), then uncategorized.
  tail.sort((a, b) => {
    if (a.categoryId == null && b.categoryId != null) return 1;
    if (a.categoryId != null && b.categoryId == null) return -1;
    return (
      (a.categoryName ?? "").localeCompare(b.categoryName ?? "", "de", {
        sensitivity: "base",
      }) || byName(a, b)
    );
  });
  seq.push(...tail);
  return seq;
}

/** Items bucketed by category (insertion order), each bucket sorted by name. */
function groupByCategory(
  items: ShoppingItemView[],
): Map<number | null, ShoppingItemView[]> {
  const map = new Map<number | null, ShoppingItemView[]>();
  for (const item of items) {
    const arr = map.get(item.categoryId) ?? [];
    arr.push(item);
    map.set(item.categoryId, arr);
  }
  for (const arr of map.values()) arr.sort(byName);
  return map;
}

/**
 * Cuts a flat, ordered list into sections of consecutive same-category
 * articles. A category the walking order visits twice gets two sections.
 */
function runsByCategory(items: ShoppingItemView[]): ShoppingGroup[] {
  const groups: ShoppingGroup[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.items[0].categoryId === item.categoryId) {
      last.items.push(item);
    } else {
      groups.push({
        key: `learned-${groups.length}-${item.categoryId ?? "none"}`,
        label: item.categoryName ?? "Ohne Kategorie",
        items: [item],
      });
    }
  }
  return groups;
}

/**
 * Whether the item shows in the open ("still to buy") list for this store
 * filter — the same rule `groupShoppingItems` sorts by: not checked, not
 * marked unavailable or skipped today at the store, category carried there.
 */
export function isOpenAtStore(
  item: ShoppingItemView,
  supermarketId: number | null,
  supermarkets: SupermarketSummary[],
  today: string,
): boolean {
  if (item.checked) return false;
  const sm =
    supermarketId != null
      ? supermarkets.find((s) => s.id === supermarketId) ?? null
      : null;
  const allowed = sm ? new Set(sm.categories.map((c) => c.categoryId)) : null;
  return !hiddenAtStore(item, supermarketId, allowed, today);
}

/**
 * Splits the shopping items into the open (still-to-buy) groups and the flat
 * checked list, applying the active supermarket filter uniformly to both. The
 * filter narrows the visible shopping route; the returned `hidden*` counts let
 * the caller surface "N items hidden by the store filter".
 */
export function groupShoppingItems(
  items: ShoppingItemView[],
  supermarketId: number | null,
  supermarkets: SupermarketSummary[],
  options: GroupOptions = {},
): GroupedShoppingItems {
  const today = options.today ?? localDateIso();
  const sm =
    supermarketId != null
      ? supermarkets.find((s) => s.id === supermarketId) ?? null
      : null;
  const orderByCategory = sm
    ? new Map(sm.categories.map((c) => [c.categoryId, c.sortOrder]))
    : null;
  const allowedCategoryIds = sm
    ? new Set(sm.categories.map((c) => c.categoryId))
    : null;

  const open: ShoppingItemView[] = [];
  const checked: ShoppingItemView[] = [];
  const unavailableHere: ShoppingItemView[] = [];
  const skippedHere: ShoppingItemView[] = [];
  let hiddenOpen = 0;
  let hiddenChecked = 0;
  for (const item of items) {
    const hidden = hiddenAtStore(item, supermarketId, allowedCategoryIds, today);
    if (supermarketId != null) {
      if (item.unavailableSupermarketIds.includes(supermarketId)) {
        unavailableHere.push(item);
      } else if (!item.checked && isSkippedToday(item, supermarketId, today)) {
        skippedHere.push(item);
      }
    }
    if (item.checked) {
      if (hidden) hiddenChecked += 1;
      else checked.push(item);
    } else {
      if (hidden) hiddenOpen += 1;
      else open.push(item);
    }
  }

  // Learned order: the store's walking order, sectioned by category runs.
  // Falls back to the category groups when the store has nothing learned yet.
  const learned =
    options.sortMode === "learned" &&
    sm != null &&
    sm.learnedOrder != null &&
    (sm.learnedOrder.ingredients.length > 0 ||
      sm.learnedOrder.categories.length > 0)
      ? sm.learnedOrder
      : null;

  type Bucket = {
    categoryId: number | null;
    categoryName: string;
    items: ShoppingItemView[];
  };
  const buckets = new Map<number | "none", Bucket>();
  for (const item of open) {
    const key: number | "none" = item.categoryId ?? "none";
    const b = buckets.get(key) ?? {
      categoryId: item.categoryId,
      categoryName: item.categoryName ?? "Ohne Kategorie",
      items: [],
    };
    b.items.push(item);
    buckets.set(key, b);
  }
  for (const b of buckets.values()) {
    b.items.sort(byName);
  }

  // Uncategorized always sinks to the bottom of the open section, regardless
  // of whether a supermarket filter is active.
  const ordered = Array.from(buckets.values()).sort((a, b) => {
    if (a.categoryId == null && b.categoryId != null) return 1;
    if (a.categoryId != null && b.categoryId == null) return -1;
    if (orderByCategory) {
      const ao =
        a.categoryId != null ? orderByCategory.get(a.categoryId) : undefined;
      const bo =
        b.categoryId != null ? orderByCategory.get(b.categoryId) : undefined;
      if (ao != null && bo != null) return ao - bo;
      if (ao != null) return -1;
      if (bo != null) return 1;
    }
    return a.categoryName.localeCompare(b.categoryName, "de", {
      sensitivity: "base",
    });
  });

  const openGroups: ShoppingGroup[] =
    learned && sm
      ? runsByCategory(sortByLearnedOrder(open, sm, learned))
      : ordered.map((b) => ({
          key: `cat-${b.categoryId ?? "none"}`,
          label: b.categoryName,
          items: b.items,
        }));

  // Sort by checkedAt desc so the most-recently-checked item is at the top;
  // items without a checkedAt (legacy or imported) fall to the bottom.
  const checkedItems = [...checked].sort((a, b) => {
    const aAt = a.checkedAt ?? 0;
    const bAt = b.checkedAt ?? 0;
    return bAt - aAt;
  });

  return {
    openGroups,
    checkedItems,
    visibleOpen: open.length,
    visibleChecked: checked.length,
    hiddenOpen,
    hiddenChecked,
    unavailableHere: unavailableHere.sort(byName),
    skippedHere: skippedHere.sort(byName),
    learnedOrderApplied: learned != null,
  };
}

"use client";

import * as React from "react";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/cn";
import { useRandomize } from "./randomize-context";
import { DietFilter, type DietChoice } from "./diet-filter";
import { FavoritesFilter, type FavoriteUserOption } from "./favorites-filter";
import { NeedsUpdateFilter } from "./needs-update-filter";
import { RandomizeButton } from "./randomize-button";
import { RecipeSearch } from "./recipe-search";
import { TagFilterBar, type TagFilterValue } from "./tag-filter-bar";

/**
 * The complete set of recipe-list filters as a single value. Mirrors the params
 * the API (`GET /api/v1/recipes`) and server-side `listRecipes` understand, so
 * every surface funnels through identical filtering — including the advanced
 * search syntax (`zutat:`, phrases, OR, negation, typo tolerance).
 */
export type RecipeFilterValue = {
  q: string;
  tags: TagFilterValue;
  diet: DietChoice;
  needsUpdate: boolean;
};

export const EMPTY_RECIPE_FILTER: RecipeFilterValue = {
  q: "",
  tags: { must: [], not: [] },
  diet: "all",
  needsUpdate: false,
};

/** Serialise the filter into the query string the recipes API expects — the
 *  same shape `/rezepte` keeps in its URL. */
export function recipeFilterToQuery(f: RecipeFilterValue): string {
  const p = new URLSearchParams();
  const q = f.q.trim();
  if (q) p.set("q", q);
  if (f.tags.must.length > 0) p.set("must", f.tags.must.join(","));
  if (f.tags.not.length > 0) p.set("not", f.tags.not.join(","));
  if (f.diet !== "all") p.set("diet", f.diet);
  if (f.needsUpdate) p.set("update", "1");
  return p.toString();
}

type Props = {
  allTags: string[];
  /** Controlled mode: pass BOTH to keep filter state in React (the planner).
   *  Omit both to run URL-backed, where each control reads/writes the page URL
   *  (the `/rezepte` list). Either way the same controls render, so adding a
   *  filter here adds it to every list. */
  value?: RecipeFilterValue;
  onChange?: (next: RecipeFilterValue) => void;
  /** Household users for the favorites filter. When provided (the `/rezepte`
   *  list), a URL-backed "★ Favoriten" control renders; omitted elsewhere (the
   *  planner) so the favorites filter stays out of those surfaces. */
  users?: FavoriteUserOption[];
  /** The viewer's user id — labels their dropdown entry "Meine". */
  currentUserId?: number | null;
  /** Fold everything but the search behind a "Filter" toggle (the planner
   *  surfaces, where the list below needs the height). The open/closed choice
   *  is remembered under `storageKey`; until the user picks one, the filters
   *  start folded on short viewports — see {@link COLLAPSE_BELOW_HEIGHT}. */
  collapsible?: { storageKey: string };
};

/** Viewport height (CSS px) below which collapsible filter bars start folded.
 *  A 13–15" MacBook Air browser window is ~800–980px tall; a desktop monitor
 *  comfortably clears this. */
export const COLLAPSE_BELOW_HEIGHT = 1000;

const SHORT_VIEWPORT_QUERY = `(max-height: ${COLLAPSE_BELOW_HEIGHT - 1}px)`;

function subscribeShortViewport(onChange: () => void) {
  const mql = window.matchMedia(SHORT_VIEWPORT_QUERY);
  mql.addEventListener("change", onChange);
  return () => mql.removeEventListener("change", onChange);
}

// The remembered choice lives in localStorage; same-tab writes notify via this
// set, other tabs via the "storage" event.
const storedOpenListeners = new Set<() => void>();
function subscribeStoredOpen(onChange: () => void) {
  storedOpenListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    storedOpenListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}
function readStoredOpen(key: string): "open" | "closed" | null {
  try {
    const v = window.localStorage.getItem(key);
    return v === "open" || v === "closed" ? v : null;
  } catch {
    return null;
  }
}
function writeStoredOpen(key: string, open: boolean) {
  try {
    window.localStorage.setItem(key, open ? "open" : "closed");
  } catch {
    // Private mode / quota — the toggle still works for this render tree.
  }
  storedOpenListeners.forEach((l) => l());
}

/** Open state of a collapsible filter bar: the remembered choice, else open
 *  only on tall viewports. Server render (and first client paint) is folded,
 *  so a short screen never flashes the full bar. */
function useFiltersOpen(storageKey: string): [boolean, (open: boolean) => void] {
  const stored = React.useSyncExternalStore(
    subscribeStoredOpen,
    () => readStoredOpen(storageKey),
    () => null,
  );
  const short = React.useSyncExternalStore(
    subscribeShortViewport,
    () => window.matchMedia(SHORT_VIEWPORT_QUERY).matches,
    () => true,
  );
  const open = stored != null ? stored === "open" : !short;
  return [open, (next) => writeStoredOpen(storageKey, next)];
}

/** How many filters besides the search are narrowing the list. */
function activeFilterCount(f: RecipeFilterValue, randomized: boolean): number {
  return (
    (f.diet !== "all" ? 1 : 0) +
    (f.needsUpdate ? 1 : 0) +
    f.tags.must.length +
    f.tags.not.length +
    (randomized ? 1 : 0)
  );
}

/**
 * The single recipe-filter bar shared by the main `/rezepte` list and the
 * planner surfaces (side panel + add-meal modal). Renders search, diet,
 * "needs update", randomize and tag filters. Must be rendered inside a
 * {@link RandomizeProvider} so the randomize control has its context.
 */
export function RecipeFilterBar({
  allTags,
  value,
  onChange,
  users,
  currentUserId,
  collapsible,
}: Props) {
  if (collapsible && value && onChange) {
    return (
      <CollapsibleRecipeFilterBar
        allTags={allTags}
        value={value}
        onChange={onChange}
        storageKey={collapsible.storageKey}
      />
    );
  }
  return (
    <FullRecipeFilterBar
      allTags={allTags}
      value={value}
      onChange={onChange}
      users={users}
      currentUserId={currentUserId}
    />
  );
}

function FullRecipeFilterBar({
  allTags,
  value,
  onChange,
  users,
  currentUserId,
}: Omit<Props, "collapsible">) {
  // Both-or-neither: a single patch helper proves controlled mode and feeds
  // every sub-control. When absent the controls fall back to URL-backed mode.
  const patch =
    value && onChange
      ? (next: Partial<RecipeFilterValue>) => onChange({ ...value, ...next })
      : undefined;

  return (
    <div className="flex flex-col gap-4">
      <RecipeSearch
        value={value?.q}
        onChange={patch ? (q) => patch({ q }) : undefined}
      />
      <div className="flex flex-wrap items-center gap-3">
        <DietFilter
          value={value?.diet}
          onChange={patch ? (diet) => patch({ diet }) : undefined}
        />
        <NeedsUpdateFilter
          value={value?.needsUpdate}
          onChange={patch ? (needsUpdate) => patch({ needsUpdate }) : undefined}
        />
        {users ? (
          <FavoritesFilter users={users} currentUserId={currentUserId ?? null} />
        ) : null}
        <RandomizeButton />
      </div>
      {allTags.length > 0 ? (
        <TagFilterBar
          allTags={allTags}
          value={value?.tags}
          onChange={patch ? (tags) => patch({ tags }) : undefined}
        />
      ) : null}
    </div>
  );
}

/**
 * Planner variant: the search stays on screen; diet, "Update nötig",
 * randomize and tags sit behind a "Filter" toggle that shows how many of them
 * are active — so a short screen keeps its height for the recipe list.
 * Controlled mode only (the planner keeps filter state in React).
 */
function CollapsibleRecipeFilterBar({
  allTags,
  value,
  onChange,
  storageKey,
}: {
  allTags: string[];
  value: RecipeFilterValue;
  onChange: (next: RecipeFilterValue) => void;
  storageKey: string;
}) {
  const [open, setOpen] = useFiltersOpen(storageKey);
  const randomize = useRandomize();
  const count = activeFilterCount(value, randomize.active);
  const regionId = React.useId();
  const patch = (next: Partial<RecipeFilterValue>) =>
    onChange({ ...value, ...next });

  return (
    <div className="flex flex-col gap-2">
      <RecipeSearch value={value.q} onChange={(q) => patch({ q })} />
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-controls={regionId}
          className={cn(
            "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors pointer-coarse:h-10",
            count > 0
              ? "border-[var(--color-accent)] text-[var(--color-fg)]"
              : "border-[var(--color-border)] text-[var(--color-muted-fg)] hover:text-[var(--color-fg)]",
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          Filter
          {count > 0 ? (
            <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-[var(--color-accent)] px-1.5 text-[0.6875rem] leading-5 text-[var(--color-accent-fg)]">
              {count}
            </span>
          ) : null}
          <ChevronDown
            aria-hidden
            className={cn("size-3.5 transition-transform", open && "rotate-180")}
          />
        </button>
        {count > 0 ? (
          <button
            type="button"
            onClick={() => {
              onChange({ ...EMPTY_RECIPE_FILTER, q: value.q });
              randomize.reset();
            }}
            className="h-8 rounded-full px-2 text-xs text-[var(--color-muted-fg)] hover:text-[var(--color-fg)] pointer-coarse:h-10"
          >
            Zurücksetzen
          </button>
        ) : null}
      </div>
      <div id={regionId} hidden={!open} className="flex flex-col gap-3 pt-1">
        <div className="flex flex-wrap items-center gap-3">
          <DietFilter value={value.diet} onChange={(diet) => patch({ diet })} />
          <NeedsUpdateFilter
            value={value.needsUpdate}
            onChange={(needsUpdate) => patch({ needsUpdate })}
          />
          <RandomizeButton />
        </div>
        {allTags.length > 0 ? (
          <TagFilterBar
            allTags={allTags}
            value={value.tags}
            onChange={(tags) => patch({ tags })}
          />
        ) : null}
      </div>
    </div>
  );
}

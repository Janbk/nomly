"use client";

import { useCallback, useRef, useState, type ReactNode, type TouchEvent } from "react";
import {
  Ban,
  BookOpen,
  Check,
  CheckCheck,
  MoreVertical,
  PackageX,
  Pencil,
  Tags,
  Trash2,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type {
  ShoppingItemManualAmount,
  ShoppingItemSourceView,
  ShoppingItemStapleSourceView,
  ShoppingItemStock,
  ShoppingItemView,
} from "@/lib/shopping/items";
import { AmountList } from "./amount-list";
import { formatQty } from "@/lib/shopping/format";
import { formatMealDate } from "@/lib/shopping/recipe-days";
import { cn } from "@/lib/cn";

type Props = {
  item: ShoppingItemView;
  /** When set, "Hier nicht verfügbar" toggles for this supermarket. */
  activeSupermarketId: number | null;
  /** Opens the recipe preview dialog. Triggered from the context menu. */
  onPreviewRecipe: (recipeId: number) => void;
  onToggle: (item: ShoppingItemView) => void;
  /** Swipe right: check off without recording a purchase ("nicht gekauft"). */
  onCheckWithoutPurchase: (item: ShoppingItemView) => void;
  /** Opens the edit dialog for this row's item. */
  onEdit: (item: ShoppingItemView) => void;
  /** Opens the article (ingredient) editor for this row's linked article. */
  onEditArticle: (ingredientId: number) => void;
  onDelete: (id: number) => Promise<void>;
  onToggleUnavailable: (item: ShoppingItemView, supermarketId: number) => Promise<void>;
  /** "Gab es hier heute nicht": hides the open item at this store until
   *  tomorrow while it stays on the general list. */
  onSkipToday: (item: ShoppingItemView, supermarketId: number) => Promise<void>;
  /** Opens the "Update vormerken" dialog (optional reason; recipe picker when
   *  the item comes from more than one recipe). */
  onRequestMarkRecipeUpdate: (item: ShoppingItemView) => void;
  /** When true, actions that need the server right away (edit, delete, …) are
   *  disabled. Check-off, skip and unavailable go through the offline queue. */
  disabledOffline?: boolean;
  /** When set, replaces the 3-dots action menu with this node (e.g. the
   *  "Hier verfügbar machen" button on the unavailable tab). The row keeps its
   *  normal look and stays checkable. */
  trailingAction?: ReactNode;
};

export function ShoppingItemRow({
  item,
  activeSupermarketId,
  onPreviewRecipe,
  onToggle,
  onCheckWithoutPurchase,
  onEdit,
  onEditArticle,
  onDelete,
  onToggleUnavailable,
  onSkipToday,
  onRequestMarkRecipeUpdate,
  disabledOffline = false,
  trailingAction,
}: Props) {
  // Radix opens the action menu on `pointerdown`, which on touch fires the
  // moment a finger lands on the ⋮ button — so a scroll gesture that starts
  // there pops the menu open. We control the menu ourselves: suppress the
  // pointerdown-open for touch/pen and open on `click` instead (a click only
  // fires on a real tap, never when the gesture turns into a scroll). Mouse
  // keeps its native open-on-pointerdown behaviour.
  const [menuOpen, setMenuOpen] = useState(false);
  const lastPointerType = useRef<string>("mouse");

  const isUnavailableHere =
    activeSupermarketId != null &&
    item.unavailableSupermarketIds.includes(activeSupermarketId);
  // The "ohne Menge" count is shown on the aggregate only once a quantified
  // amount is present; mirror that gate for the per-source flag so the
  // all-unspecified case stays exactly as it was.
  const flagUnspecified = item.amounts.some((a) => a.quantity != null);

  // Touch swipes (phones; mouse/keyboard keep the menu): released past
  // SWIPE_TRIGGER, right checks off without a purchase and left marks "Heute
  // nicht da" — no confirming tap. Rows that can't do an action don't travel
  // in that direction.
  const canCheckWithoutPurchase = !item.checked && trailingAction == null;
  const canSkip =
    !item.checked &&
    trailingAction == null &&
    activeSupermarketId != null;
  const swipe = useRowSwipe({
    maxRight: canCheckWithoutPurchase ? MAX_RIGHT : 0,
    maxLeft: canSkip ? -MAX_LEFT : 0,
    onSwipeRight: () => onCheckWithoutPurchase(item),
    onSwipeLeft: () => {
      if (activeSupermarketId != null) void onSkipToday(item, activeSupermarketId);
    },
  });

  return (
    <div className="relative overflow-hidden">
      {/* Right-swipe hint, under the left edge: what releasing will do. */}
      <div
        aria-hidden
        style={{ opacity: swipe.dx > 0 ? 1 : 0 }}
        className={cn(
          "absolute inset-0 flex items-center gap-2 pl-4 text-sm font-medium transition-colors",
          swipe.dx >= SWIPE_TRIGGER
            ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
            : "bg-[var(--color-muted)] text-[var(--color-muted-fg)]",
        )}
      >
        <CheckCheck className="size-5" />
        Erledigt, nicht gekauft
      </div>
      {/* Left-swipe hint, under the right edge. Keyboards and screen readers
          use the row menu instead. */}
      <div
        aria-hidden
        style={{ opacity: swipe.dx < 0 ? 1 : 0 }}
        className={cn(
          "absolute inset-0 flex items-center justify-end gap-2 pr-4 text-sm font-medium transition-colors",
          swipe.dx <= -SWIPE_TRIGGER
            ? "bg-[var(--color-warning)] text-black"
            : "bg-[var(--color-muted)] text-[var(--color-muted-fg)]",
        )}
      >
        Heute nicht da
        <PackageX className="size-5" />
      </div>
      <div
        role="button"
        tabIndex={0}
        data-shopping-row
        data-checked={item.checked ? "true" : "false"}
        data-toggle
        onTouchStart={swipe.onTouchStart}
        onTouchMove={swipe.onTouchMove}
        onTouchEnd={swipe.onTouchEnd}
        onTouchCancel={swipe.onTouchEnd}
        style={{
          transform: `translateX(${swipe.dx}px)`,
          transition: swipe.dragging ? "none" : "transform 0.18s ease",
          touchAction: "pan-y",
        }}
        onClick={() => {
          // A click trailing a swipe isn't a tap.
          if (swipe.consumeClick()) return;
          onToggle(item);
        }}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onToggle(item);
          }
        }}
        aria-pressed={item.checked}
        aria-label={item.checked ? "Rückgängig" : "Abhaken"}
        className={cn(
          "group relative flex cursor-pointer items-center gap-2 bg-[var(--color-card)] px-2 py-2 sm:px-3",
          item.checked ? "opacity-60" : "hover:bg-[color-mix(in_srgb,var(--color-card),var(--color-muted)_40%)]",
        )}
      >
        <span className="flex w-7 shrink-0 items-center justify-center">
          <span
            className={cn(
              "inline-flex size-5 items-center justify-center rounded-md border-2 transition-colors",
              item.checked
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                : "border-[var(--color-border)] bg-[var(--color-bg)]",
            )}
          >
            {item.checked ? <Check className="size-3.5" strokeWidth={3} /> : null}
          </span>
        </span>

        <div className="min-w-0 flex-1 text-left">
          <div className="flex flex-col gap-1">
            <div
              className={cn(
                "flex flex-wrap items-baseline gap-x-2 gap-y-0.5",
                item.checked && "line-through",
              )}
            >
              <span className="font-medium" data-item-name>{item.name}</span>
              <AmountList
                amounts={item.amounts}
                unspecifiedCount={item.unspecifiedSourceCount}
              />
              {item.note ? (
                <span className="text-xs text-[var(--color-muted-fg)]">
                  · {item.note}
                </span>
              ) : null}
              {isUnavailableHere ? (
                <span className="rounded-full bg-[color-mix(in_srgb,var(--color-danger),transparent_90%)] px-2 py-0.5 text-xs text-[var(--color-danger)]">
                  Hier nicht verfügbar
                </span>
              ) : null}
            </div>
            {item.sources.length > 0 ||
            item.stapleSources.length > 0 ||
            item.manualAmounts.length > 0 ||
            item.stock?.quantity != null ? (
              <ul className="flex flex-col gap-0.5 text-xs text-[var(--color-muted-fg)]">
                {item.sources.map((s) => (
                  <SourceLine
                    key={`src-${s.sourceId}`}
                    source={s}
                    flagUnspecified={flagUnspecified}
                  />
                ))}
                {item.stapleSources.map((s) => (
                  <StapleLine
                    key={`stp-${s.sourceId}`}
                    staple={s}
                    flagUnspecified={flagUnspecified}
                  />
                ))}
                {item.manualAmounts.map((m) => (
                  <ManualLine
                    key={`man-${m.id}`}
                    manual={m}
                    flagUnspecified={flagUnspecified}
                  />
                ))}
                {item.stock?.quantity != null ? (
                  <StockLine stock={item.stock} />
                ) : null}
              </ul>
            ) : null}
          </div>
        </div>

        <div
          className="flex shrink-0 items-center gap-1"
          onClick={(e) => e.stopPropagation()}
          // A swipe must not start on the menu button.
          onTouchStart={(e) => e.stopPropagation()}
        >
          {trailingAction ?? (
          <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
            <DropdownMenuTrigger
              asChild
              onPointerDown={(e) => {
                lastPointerType.current = e.pointerType;
                // Block Radix's open-on-pointerdown for touch/pen so a scroll
                // starting on the button doesn't open the menu.
                if (e.pointerType !== "mouse") e.preventDefault();
              }}
              onClick={() => {
                // Mouse already toggled on pointerdown; touch/pen opens here.
                if (lastPointerType.current !== "mouse") setMenuOpen((v) => !v);
              }}
            >
              <Button variant="ghost" size="icon" aria-label="Aktionen" title="Aktionen">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                onClick={() => onEdit(item)}
                disabled={disabledOffline}
              >
                <Pencil className="mr-2 size-4" />
                Eintrag bearbeiten
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => onEditArticle(item.refId)}
                disabled={disabledOffline}
              >
                <Tags className="mr-2 size-4" />
                Artikel bearbeiten
              </DropdownMenuItem>
              <RecipeMenuEntry sources={item.sources} onPreview={onPreviewRecipe} />
              <MarkUpdateMenuEntry
                sources={item.sources}
                disabled={disabledOffline}
                onSelect={() => onRequestMarkRecipeUpdate(item)}
              />
              {!item.checked ? (
                <DropdownMenuItem
                  onClick={() =>
                    activeSupermarketId != null
                      ? void onSkipToday(item, activeSupermarketId)
                      : undefined
                  }
                  disabled={activeSupermarketId == null}
                  className="text-[var(--color-fg)]"
                >
                  <PackageX className="mr-2 size-4" />
                  Gibt’s hier heute nicht
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem
                onClick={() =>
                  activeSupermarketId != null
                    ? void onToggleUnavailable(item, activeSupermarketId)
                    : undefined
                }
                disabled={activeSupermarketId == null}
                className="text-[var(--color-fg)]"
              >
                <Ban className="mr-2 size-4" />
                {isUnavailableHere ? "Hier verfügbar markieren" : "Hier nicht verfügbar"}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => void onDelete(item.id)}
                className="text-[var(--color-danger)]"
                disabled={disabledOffline}
              >
                <Trash2 className="mr-2 size-4" />
                Löschen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}

const SWIPE_TRIGGER = 80;
const MAX_RIGHT = 120;
const MAX_LEFT = 120;
const AXIS_LOCK = 6;

/**
 * Horizontal swipe state for one row, after the planner's MobileMealCard:
 * axis-locked (vertical drags stay page scrolls); released past SWIPE_TRIGGER
 * in either direction it fires that side's action and snaps back. Travel is
 * clamped to [maxLeft, maxRight].
 */
function useRowSwipe({
  maxRight,
  maxLeft,
  onSwipeRight,
  onSwipeLeft,
}: {
  maxRight: number;
  maxLeft: number;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
}) {
  const [dx, setDx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const axisRef = useRef<"none" | "h" | "v">("none");
  const movedRef = useRef(false);
  // Mirror of `dx` so touchend decides on the live offset, not a stale closure.
  const dxRef = useRef(0);
  const setOffset = useCallback((v: number) => {
    dxRef.current = v;
    setDx(v);
  }, []);

  function onTouchStart(e: TouchEvent) {
    if (e.touches.length !== 1) return;
    startRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    axisRef.current = "none";
    movedRef.current = false;
    setDragging(true);
  }
  function onTouchMove(e: TouchEvent) {
    const s = startRef.current;
    if (!s) return;
    const ddx = e.touches[0].clientX - s.x;
    const ddy = e.touches[0].clientY - s.y;
    if (axisRef.current === "none") {
      if (Math.abs(ddx) < AXIS_LOCK && Math.abs(ddy) < AXIS_LOCK) return;
      axisRef.current = Math.abs(ddx) > Math.abs(ddy) ? "h" : "v";
    }
    if (axisRef.current !== "h") return;
    movedRef.current = true;
    setOffset(Math.max(maxLeft, Math.min(maxRight, ddx)));
  }
  function onTouchEnd() {
    setDragging(false);
    const wasHorizontal = axisRef.current === "h";
    startRef.current = null;
    if (!wasHorizontal) return;
    const cur = dxRef.current;
    setOffset(0);
    if (cur >= SWIPE_TRIGGER) onSwipeRight();
    else if (cur <= -SWIPE_TRIGGER) onSwipeLeft();
  }

  /** True when the click should be swallowed (it ended a swipe). */
  function consumeClick(): boolean {
    const swallow = movedRef.current;
    movedRef.current = false;
    return swallow;
  }

  return {
    dx,
    dragging,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    consumeClick,
  };
}

/** The dot-separated amount that trails a source/staple/manual row. A row with
 *  no number shows "· ohne Menge" (matching the aggregate's count) when the
 *  item is in the count-shown state; otherwise it falls back to a bare unit or
 *  nothing, leaving the all-unspecified case untouched. */
function AmountSegment({
  quantity,
  unitName,
  flagUnspecified,
}: {
  quantity: number | null;
  unitName: string | null;
  flagUnspecified: boolean;
}) {
  if (quantity != null) {
    return (
      <span>
        · {formatQty(quantity)}
        {unitName ? ` ${unitName}` : ""}
      </span>
    );
  }
  if (flagUnspecified) return <span className="italic">· ohne Menge</span>;
  if (unitName) return <span>· {unitName}</span>;
  return null;
}

function ManualLine({
  manual,
  flagUnspecified,
}: {
  manual: ShoppingItemManualAmount;
  flagUnspecified: boolean;
}) {
  return (
    <li className="inline-flex flex-wrap items-baseline gap-x-1.5 px-1">
      <span className="font-medium text-[var(--color-fg)]/80">Manuell</span>
      <AmountSegment
        quantity={manual.quantity}
        unitName={manual.unitName}
        flagUnspecified={flagUnspecified}
      />
    </li>
  );
}

function SourceLine({
  source,
  flagUnspecified,
}: {
  source: ShoppingItemSourceView;
  flagUnspecified: boolean;
}) {
  return (
    <li className="inline-flex flex-wrap items-baseline gap-x-1.5 px-1">
      {source.recipeNeedsUpdate ? (
        <Wrench
          className="size-3 self-center text-[var(--color-warning)]"
          aria-label="Rezept muss aktualisiert werden"
        />
      ) : null}
      <span className="font-medium text-[var(--color-fg)]/80">{source.recipeTitle}</span>
      {source.mealDate ? <span>({formatMealDate(source.mealDate)})</span> : null}
      <AmountSegment
        quantity={source.contributedQuantity}
        unitName={source.contributedUnit}
        flagUnspecified={flagUnspecified}
      />
      {source.recipeNotes ? <span>· {source.recipeNotes}</span> : null}
      {source.mealNote ? (
        <span className="italic">· {source.mealNote}</span>
      ) : null}
    </li>
  );
}

function StockLine({ stock }: { stock: ShoppingItemStock }) {
  return (
    <li className="inline-flex flex-wrap items-baseline gap-x-1.5 px-1 text-[var(--color-accent)]">
      <span className="font-medium">Auf Lager</span>
      <span>
        −{stock.quantity != null ? formatQty(stock.quantity) : ""}
        {stock.unitName ? ` ${stock.unitName}` : ""}
      </span>
    </li>
  );
}

function StapleLine({
  staple,
  flagUnspecified,
}: {
  staple: ShoppingItemStapleSourceView;
  flagUnspecified: boolean;
}) {
  return (
    <li className="inline-flex flex-wrap items-baseline gap-x-1.5 px-1">
      <span className="font-medium text-[var(--color-fg)]/80">
        {staple.stapleGroupName}
      </span>
      <AmountSegment
        quantity={staple.contributedQuantity}
        unitName={staple.contributedUnit}
        flagUnspecified={flagUnspecified}
      />
    </li>
  );
}

function RecipeMenuEntry({
  sources,
  onPreview,
}: {
  sources: ShoppingItemSourceView[];
  onPreview: (recipeId: number) => void;
}) {
  const unique = uniqueRecipes(sources);
  if (unique.length === 0) return null;
  if (unique.length === 1) {
    const { recipeId } = unique[0];
    return (
      <DropdownMenuItem onClick={() => onPreview(recipeId)}>
        <BookOpen className="mr-2 size-4" />
        Rezept öffnen
      </DropdownMenuItem>
    );
  }
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <BookOpen className="mr-2 size-4" />
        Rezept öffnen
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent>
        {unique.map(({ recipeId, recipeTitle }) => (
          <DropdownMenuItem key={recipeId} onClick={() => onPreview(recipeId)}>
            {recipeTitle}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

export type ItemRecipe = { recipeId: number; recipeTitle: string | null };

/**
 * The distinct recipes a shopping item is associated with, derived from its
 * meal sources. Dedupes by `recipeId` and skips sources whose recipe has been
 * deleted (recipeId nulled by the decoupling SET NULL).
 */
export function uniqueRecipes(sources: ShoppingItemSourceView[]): ItemRecipe[] {
  const byRecipe = new Map<number, ItemRecipe>();
  for (const s of sources) {
    if (s.recipeId != null && !byRecipe.has(s.recipeId)) {
      byRecipe.set(s.recipeId, { recipeId: s.recipeId, recipeTitle: s.recipeTitle });
    }
  }
  return Array.from(byRecipe.values());
}

/**
 * "Update vormerken" menu entry. Hidden when the item has no live recipe.
 * Opens the dialog that asks for the optional reason (and, with several
 * recipes, which of them to flag).
 */
function MarkUpdateMenuEntry({
  sources,
  disabled,
  onSelect,
}: {
  sources: ShoppingItemSourceView[];
  disabled: boolean;
  onSelect: () => void;
}) {
  if (uniqueRecipes(sources).length === 0) return null;
  return (
    <DropdownMenuItem disabled={disabled} onClick={onSelect}>
      <Wrench className="mr-2 size-4" />
      Update vormerken
    </DropdownMenuItem>
  );
}


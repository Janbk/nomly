"use client";

import * as React from "react";
import { Minus, Plus, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type ComboboxItem } from "@/components/ui/combobox";
import { AmountList } from "./amount-list";
import { UnitSelect } from "./unit-select";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/cn";
import type { ShoppingItemView } from "@/lib/shopping/items";
import { stepStockInput } from "@/lib/shopping/stock-step";
import { previewStockCoverage, setStockBatch } from "./api";

type Props = {
  open: boolean;
  items: ShoppingItemView[];
  onClose: () => void;
  onSaved: (items: ShoppingItemView[]) => void;
};

type BodyProps = Omit<Props, "open"> & {
  /**
   * Rendered outside a Radix Dialog (the Home Assistant embed page): plain
   * heading elements instead of DialogTitle/Description, which need the
   * Dialog context, and no "Abbrechen" button — the HA popup closes itself.
   */
  embedded?: boolean;
  /** Embedded only: hide the heading (the HA popup header already shows it). */
  showTitle?: boolean;
};

function parseInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed.length === 0) return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function initialUnit(item: ShoppingItemView): ComboboxItem | null {
  if (item.stock?.unitId != null && item.stock.unitName) {
    return { id: item.stock.unitId, name: item.stock.unitName };
  }
  if (item.defaultUnitId != null && item.defaultUnitName) {
    return { id: item.defaultUnitId, name: item.defaultUnitName };
  }
  return null;
}

export function StockCheckDialog({ open, items, onClose, onSaved }: Props) {
  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : undefined)}>
      <DialogContent className="sm:max-w-2xl">
        {open ? (
          <StockCheckBody items={items} onClose={onClose} onSaved={onSaved} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export function StockCheckBody({
  items,
  onClose,
  onSaved,
  embedded = false,
  showTitle = true,
}: BodyProps) {
  const Title = embedded ? "h1" : DialogTitle;
  const Description = embedded ? "p" : DialogDescription;
  // Stable snapshot for the lifetime of the dialog so inputs don't reshuffle
  // when a background realtime update arrives. Only still-to-buy items are
  // relevant: checked-off ones are already handled, so there's nothing to
  // subtract from their demand.
  const rows = React.useMemo(() => items.filter((i) => !i.checked), []); // eslint-disable-line react-hooks/exhaustive-deps
  const [qty, setQty] = React.useState<Record<number, string>>(() =>
    Object.fromEntries(
      rows.map((i) => [i.id, i.stock?.quantity != null ? String(i.stock.quantity) : ""]),
    ),
  );
  const [units, setUnits] = React.useState<Record<number, ComboboxItem | null>>(() =>
    Object.fromEntries(rows.map((i) => [i.id, initialUnit(i)])),
  );
  const [removed, setRemoved] = React.useState<Record<number, boolean>>({});
  /** The −/+ buttons: step an amount by one (see stepStockInput). */
  function stepQty(id: number, delta: number) {
    setQty((prev) => ({ ...prev, [id]: stepStockInput(prev[id] ?? "", delta) }));
  }
  // Items whose demand the current inputs would fully cover — the server
  // removes those on save, so the row shows it up front (debounced dry-run).
  const [covered, setCovered] = React.useState<Set<number>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (rows.length === 0) return;
    let cancelled = false;
    const handle = setTimeout(async () => {
      const entries = rows
        .filter((i) => !removed[i.id])
        .map((i) => ({
          itemId: i.id,
          quantity: parseInput(qty[i.id] ?? ""),
          unitId: units[i.id]?.id ?? null,
        }));
      try {
        const ids = await previewStockCoverage(entries);
        if (!cancelled) setCovered(new Set(ids));
      } catch {
        // Best-effort hint only — save still applies the removal server-side.
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [rows, qty, units, removed]);

  async function commit() {
    setSaving(true);
    setSaveError(null);
    try {
      const entries: Array<{
        itemId: number;
        quantity: number | null;
        unitId: number | null;
        remove?: boolean;
      }> = [];
      for (const i of rows) {
        if (removed[i.id]) {
          entries.push({ itemId: i.id, quantity: null, unitId: null, remove: true });
          continue;
        }
        const next = parseInput(qty[i.id] ?? "");
        const prev = i.stock?.quantity ?? null;
        const nextUnit = units[i.id]?.id ?? null;
        const prevUnit = i.stock?.unitId ?? null;
        const changed = next !== prev || (next != null && nextUnit !== prevUnit);
        if (!changed) continue;
        entries.push({ itemId: i.id, quantity: next, unitId: next == null ? null : nextUnit });
      }
      // An empty batch still runs the server-side coverage sweep, so don't
      // skip the call while covered rows are showing a removal hint.
      if (entries.length === 0 && covered.size === 0) {
        onClose();
        return;
      }
      const updated = await setStockBatch(entries);
      onSaved(updated);
    } catch {
      // Keep the form (and the user's inputs) so they can retry.
      setSaveError("Speichern fehlgeschlagen. Bitte erneut versuchen.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <DialogHeader>
        {showTitle ? (
          <Title className="text-lg font-semibold leading-tight">Auf Lager prüfen</Title>
        ) : null}
        <Description className="text-sm text-[var(--color-muted-fg)]">
          Trag ein, was du schon zu Hause hast — es wird vom Gesamtbedarf
          derselben Einheit abgezogen.
        </Description>
      </DialogHeader>
      <DialogBody>
        {rows.length === 0 ? (
          <p className="text-sm text-[var(--color-muted-fg)]">
            Keine Artikel auf der Liste.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {rows.map((i) => {
              const isRemoved = !!removed[i.id];
              const isCovered = !isRemoved && covered.has(i.id);
              return (
                <li key={i.id} className="flex flex-col gap-0.5">
                  {/* One line from `sm` up: name | stepper, unit | remove.
                      On phones the remove button joins the name's line (via
                      `order`) and stepper + unit wrap below at full width, so
                      the 44px touch targets don't squeeze the name and the
                      unit picker keeps room for its full label. */}
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 sm:flex-nowrap">
                    <div className="order-1 min-w-0 flex-1">
                      <p
                        className={cn(
                          "truncate text-sm",
                          isRemoved && "text-[var(--color-muted-fg)] line-through",
                        )}
                      >
                        {i.name}
                      </p>
                      {i.requiredAmounts.some(
                        (a) => a.quantity != null || a.unitName != null,
                      ) ? (
                        <p className="truncate text-xs text-[var(--color-muted-fg)]">
                          Benötigt:{" "}
                          <AmountList
                            amounts={i.requiredAmounts}
                            unspecifiedCount={i.unspecifiedSourceCount}
                            className="text-xs"
                          />
                        </p>
                      ) : null}
                    </div>
                    <div className="order-3 flex min-w-0 basis-full items-center gap-2 sm:order-2 sm:basis-auto">
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => stepQty(i.id, -1)}
                          disabled={isRemoved || parseInput(qty[i.id] ?? "") == null}
                          aria-label={`Weniger auf Lager: ${i.name}`}
                          title="Weniger"
                        >
                          <Minus className="size-4" />
                        </Button>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={qty[i.id] ?? ""}
                          onChange={(e) =>
                            setQty((prev) => ({ ...prev, [i.id]: e.target.value }))
                          }
                          placeholder="Menge"
                          className="w-12 px-1 text-center"
                          disabled={isRemoved}
                          aria-label={`Auf Lager: ${i.name}`}
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => stepQty(i.id, 1)}
                          disabled={isRemoved}
                          aria-label={`Mehr auf Lager: ${i.name}`}
                          title="Mehr"
                        >
                          <Plus className="size-4" />
                        </Button>
                      </div>
                      <UnitSelect
                        value={units[i.id] ?? null}
                        onChange={(u) => setUnits((prev) => ({ ...prev, [i.id]: u }))}
                        // Phones: the rest of the controls line. From `sm` up a
                        // fixed column wide enough for the longest unit name
                        // ("Messerspitze") plus the clear/chevron icons, so
                        // rows stay aligned.
                        className="min-w-0 flex-1 sm:w-44 sm:flex-none"
                        disabled={isRemoved}
                      />
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="order-2 shrink-0 sm:order-3"
                      onClick={() =>
                        setRemoved((prev) => ({ ...prev, [i.id]: !prev[i.id] }))
                      }
                      aria-label={
                        isRemoved
                          ? `Entfernen rückgängig: ${i.name}`
                          : `Von der Liste entfernen: ${i.name}`
                      }
                      title={isRemoved ? "Entfernen rückgängig" : "Von der Liste entfernen"}
                    >
                      {isRemoved ? (
                        <Undo2 className="size-4" />
                      ) : (
                        <Trash2 className="size-4 text-[var(--color-danger)]" />
                      )}
                    </Button>
                  </div>
                  {isRemoved || isCovered ? (
                    <p className="text-xs text-[var(--color-danger)]">
                      {isRemoved
                        ? "Wird beim Speichern von der Liste entfernt."
                        : "Bedarf gedeckt — wird beim Speichern von der Liste entfernt."}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </DialogBody>
      <DialogFooter>
        {saveError ? (
          <p
            role="alert"
            className="text-sm text-[var(--color-danger)] sm:mr-auto sm:self-center"
          >
            {saveError}
          </p>
        ) : null}
        {embedded ? null : (
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Abbrechen
          </Button>
        )}
        <Button onClick={commit} disabled={saving}>
          {saving ? "Speichert…" : "Speichern"}
        </Button>
      </DialogFooter>
    </>
  );
}

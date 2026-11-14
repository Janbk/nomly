"use client";

import * as React from "react";
import { CheckCircle2 } from "lucide-react";
import type { ShoppingItemView } from "@/lib/shopping/items";
import { StockCheckBody } from "./stock-check-dialog";

/**
 * The stock-check form as a standalone page (Home Assistant embed). The HA
 * popup can't be closed from inside the iframe, so instead of closing, a save
 * shows a confirmation and restarts the form on the updated list.
 */
export function EmbedStockCheck({
  initialItems,
  showTitle,
}: {
  initialItems: ShoppingItemView[];
  showTitle: boolean;
}) {
  const [items, setItems] = React.useState(initialItems);
  // StockCheckBody snapshots its rows on mount; bumping the key remounts it
  // with the post-save list.
  const [round, setRound] = React.useState(0);
  const [notice, setNotice] = React.useState<string | null>(null);

  return (
    <main className="flex h-dvh flex-col bg-[var(--color-bg)]">
      {notice ? (
        <div
          role="status"
          className="mx-6 mt-4 flex items-center gap-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-muted)]/40 px-3 py-2 text-sm"
        >
          <CheckCircle2 className="size-4 shrink-0 text-[var(--color-primary)]" />
          <span>{notice}</span>
        </div>
      ) : null}
      <StockCheckBody
        key={round}
        items={items}
        embedded
        showTitle={showTitle}
        onClose={() => setNotice("Keine Änderungen.")}
        onSaved={(updated) => {
          setItems(updated);
          setRound((r) => r + 1);
          setNotice("Gespeichert.");
        }}
      />
    </main>
  );
}

"use client";

import { BellPlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_REMINDER_HOUR,
  MAX_REMINDER_DAYS_BEFORE,
  formatDaysBefore,
  formatReminderHour,
} from "@/lib/reminders/format";
import type { DraftReminder } from "./types";

const SELECT_CLASS =
  "h-11 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]";

const DAY_OPTIONS = Array.from(
  { length: MAX_REMINDER_DAYS_BEFORE + 1 },
  (_, i) => i,
);
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

/**
 * Edits a recipe's advance reminders: per row a lead time (same day … n days
 * before the planned day), an hour and the reminder text.
 */
export function ReminderEditor({
  value,
  onChange,
}: {
  value: DraftReminder[];
  onChange: (next: DraftReminder[]) => void;
}) {
  function update(i: number, patch: Partial<DraftReminder>) {
    onChange(value.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  }

  function add() {
    onChange([
      ...value,
      {
        uid: crypto.randomUUID(),
        daysBefore: 1,
        hour: DEFAULT_REMINDER_HOUR,
        text: "",
      },
    ]);
  }

  return (
    <div className="space-y-2">
      {value.length === 0 ? (
        <p className="text-sm text-[var(--color-muted-fg)]">
          Keine Erinnerungen — z.&nbsp;B. „Kichererbsen einweichen“ am Vortag.
        </p>
      ) : null}
      {value.map((r, i) => (
        <div
          key={r.uid}
          className="flex flex-col gap-2 sm:flex-row sm:items-center"
        >
          <div className="flex gap-2">
            <select
              aria-label="Tag"
              value={r.daysBefore}
              onChange={(e) => update(i, { daysBefore: Number(e.target.value) })}
              className={SELECT_CLASS}
            >
              {DAY_OPTIONS.map((d) => (
                <option key={d} value={d}>
                  {formatDaysBefore(d)}
                </option>
              ))}
            </select>
            <select
              aria-label="Uhrzeit"
              value={r.hour}
              onChange={(e) => update(i, { hour: Number(e.target.value) })}
              className={SELECT_CLASS}
            >
              {HOUR_OPTIONS.map((h) => (
                <option key={h} value={h}>
                  {formatReminderHour(h)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-1 gap-2">
            <Input
              aria-label="Erinnerungstext"
              value={r.text}
              onChange={(e) => update(i, { text: e.target.value })}
              placeholder="Was ist vorzubereiten?"
              className="flex-1"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
              aria-label="Erinnerung entfernen"
              title="Erinnerung entfernen"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={add}>
        <BellPlus className="size-4" />
        Erinnerung hinzufügen
      </Button>
    </div>
  );
}

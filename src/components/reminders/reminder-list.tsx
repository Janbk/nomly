import type { ReactNode } from "react";
import { BellRing } from "lucide-react";
import { formatWeekdayShortDe } from "@/lib/meal-plans/dates";
import type { ReminderOccurrence } from "@/lib/reminders/types";
import { cn } from "@/lib/cn";

/**
 * Highlighted reminder rows for one day — used in the planner's day cell and
 * the dashboard's upcoming-meals card. Each row shows the time, the text and
 * which meal it prepares ("für Hummus (Fr.)" when that meal is on a later
 * day). `renderAction` wraps a row in whatever opens the recipe in the host
 * (planner preview dialog vs. a plain link).
 */
export function ReminderList({
  reminders,
  renderAction,
  className,
}: {
  reminders: ReminderOccurrence[];
  renderAction: (
    reminder: ReminderOccurrence,
    content: ReactNode,
    className: string,
  ) => ReactNode;
  className?: string;
}) {
  if (reminders.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1", className)} aria-label="Erinnerungen">
      {reminders.map((r) => (
        <li key={r.key}>
          {renderAction(
            r,
            <>
              <BellRing className="mt-0.5 size-3.5 shrink-0 text-[var(--color-warning)]" />
              <span className="min-w-0 flex-1">
                <span className="font-semibold tabular-nums">{r.time}</span>{" "}
                <span className="font-medium">{r.text}</span>
                <span className="block truncate text-[11px] text-[var(--color-muted-fg)]">
                  für {r.recipeTitle}
                  {r.mealDate !== r.date
                    ? ` (${formatWeekdayShortDe(r.mealDate)}.)`
                    : null}
                </span>
              </span>
            </>,
            "flex w-full items-start gap-1.5 rounded-[var(--radius)] border border-[var(--color-warning)] border-l-4 bg-[color-mix(in_srgb,var(--color-warning),transparent_88%)] px-2 py-1 text-left text-xs leading-snug text-[var(--color-fg)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-warning),transparent_78%)]",
          )}
        </li>
      ))}
    </ul>
  );
}

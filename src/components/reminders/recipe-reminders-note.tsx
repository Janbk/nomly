import { BellRing } from "lucide-react";
import {
  formatDayMonthDe,
  formatWeekdayShortDe,
} from "@/lib/meal-plans/dates";
import {
  formatReminderHour,
  formatReminderSchedule,
  reminderDate,
} from "@/lib/reminders/format";
import type { RecipeReminderView } from "@/lib/recipes/types";
import { cn } from "@/lib/cn";

/**
 * The recipe's advance reminders as a highlighted "Vorbereitung" note. With a
 * meal in context (`mealDate`), each line also names the concrete day + time
 * ("Do. 12.11., 18:00"); without one it shows the relative schedule only.
 * Hook-free so server pages and client dialogs can both render it.
 */
export function RecipeRemindersNote({
  reminders,
  mealDate = null,
  className,
}: {
  reminders: RecipeReminderView[];
  mealDate?: string | null;
  className?: string;
}) {
  if (reminders.length === 0) return null;
  return (
    <aside
      aria-label="Vorbereitung"
      className={cn(
        "rounded-[var(--radius)] border border-[var(--color-warning)] bg-[color-mix(in_srgb,var(--color-warning),transparent_90%)] px-4 py-3",
        className,
      )}
    >
      <div className="flex items-center gap-2 text-sm font-semibold text-[var(--color-fg)]">
        <BellRing className="size-4 shrink-0 text-[var(--color-warning)]" />
        Vorbereitung
      </div>
      <ul className="mt-1.5 flex flex-col gap-1 pl-6 text-sm">
        {reminders.map((r) => {
          const concrete = mealDate ? reminderDate(mealDate, r.daysBefore) : null;
          return (
            <li key={r.id} className="text-[var(--color-fg)]">
              <span className="font-medium tabular-nums text-[var(--color-muted-fg)]">
                {concrete
                  ? `${formatWeekdayShortDe(concrete)}. ${formatDayMonthDe(concrete)}, ${formatReminderHour(r.hour)}`
                  : formatReminderSchedule(r)}
              </span>
              {" — "}
              {r.text}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}

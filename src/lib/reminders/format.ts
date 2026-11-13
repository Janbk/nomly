/**
 * Client-safe reminder helpers (no DB imports): limits, labels and the
 * reminder-date arithmetic shared by the server service, the recipe view and
 * the recipe form.
 */
import { addDays } from "../meal-plans/dates.ts";

/** Largest supported lead time. Bounds how far past a visible range the
 *  service has to look for meals whose reminders fall into it. */
export const MAX_REMINDER_DAYS_BEFORE = 14;

/** Default hour for a freshly added reminder in the form. */
export const DEFAULT_REMINDER_HOUR = 18;

/** "18:00" */
export function formatReminderHour(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** "Am selben Tag" / "1 Tag vorher" / "3 Tage vorher". */
export function formatDaysBefore(daysBefore: number): string {
  if (daysBefore === 0) return "Am selben Tag";
  if (daysBefore === 1) return "1 Tag vorher";
  return `${daysBefore} Tage vorher`;
}

/** "1 Tag vorher, 18:00" — the relative schedule as shown on the recipe. */
export function formatReminderSchedule(r: {
  daysBefore: number;
  hour: number;
}): string {
  return `${formatDaysBefore(r.daysBefore)}, ${formatReminderHour(r.hour)}`;
}

/** The calendar day a reminder falls on for a meal planned on `mealDate`. */
export function reminderDate(mealDate: string, daysBefore: number): string {
  return addDays(mealDate, -daysBefore);
}

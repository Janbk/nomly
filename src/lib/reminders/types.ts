/**
 * One concrete reminder: a recipe reminder applied to one planned meal.
 * Client-safe (no DB imports) — shipped to the planner, the dashboard and,
 * via the API, to Home Assistant.
 */
export type ReminderOccurrence = {
  /** Stable key per (meal, reminder) pair — `${mealPlanId}-${reminderId}`. */
  key: string;
  reminderId: number;
  mealPlanId: number;
  recipeId: number;
  recipeTitle: string;
  /** Day the reminder is due (ISO YYYY-MM-DD, server-local). */
  date: string;
  /** Local hour (0–23) the reminder is due. */
  hour: number;
  /** `hour` formatted as "18:00". Deliberately no absolute timestamp: the
   *  hour is household wall-clock time, and the server's timezone isn't
   *  guaranteed to match it (consumers like HA combine `date` + `time` in
   *  their own local zone). */
  time: string;
  /** Lead time relative to the meal (0 = the meal day itself). */
  daysBefore: number;
  /** Day the meal itself is planned on. */
  mealDate: string;
  text: string;
};

export type RemindersByDate = Record<string, ReminderOccurrence[]>;

export function groupRemindersByDate(
  reminders: ReminderOccurrence[],
): RemindersByDate {
  const out: RemindersByDate = {};
  for (const r of reminders) (out[r.date] ??= []).push(r);
  return out;
}

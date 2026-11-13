import { and, between, eq } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { mealPlan, recipe, recipeReminder } from "../../db/schema.ts";
import { addDays, isIsoDate } from "../meal-plans/dates.ts";
import {
  MAX_REMINDER_DAYS_BEFORE,
  formatReminderHour,
  reminderDate,
} from "./format.ts";
import type { ReminderOccurrence } from "./types.ts";

export type ListRemindersOptions = {
  /** Only reminders due at this local hour (0–23) — the notification poll. */
  hour?: number;
};

/**
 * Every reminder occurrence whose due day falls within [from, to] (inclusive),
 * derived from the recipes' reminders and the meals planned for them. A meal
 * up to {@link MAX_REMINDER_DAYS_BEFORE} days after `to` can still put a
 * reminder into the range, so the meal window extends that far.
 *
 * Leftover days are skipped: you cooked (and prepared) for the original day.
 *
 * Sorted by due day, hour, then meal order — the order to show and announce.
 */
export function listReminders(
  from: string,
  to: string,
  opts: ListRemindersOptions = {},
): ReminderOccurrence[] {
  if (!isIsoDate(from) || !isIsoDate(to)) {
    throw new Error(`invalid ISO date range: ${from}..${to}`);
  }
  const rows = db
    .select({
      reminderId: recipeReminder.id,
      daysBefore: recipeReminder.daysBefore,
      hour: recipeReminder.hour,
      text: recipeReminder.text,
      reminderSort: recipeReminder.sortOrder,
      mealPlanId: mealPlan.id,
      mealDate: mealPlan.date,
      mealSort: mealPlan.sortOrder,
      recipeId: recipe.id,
      recipeTitle: recipe.title,
    })
    .from(mealPlan)
    .innerJoin(recipe, eq(recipe.id, mealPlan.recipeId))
    .innerJoin(recipeReminder, eq(recipeReminder.recipeId, mealPlan.recipeId))
    .where(
      and(
        between(mealPlan.date, from, addDays(to, MAX_REMINDER_DAYS_BEFORE)),
        eq(mealPlan.isLeftover, false),
      ),
    )
    .all();

  const due = rows
    .map((r) => ({ ...r, date: reminderDate(r.mealDate, r.daysBefore) }))
    .filter(
      (r) =>
        r.date >= from &&
        r.date <= to &&
        (opts.hour === undefined || r.hour === opts.hour),
    );
  due.sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      a.hour - b.hour ||
      a.mealDate.localeCompare(b.mealDate) ||
      a.mealSort - b.mealSort ||
      a.mealPlanId - b.mealPlanId ||
      a.reminderSort - b.reminderSort ||
      a.reminderId - b.reminderId,
  );
  return due.map(
    (r): ReminderOccurrence => ({
      key: `${r.mealPlanId}-${r.reminderId}`,
      reminderId: r.reminderId,
      mealPlanId: r.mealPlanId,
      recipeId: r.recipeId,
      recipeTitle: r.recipeTitle,
      date: r.date,
      hour: r.hour,
      time: formatReminderHour(r.hour),
      daysBefore: r.daysBefore,
      mealDate: r.mealDate,
      text: r.text,
    }),
  );
}

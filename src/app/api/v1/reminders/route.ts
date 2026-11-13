import { NextResponse } from "next/server";
import { isIsoDate } from "@/lib/meal-plans/dates";
import { listReminders } from "@/lib/reminders/service";

/**
 * GET /api/v1/reminders?from=YYYY-MM-DD&to=YYYY-MM-DD[&hour=H]
 *
 * Recipe reminders due within [from, to], derived from the meal plan. With
 * `hour` (0–23) only the ones due at that local hour — what the Home Assistant
 * notification automation polls at the top of every hour (it passes its own
 * date + hour, so clock skew between HA and nomly can't drop a reminder).
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!from || !to || !isIsoDate(from) || !isIsoDate(to)) {
    return NextResponse.json(
      { error: "missing or invalid `from`/`to`" },
      { status: 400 },
    );
  }
  if (from > to) {
    return NextResponse.json({ error: "`from` must be ≤ `to`" }, { status: 400 });
  }
  const rawHour = url.searchParams.get("hour");
  let hour: number | undefined;
  if (rawHour != null && rawHour !== "") {
    hour = Number(rawHour);
    if (!Number.isInteger(hour) || hour < 0 || hour > 23) {
      return NextResponse.json(
        { error: "`hour` must be an integer 0–23" },
        { status: 400 },
      );
    }
  }
  return NextResponse.json({ reminders: listReminders(from, to, { hour }) });
}

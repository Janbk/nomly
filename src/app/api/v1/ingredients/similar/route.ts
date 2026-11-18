import { NextResponse } from "next/server";
import { findSimilarIngredients } from "@/lib/ingredients/similar";

/**
 * GET /api/v1/ingredients/similar?id=<ingredientId>&limit=<n>
 * Articles likely to stand in for the given one (learned substitutions,
 * recipe alternatives, name similarity), best first. Feeds the shopping
 * list's "Ersetzen" picker. `limit` defaults to 8 (max 30).
 */
export function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const id = Number(params.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "missing or invalid `id`" }, { status: 400 });
  }
  const rawLimit = Number(params.get("limit") ?? 8);
  const limit = Number.isInteger(rawLimit) ? Math.min(Math.max(rawLimit, 1), 30) : 8;
  return NextResponse.json({ items: findSimilarIngredients(id, limit) });
}

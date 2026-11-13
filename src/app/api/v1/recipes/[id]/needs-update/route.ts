import { NextResponse } from "next/server";
import { z } from "zod";
import { setRecipeNeedsUpdate } from "@/lib/recipes/service";

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const bodySchema = z.object({
  needsUpdate: z.boolean(),
  /** Optional reason, appended to any existing one. Only used when setting. */
  note: z.string().max(1000).nullable().optional(),
  /** recipe_ingredient rows the recipe was flagged through (shopping list). */
  recipeIngredientIds: z.array(z.number().int().positive()).max(200).optional(),
});

/**
 * Set or clear the recipe's "needs update" reminder (flag + optional reason +
 * flagged ingredient lines). Separate from the full recipe PATCH so the
 * detail-page button is a narrow write that doesn't touch content or
 * `updatedAt`.
 */
export async function PATCH(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "validation" }, { status: 400 });
  }
  const { needsUpdate, note, recipeIngredientIds } = parsed.data;
  const ok = setRecipeNeedsUpdate(id, needsUpdate, { note, recipeIngredientIds });
  if (!ok) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json({ ok: true, needsUpdate });
}

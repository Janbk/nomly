import { NextResponse } from "next/server";
import { z } from "zod";
import { ShoppingApiError } from "@/lib/shopping/items";
import {
  REPLACE_RECIPE_MODES,
  replaceShoppingItemIngredient,
  type ReplaceRecipeMode,
} from "@/lib/shopping/replace";
import { publishShoppingChanged } from "@/lib/shopping/realtime";

const schema = z
  .object({
    newIngredientId: z.number().int().positive(),
    recipes: z
      .array(
        z
          .object({
            recipeId: z.number().int().positive(),
            mode: z.enum(REPLACE_RECIPE_MODES as [ReplaceRecipeMode, ...ReplaceRecipeMode[]]),
          })
          .strict(),
      )
      .max(200)
      .default([]),
    others: z.enum(["replace", "keep"]).optional(),
  })
  .strict();

function parseId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * POST /api/v1/shopping/items/:id/replace
 * "Ersetzen": swap the entry's article for `newIngredientId`, deciding per
 * recipe whether that's a one-off on the list (`once`), also written into the
 * recipe (`replace`), added to the recipe line as an alternative
 * (`alternative`), made the line's main ingredient with the old one as
 * alternative (`primary`), or not done at all (`skip`). See
 * lib/shopping/replace.ts.
 */
export async function POST(
  request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id: rawId } = await ctx.params;
  const id = parseId(rawId);
  if (!id) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation", details: parsed.error.flatten() },
      { status: 400 },
    );
  }
  try {
    const result = replaceShoppingItemIngredient(id, parsed.data);
    publishShoppingChanged();
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ShoppingApiError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    throw err;
  }
}

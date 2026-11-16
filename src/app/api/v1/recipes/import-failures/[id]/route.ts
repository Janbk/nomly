import { NextResponse } from "next/server";

import {
  getImportFailure,
  removeImportFailure,
} from "@/lib/recipes/import-failures";

type Ctx = { params: Promise<{ id: string }> };

async function parseId(ctx: Ctx): Promise<number | null> {
  const { id: raw } = await ctx.params;
  const id = Number.parseInt(raw, 10);
  return Number.isFinite(id) ? id : null;
}

/** GET — a single entry. */
export async function GET(_request: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  const failure = id == null ? null : getImportFailure(id);
  if (!failure) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(failure);
}

/** DELETE — remove one entry from the list. */
export async function DELETE(_request: Request, ctx: Ctx) {
  const id = await parseId(ctx);
  if (id == null || !removeImportFailure(id)) {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";

import {
  listImportFailures,
  removeAllImportFailures,
} from "@/lib/recipes/import-failures";

/** GET — every URL whose import failed, most recently attempted first. */
export function GET() {
  return NextResponse.json({ failures: listImportFailures() });
}

/** DELETE — clear the whole list. */
export function DELETE() {
  const removed = removeAllImportFailures();
  return NextResponse.json({ ok: true, removed });
}

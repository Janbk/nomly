import { describe, it, expect, afterAll, beforeAll, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";

const tempDir = mkdtempSync(join(tmpdir(), "nomly-import-failures-"));
process.env.DATABASE_URL = join(tempDir, "test.db");
{
  const sqlite = new Database(process.env.DATABASE_URL);
  migrate(drizzle(sqlite), { migrationsFolder: "./drizzle" });
  sqlite.close();
}

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

let svc: typeof import("@/lib/recipes/import-failures");
let listRoute: typeof import("@/app/api/v1/recipes/import-failures/route");
let itemRoute: typeof import("@/app/api/v1/recipes/import-failures/[id]/route");

beforeAll(async () => {
  svc = await import("@/lib/recipes/import-failures");
  listRoute = await import("@/app/api/v1/recipes/import-failures/route");
  itemRoute = await import("@/app/api/v1/recipes/import-failures/[id]/route");
});

beforeEach(() => {
  svc.removeAllImportFailures();
});

const ctx = (id: number | string) => ({
  params: Promise.resolve({ id: String(id) }),
});

describe("import failures", () => {
  it("upserts per URL, bumping attempts and refreshing the error", () => {
    const a = svc.recordImportFailure("https://x.test/r", "noRecipe", "first");
    const b = svc.recordImportFailure(" https://x.test/r ", "fetch", "second");
    expect(b.id).toBe(a.id);
    const [row] = svc.listImportFailures();
    expect(row).toMatchObject({
      url: "https://x.test/r",
      errorCode: "fetch",
      errorMessage: "second",
      attempts: 2,
    });
  });

  it("clears an entry when that URL imports successfully", () => {
    svc.recordImportFailure("https://x.test/a", "noRecipe", "m");
    svc.recordImportFailure("https://x.test/b", "noRecipe", "m");
    svc.clearImportFailureForUrl("https://x.test/a");
    expect(svc.listImportFailures().map((f) => f.url)).toEqual([
      "https://x.test/b",
    ]);
  });

  it("lists and deletes via the API routes", async () => {
    const { id } = svc.recordImportFailure("https://x.test/a", "parse", "m");
    svc.recordImportFailure("https://x.test/b", "parse", "m");

    const list = await listRoute.GET().json();
    expect(list.failures).toHaveLength(2);

    const one = await itemRoute.GET(new Request("http://t"), ctx(id));
    expect((await one.json()).url).toBe("https://x.test/a");

    const del = await itemRoute.DELETE(new Request("http://t"), ctx(id));
    expect(del.status).toBe(200);
    const again = await itemRoute.DELETE(new Request("http://t"), ctx(id));
    expect(again.status).toBe(404);
    expect(svc.listImportFailures()).toHaveLength(1);

    const all = await listRoute.DELETE().json();
    expect(all.removed).toBe(1);
    expect(svc.listImportFailures()).toEqual([]);
  });
});

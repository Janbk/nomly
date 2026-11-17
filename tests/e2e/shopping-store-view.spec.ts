import { resolve } from "node:path";

import Database from "better-sqlite3";
import { expect, test, type Locator, type Page } from "@playwright/test";

import { E2E_CONFIG } from "./support/config.ts";

/**
 * The shopping list with a store selected: swipe gestures act on release, a
 * "heute nicht da" item stays on the unfiltered list, and the learned-order
 * switch is one device-wide setting.
 */
const OPEN_ROWS = '[role="tabpanel"][data-state="active"] [data-shopping-row]';

test.use({ hasTouch: true, viewport: { width: 400, height: 900 } });

/** A store carrying every category, so every seeded row shows there. */
function createStore(name: string): number {
  const db = new Database(resolve(E2E_CONFIG.databaseUrl));
  try {
    const id = Number(
      db.prepare("INSERT INTO supermarket (name) VALUES (?)").run(name).lastInsertRowid,
    );
    const cats = db.prepare("SELECT id FROM category ORDER BY id").all() as { id: number }[];
    const ins = db.prepare(
      "INSERT INTO supermarket_category (supermarket_id, category_id, sort_order) VALUES (?, ?, ?)",
    );
    cats.forEach((c, i) => ins.run(id, c.id, i));
    return id;
  } finally {
    db.close();
  }
}

/** A horizontal touch drag over `row` by `dx` px, then release. */
async function swipe(row: Locator, dx: number): Promise<void> {
  await row.evaluate(async (el, dx) => {
    const r = el.getBoundingClientRect();
    const x0 = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const touch = (x: number) =>
      new Touch({ identifier: 1, target: el, clientX: x, clientY: y });
    const fire = (type: string, x: number) => {
      const t = touch(x);
      el.dispatchEvent(
        new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: type === "touchend" ? [] : [t],
          changedTouches: [t],
        }),
      );
    };
    fire("touchstart", x0);
    for (let i = 1; i <= 10; i++) {
      fire("touchmove", x0 + (dx * i) / 10);
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    fire("touchend", x0 + dx);
  }, dx);
}

async function rowNames(page: Page): Promise<string[]> {
  return page
    .locator(OPEN_ROWS)
    .locator("[data-item-name]")
    .allInnerTexts();
}

test("swipe left marks 'heute nicht da' on release; the item stays on the unfiltered list", async ({
  page,
}) => {
  const storeId = createStore("E2E-Markt Swipe");
  await page.goto(`/einkauf?supermarket=${storeId}`, { waitUntil: "networkidle" });
  await expect(page.locator(OPEN_ROWS).first()).toBeVisible();
  const before = await rowNames(page);
  expect(before.length).toBeGreaterThan(1);
  const name = before[0];

  await swipe(page.locator(OPEN_ROWS).first(), -150);
  // No confirming tap: the row leaves the store's open list at once.
  await expect.poll(() => rowNames(page)).not.toContain(name);
  await expect(page.getByRole("tab", { name: /Nicht verfügbar/ })).toBeVisible();

  // A short swipe does nothing.
  const next = (await rowNames(page))[0];
  await swipe(page.locator(OPEN_ROWS).first(), -40);
  await expect.poll(() => rowNames(page)).toContain(next);

  // Without a store filter the skipped item is on the list again.
  await page.getByRole("button", { name: "Supermarkt-Filter zurücksetzen" }).click();
  await expect.poll(() => rowNames(page)).toContain(name);

  // …and after a reload, too.
  await page.reload({ waitUntil: "networkidle" });
  await expect.poll(() => rowNames(page)).toContain(name);
});

test("keeps the learned-order switch across stores and reloads", async ({ page }) => {
  const a = createStore("E2E-Markt A");
  const b = createStore("E2E-Markt B");
  const toggle = page.getByRole("button", { name: "Gelernte Reihenfolge" });

  await page.goto(`/einkauf?supermarket=${a}`, { waitUntil: "networkidle" });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("combobox", { name: "Supermarkt" }).selectOption(String(b));
  await expect(toggle).toHaveAttribute("aria-pressed", "true");

  await page.reload({ waitUntil: "networkidle" });
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
});

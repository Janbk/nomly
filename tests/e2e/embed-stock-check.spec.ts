import { expect, test } from "@playwright/test";

import { E2E_CONFIG } from "./support/config.ts";

/**
 * The "Auf Lager prüfen" form as the Home Assistant kitchen dashboard shows it:
 * /embed/lager in a browser_mod popup iframe, authenticated only by the embed
 * token in `?k=`. Covers the whole chain the unit tests can't: proxy token
 * exchange → embed cookie → the stock endpoints getting through the embed
 * scope (and nothing else), plus the popup-sized layout.
 */
test.use({
  // No OIDC session: the embed cookie must be the only credential.
  storageState: { cookies: [], origins: [] },
  // Roughly the HA popup's iframe.
  viewport: { width: 1000, height: 800 },
});

test("stock check embed loads, saves and keeps the footer in view", async ({
  page,
}) => {
  await page.goto(`/embed/lager?k=${E2E_CONFIG.embedToken}&title=0`);

  // The token is swapped for the cookie and stripped from the URL.
  await expect(page).toHaveURL(/\/embed\/lager\?title=0$/);
  // title=0 → the popup header carries the title, the page doesn't.
  await expect(page.getByRole("heading", { name: "Auf Lager prüfen" })).toHaveCount(0);
  // Outside a dialog there is nothing to cancel.
  await expect(page.getByRole("button", { name: "Abbrechen" })).toHaveCount(0);

  const save = page.getByRole("button", { name: "Speichern" });
  await expect(save).toBeInViewport();

  const input = page.getByRole("textbox", { name: /^Auf Lager: / }).first();
  const label = await input.getAttribute("aria-label");
  await input.fill("0,5");
  await save.click();

  await expect(page.getByRole("status")).toHaveText("Gespeichert.");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Persisted: a fresh load (cookie only, no token) shows the saved amount.
  await page.goto("/embed/lager");
  await expect(page.getByRole("heading", { name: "Auf Lager prüfen" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: label! })).toHaveValue("0.5");

  // The embed cookie still only reaches the allow-list.
  expect((await page.request.get("/api/v1/shopping")).status()).toBe(403);
  expect((await page.request.get("/einkauf")).status()).toBe(403);
});

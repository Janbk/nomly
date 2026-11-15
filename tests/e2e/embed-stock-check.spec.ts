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
  // The touch stepper next to the field.
  await page.getByRole("button", { name: label!.replace("Auf Lager", "Mehr auf Lager"), exact: true }).click();
  await expect(input).toHaveValue("1,5");
  await save.click();

  await expect(page.getByRole("status")).toHaveText("Gespeichert.");
  await expect(page.getByRole("alert")).toHaveCount(0);

  // Persisted: a fresh load (cookie only, no token) shows the saved amount.
  await page.goto("/embed/lager");
  await expect(page.getByRole("heading", { name: "Auf Lager prüfen" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: label!, exact: true })).toHaveValue("1.5");

  // The embed cookie still only reaches the allow-list.
  expect((await page.request.get("/api/v1/shopping")).status()).toBe(403);
  expect((await page.request.get("/einkauf")).status()).toBe(403);
});

/**
 * In the HA popup the iframe can't close the dialog itself, so a finished save
 * posts `nomly:close-popup` to the parent (HA answers with
 * browser_mod.close_popup — see docs/home-assistant.md). A host page on the
 * app's own origin stands in for HA: frame-ancestors always allows 'self'.
 * The service worker is blocked so page.route sees the iframe's API calls.
 */
test.describe("stock check embed in a frame", () => {
  test.use({ serviceWorkers: "block" });

  test("asks the parent to close on save, also without changes, not on failure", async ({
    page,
  }) => {
    await page.route("**/__ha-host", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: `<!doctype html><title>HA</title>
<script>
  window.__msgs = [];
  window.addEventListener("message", (e) => window.__msgs.push({ origin: e.origin, data: e.data }));
</script>
<iframe src="/embed/lager?k=${E2E_CONFIG.embedToken}&title=0" style="width:1000px;height:760px;border:0"></iframe>`,
      }),
    );
    await page.goto("/__ha-host");
    const frame = page.frameLocator("iframe");
    const save = frame.getByRole("button", { name: "Speichern" });
    const messages = () => page.evaluate(() => (window as unknown as { __msgs: unknown[] }).__msgs);
    const closeMessage = {
      origin: new URL(page.url()).origin,
      data: { type: "nomly:close-popup", source: "stock-check" },
    };

    // Nothing changed: "Speichern" still means "done".
    await expect(save).toBeEnabled();
    await save.click();
    await expect(frame.getByRole("status")).toHaveText("Keine Änderungen.");
    await expect.poll(messages).toEqual([closeMessage]);

    // A failed save keeps the popup (and the error) open.
    await page.route("**/api/v1/shopping/stock", (route) =>
      route.request().method() === "POST"
        ? route.fulfill({ status: 500, body: "nope" })
        : route.fallback(),
    );
    const input = frame.getByRole("textbox", { name: /^Auf Lager: / }).first();
    await input.fill("2");
    await save.click();
    await expect(frame.getByText("Speichern fehlgeschlagen.", { exact: false })).toBeVisible();
    expect(await messages()).toEqual([closeMessage]);

    // A successful save asks again.
    await page.unroute("**/api/v1/shopping/stock");
    await save.click();
    await expect(frame.getByRole("status")).toHaveText("Gespeichert.");
    await expect.poll(messages).toEqual([closeMessage, closeMessage]);
  });
});

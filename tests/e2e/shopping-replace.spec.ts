import { resolve } from "node:path";

import Database from "better-sqlite3";
import { expect, test } from "@playwright/test";

import { E2E_CONFIG } from "./support/config.ts";

/**
 * "Ersetzen" on a shopping-list row: similar articles are suggested, and after
 * picking one each recipe the entry came from gets its own decision — here one
 * recipe takes the swap into the recipe, the other is skipped and keeps the
 * old article on the list.
 */
test.use({ viewport: { width: 400, height: 900 } });

type Seeded = { itemId: number; bowlRowId: number; pfanneRowId: number };

function seedTofu(): Seeded {
  const db = new Database(resolve(E2E_CONFIG.databaseUrl));
  try {
    const ingredientId = (name: string): number => {
      const hit = db.prepare("SELECT id FROM ingredient WHERE name = ?").get(name) as
        | { id: number }
        | undefined;
      if (hit) return hit.id;
      return Number(
        db.prepare("INSERT INTO ingredient (name) VALUES (?)").run(name).lastInsertRowid,
      );
    };
    const raeucher = ingredientId("Räuchertofu");
    ingredientId("Frittierter Tofu");
    ingredientId("Seidentofu");

    const recipe = (title: string): { recipeId: number; rowId: number; mealId: number; date: string } => {
      const recipeId = Number(
        db.prepare("INSERT INTO recipe (title, servings) VALUES (?, 2)").run(title).lastInsertRowid,
      );
      const sectionId = Number(
        db.prepare("INSERT INTO recipe_section (recipe_id) VALUES (?)").run(recipeId).lastInsertRowid,
      );
      const rowId = Number(
        db
          .prepare(
            "INSERT INTO recipe_ingredient (section_id, ingredient_id, display_name, quantity, sort_order) VALUES (?, ?, 'Räuchertofu', 200, 0)",
          )
          .run(sectionId, raeucher).lastInsertRowid,
      );
      const date = "2026-12-01";
      const mealId = Number(
        db.prepare("INSERT INTO meal_plan (recipe_id, date) VALUES (?, ?)").run(recipeId, date)
          .lastInsertRowid,
      );
      return { recipeId, rowId, mealId, date };
    };
    const bowl = recipe("E2E Tofu-Bowl");
    const pfanne = recipe("E2E Tofu-Pfanne");

    const itemId = Number(
      db
        .prepare(
          "INSERT INTO shopping_item (ingredient_id, checked, sort_order) VALUES (?, 0, 100)",
        )
        .run(raeucher).lastInsertRowid,
    );
    const src = db.prepare(
      "INSERT INTO shopping_item_source (item_id, meal_plan_id, recipe_ingredient_id, recipe_id, recipe_title, meal_date, contributed_quantity) VALUES (?, ?, ?, ?, ?, ?, 200)",
    );
    src.run(itemId, bowl.mealId, bowl.rowId, bowl.recipeId, "E2E Tofu-Bowl", bowl.date);
    src.run(itemId, pfanne.mealId, pfanne.rowId, pfanne.recipeId, "E2E Tofu-Pfanne", pfanne.date);
    return { itemId, bowlRowId: bowl.rowId, pfanneRowId: pfanne.rowId };
  } finally {
    db.close();
  }
}

function read<T>(sql: string, ...params: unknown[]): T {
  const db = new Database(resolve(E2E_CONFIG.databaseUrl), { readonly: true });
  try {
    return db.prepare(sql).get(...params) as T;
  } finally {
    db.close();
  }
}

test("replace suggests similar articles and applies a decision per recipe", async ({ page }) => {
  const seeded = seedTofu();
  await page.goto("/einkauf", { waitUntil: "networkidle" });

  const row = page.locator("[data-shopping-row]", {
    has: page.locator("[data-item-name]", { hasText: /^Räuchertofu$/ }),
  });
  await expect(row).toBeVisible();
  await row.getByRole("button", { name: "Aktionen" }).click();
  await page.getByRole("menuitem", { name: /Ersetzen/ }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: /Räuchertofu.*ersetzen/ })).toBeVisible();
  const suggestions = dialog.getByTestId("replace-suggestions");
  await expect(suggestions.getByRole("button", { name: /Frittierter Tofu/ })).toBeVisible();
  await expect(suggestions.getByRole("button", { name: /Seidentofu/ })).toBeVisible();

  await suggestions.getByRole("button", { name: /Frittierter Tofu/ }).click();

  const recipes = dialog.getByTestId("replace-recipes");
  await expect(recipes.locator("li")).toHaveCount(2);
  await recipes
    .getByRole("radiogroup", { name: /E2E Tofu-Bowl/ })
    .getByRole("radio", { name: "Im Rezept ersetzen" })
    .click();
  await recipes
    .getByRole("radiogroup", { name: /E2E Tofu-Pfanne/ })
    .getByRole("radio", { name: "Überspringen" })
    .click();
  await dialog.getByRole("button", { name: "Ersetzen", exact: true }).click();
  await expect(dialog).toBeHidden();

  // The list: the bowl's tofu moved to the new article, the skipped recipe
  // keeps Räuchertofu.
  const newRow = page.locator("[data-shopping-row]", {
    has: page.locator("[data-item-name]", { hasText: /^Frittierter Tofu$/ }),
  });
  await expect(newRow).toContainText("E2E Tofu-Bowl");
  await expect(row).toContainText("E2E Tofu-Pfanne");
  await expect(row).not.toContainText("E2E Tofu-Bowl");

  // The recipes: only the bowl's line was rewritten.
  const bowlLine = read<{ name: string }>(
    "SELECT i.name FROM recipe_ingredient ri JOIN ingredient i ON i.id = ri.ingredient_id WHERE ri.id = ?",
    seeded.bowlRowId,
  );
  expect(bowlLine.name).toBe("Frittierter Tofu");
  const pfanneLine = read<{ name: string }>(
    "SELECT i.name FROM recipe_ingredient ri JOIN ingredient i ON i.id = ri.ingredient_id WHERE ri.id = ?",
    seeded.pfanneRowId,
  );
  expect(pfanneLine.name).toBe("Räuchertofu");

  await page.screenshot({ path: "test-results/shopping-replace-after.png" });
});

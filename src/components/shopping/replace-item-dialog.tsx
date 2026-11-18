"use client";

import * as React from "react";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  CreateArticleDialog,
  type CreatedArticle,
} from "@/components/ingredients/create-article-dialog";
import type { AutocompleteHit, ShoppingItemView } from "@/lib/shopping/items";
import { formatQty } from "@/lib/shopping/format";
import { formatMealDate } from "@/lib/shopping/recipe-days";
import { cn } from "@/lib/cn";
import {
  autocomplete,
  fetchSimilarIngredients,
  replaceItemIngredient,
  type ReplaceRecipeMode,
  type SimilarIngredient,
} from "./api";

/**
 * "Ersetzen" from a shopping-list row: the article turned out to be the wrong
 * one in the shop. Step 1 picks the replacement (similar articles suggested,
 * any article searchable, a new one creatable); step 2 decides per recipe the
 * entry came from what happens — just this list, also in the recipe, added as
 * an alternative, made the main ingredient, or skipped (keeps the old article,
 * also on the list).
 */
export function ReplaceItemDialog({
  item,
  onClose,
  onReplaced,
}: {
  item: ShoppingItemView | null;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog
      open={item != null}
      onOpenChange={(v) => (!v && !busy ? onClose() : undefined)}
    >
      <DialogContent className="sm:max-w-lg">
        {/* Keyed per item so both steps start fresh. */}
        {item ? (
          <ReplaceFlow
            key={item.id}
            item={item}
            busy={busy}
            setBusy={setBusy}
            onClose={onClose}
            onReplaced={onReplaced}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

type Choice = { id: number; name: string };

function ReplaceFlow({
  item,
  busy,
  setBusy,
  onClose,
  onReplaced,
}: {
  item: ShoppingItemView;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const [choice, setChoice] = React.useState<Choice | null>(null);
  if (choice == null) {
    return <PickStep item={item} onPick={setChoice} onClose={onClose} />;
  }
  return (
    <RecipesStep
      item={item}
      choice={choice}
      busy={busy}
      setBusy={setBusy}
      onBack={() => setChoice(null)}
      onClose={onClose}
      onReplaced={onReplaced}
    />
  );
}

// ---------------------------------------------------------------------------
// Step 1: pick the replacement
// ---------------------------------------------------------------------------

function PickStep({
  item,
  onPick,
  onClose,
}: {
  item: ShoppingItemView;
  onPick: (c: Choice) => void;
  onClose: () => void;
}) {
  const [suggestions, setSuggestions] = React.useState<SimilarIngredient[] | null>(null);
  const [query, setQuery] = React.useState("");
  const [hits, setHits] = React.useState<AutocompleteHit[] | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    fetchSimilarIngredients(item.refId)
      .then((list) => {
        if (!cancelled) setSuggestions(list);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      });
    return () => {
      cancelled = true;
    };
  }, [item.refId]);

  const reqCounter = React.useRef(0);
  React.useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setHits(null);
      return;
    }
    const reqId = ++reqCounter.current;
    const handle = setTimeout(async () => {
      try {
        const res = await autocomplete(q);
        if (reqCounter.current === reqId) setHits(res);
      } catch {
        // ignore — the list just stays as it was
      }
    }, 150);
    return () => clearTimeout(handle);
  }, [query]);

  const searching = query.trim().length > 0;
  const searchHits = (hits ?? []).filter((h) => h.id !== item.refId);

  return (
    <>
      <DialogHeader>
        <DialogTitle>„{item.name}“ ersetzen</DialogTitle>
        <DialogDescription>
          Wodurch? Danach entscheidest du pro Rezept, ob der Ersatz nur auf der
          Liste gilt oder auch ins Rezept übernommen wird.
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-muted-fg)]" />
          <Input
            aria-label="Artikel suchen"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Anderen Artikel suchen …"
            className="pl-9"
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              if (searchHits.length > 0) {
                onPick({ id: searchHits[0].id, name: searchHits[0].name });
              } else if (hits != null && query.trim().length > 0) {
                setCreateOpen(true);
              }
            }}
          />
        </div>

        {searching ? (
          hits == null ? (
            <p className="text-sm text-[var(--color-muted-fg)]">Suche …</p>
          ) : (
            <ul className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]">
              {searchHits.map((h) => (
                <li key={h.id}>
                  <ChoiceButton
                    name={h.name}
                    detail={h.matchedAlias ? `Alias: ${h.matchedAlias}` : h.categoryName ?? null}
                    onClick={() => onPick({ id: h.id, name: h.name })}
                  />
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setCreateOpen(true)}
                  className="block w-full px-3 py-2.5 text-left text-sm text-[var(--color-muted-fg)] hover:bg-[var(--color-muted)]"
                >
                  „{query.trim()}“ als neuen Artikel anlegen …
                </button>
              </li>
            </ul>
          )
        ) : (
          <section className="flex flex-col gap-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">
              Ähnliche Artikel
            </h3>
            {suggestions == null ? (
              <p className="text-sm text-[var(--color-muted-fg)]">Lädt …</p>
            ) : suggestions.length === 0 ? (
              <p className="text-sm text-[var(--color-muted-fg)]">
                Keine Vorschläge — such oben nach dem passenden Artikel.
              </p>
            ) : (
              <ul
                data-testid="replace-suggestions"
                className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]"
              >
                {suggestions.map((sug) => (
                  <li key={sug.id}>
                    <ChoiceButton
                      name={sug.name}
                      detail={suggestionHint(sug)}
                      onClick={() => onPick({ id: sug.id, name: sug.name })}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onClose}>
          Abbrechen
        </Button>
      </DialogFooter>
      <CreateArticleDialog
        open={createOpen}
        initialName={query.trim()}
        onClose={() => setCreateOpen(false)}
        onCreated={(a: CreatedArticle) => {
          setCreateOpen(false);
          onPick({ id: a.id, name: a.name });
        }}
      />
    </>
  );
}

function ChoiceButton({
  name,
  detail,
  onClick,
}: {
  name: string;
  detail: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-muted)] focus-visible:bg-[var(--color-muted)] focus-visible:outline-none"
    >
      <span className="flex min-w-0 flex-col">
        <span className="font-medium">{name}</span>
        {detail ? (
          <span className="text-xs text-[var(--color-muted-fg)]">{detail}</span>
        ) : null}
      </span>
      <ArrowRight className="size-4 shrink-0 text-[var(--color-muted-fg)]" />
    </button>
  );
}

/** Why a suggestion is there, in words — the strongest reason first. */
export function suggestionHint(s: SimilarIngredient): string | null {
  const parts: string[] = [];
  for (const r of s.reasons) {
    if (r === "substitution" && s.substitutionUses > 0) {
      parts.push(
        s.substitutionUses === 1 ? "schon einmal ersetzt" : `schon ${s.substitutionUses}× ersetzt`,
      );
    } else if (r === "alternative" && s.alternativeRecipes > 0) {
      parts.push(
        s.alternativeRecipes === 1
          ? "Alternative in 1 Rezept"
          : `Alternative in ${s.alternativeRecipes} Rezepten`,
      );
    }
  }
  if (parts.length === 0 && s.categoryName) parts.push(s.categoryName);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// ---------------------------------------------------------------------------
// Step 2: per recipe
// ---------------------------------------------------------------------------

const MODES: Array<{ mode: ReplaceRecipeMode; label: string; hint: string }> = [
  { mode: "once", label: "Nur Liste", hint: "Nur auf dieser Einkaufsliste ersetzen" },
  { mode: "replace", label: "Im Rezept ersetzen", hint: "Auch im Rezept austauschen" },
  {
    mode: "alternative",
    label: "Als Alternative",
    hint: "Im Rezept als Alternative hinzufügen",
  },
  {
    mode: "primary",
    label: "Als Hauptzutat",
    hint: "Im Rezept zur Hauptzutat machen, die alte bleibt als Alternative",
  },
  {
    mode: "skip",
    label: "Überspringen",
    hint: "Nicht ersetzen — bleibt auch auf der Liste die alte Zutat",
  },
];

type RecipeEntry = {
  recipeId: number;
  title: string;
  /** "Fr 21.11. · 200 g" per contributing meal. */
  lines: string[];
};

function recipeEntries(item: ShoppingItemView): RecipeEntry[] {
  const byRecipe = new Map<number, RecipeEntry>();
  for (const s of item.sources) {
    if (s.recipeId == null) continue;
    const e =
      byRecipe.get(s.recipeId) ??
      { recipeId: s.recipeId, title: s.recipeTitle ?? "Rezept", lines: [] };
    const amount =
      s.contributedQuantity != null
        ? `${formatQty(s.contributedQuantity)}${s.contributedUnit ? ` ${s.contributedUnit}` : ""}`
        : null;
    const date = s.mealDate ? formatMealDate(s.mealDate) : null;
    const line = [date, amount].filter(Boolean).join(" · ");
    if (line) e.lines.push(line);
    byRecipe.set(s.recipeId, e);
  }
  return [...byRecipe.values()];
}

/** Non-recipe contributions: manual amounts, staple groups, and meal sources
 *  whose recipe was deleted. */
function otherLabels(item: ShoppingItemView): string[] {
  const out: string[] = [];
  if (item.manualAmounts.length > 0) out.push("Manuell");
  for (const s of item.stapleSources) {
    if (s.stapleGroupName && !out.includes(s.stapleGroupName)) out.push(s.stapleGroupName);
  }
  for (const s of item.sources) {
    if (s.recipeId == null) {
      const t = s.recipeTitle ?? "Gelöschtes Rezept";
      if (!out.includes(t)) out.push(t);
    }
  }
  return out;
}

function RecipesStep({
  item,
  choice,
  busy,
  setBusy,
  onBack,
  onClose,
  onReplaced,
}: {
  item: ShoppingItemView;
  choice: Choice;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onBack: () => void;
  onClose: () => void;
  onReplaced: () => void;
}) {
  const recipes = React.useMemo(() => recipeEntries(item), [item]);
  const others = React.useMemo(() => otherLabels(item), [item]);
  const [modes, setModes] = React.useState<Map<number, ReplaceRecipeMode>>(
    () => new Map(recipes.map((r) => [r.recipeId, "once"])),
  );
  const [keepOthers, setKeepOthers] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const setMode = (recipeId: number, mode: ReplaceRecipeMode) =>
    setModes((prev) => new Map(prev).set(recipeId, mode));
  const setAll = (mode: ReplaceRecipeMode) =>
    setModes(new Map(recipes.map((r) => [r.recipeId, mode])));

  const allSame = (() => {
    const vals = [...modes.values()];
    return vals.length > 0 && vals.every((v) => v === vals[0]) ? vals[0] : null;
  })();
  const nothingToDo =
    recipes.every((r) => modes.get(r.recipeId) === "skip") &&
    (others.length === 0 || keepOthers) &&
    recipes.length + others.length > 0;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await replaceItemIngredient(item.id, {
        newIngredientId: choice.id,
        recipes: recipes.map((r) => ({
          recipeId: r.recipeId,
          mode: modes.get(r.recipeId) ?? "once",
        })),
        others: keepOthers ? "keep" : "replace",
      });
      onReplaced();
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fehler beim Ersetzen");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>
          „{item.name}“ → „{choice.name}“
        </DialogTitle>
        <DialogDescription>
          {recipes.length === 0
            ? "Der Eintrag wird auf der Einkaufsliste ersetzt."
            : recipes.length === 1
              ? "Was soll mit dem Rezept passieren?"
              : "Was soll mit den betroffenen Rezepten passieren?"}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="flex flex-col gap-3">
        {recipes.length > 1 ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--color-muted-fg)]">
              Für alle
            </span>
            <ModeChips
              label="Für alle Rezepte"
              value={allSame}
              onChange={setAll}
              options={MODES}
            />
          </div>
        ) : null}
        {recipes.length > 0 ? (
          <ul
            data-testid="replace-recipes"
            className="flex flex-col divide-y divide-[var(--color-border)] rounded-[var(--radius)] border border-[var(--color-border)]"
          >
            {recipes.map((r) => {
              const mode = modes.get(r.recipeId) ?? "once";
              return (
                <li
                  key={r.recipeId}
                  data-recipe-id={r.recipeId}
                  className="flex flex-col gap-2 px-3 py-2.5"
                >
                  <div className="flex flex-col">
                    <span className="font-medium">{r.title}</span>
                    {r.lines.length > 0 ? (
                      <span className="text-xs text-[var(--color-muted-fg)]">
                        {r.lines.join(", ")}
                      </span>
                    ) : null}
                  </div>
                  <ModeChips
                    label={`Ersetzen in „${r.title}“`}
                    value={mode}
                    onChange={(m) => setMode(r.recipeId, m)}
                    options={MODES}
                  />
                  <span className="text-xs text-[var(--color-muted-fg)]">
                    {MODES.find((m) => m.mode === mode)?.hint}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : null}
        {others.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-[var(--radius)] border border-[var(--color-border)] px-3 py-2.5">
            <div className="flex flex-col">
              <span className="font-medium">Weitere Mengen</span>
              <span className="text-xs text-[var(--color-muted-fg)]">{others.join(", ")}</span>
            </div>
            <ModeChips
              label="Weitere Mengen"
              value={keepOthers ? "keep" : "replace"}
              onChange={(v) => setKeepOthers(v === "keep")}
              options={[
                { mode: "replace", label: "Ersetzen", hint: "" },
                { mode: "keep", label: "Behalten", hint: "" },
              ]}
            />
          </div>
        ) : null}
        {item.stock?.quantity != null ? (
          <p className="text-xs text-[var(--color-muted-fg)]">
            „Auf Lager“ bleibt bei „{item.name}“.
          </p>
        ) : null}
        {error ? <p className="text-sm text-[var(--color-danger)]">{error}</p> : null}
      </DialogBody>
      <DialogFooter>
        <Button variant="ghost" onClick={onBack} disabled={busy} className="sm:mr-auto">
          <ArrowLeft />
          Anderer Artikel
        </Button>
        <Button variant="ghost" onClick={onClose} disabled={busy}>
          Abbrechen
        </Button>
        <Button onClick={() => void submit()} disabled={busy || nothingToDo}>
          {busy ? "Ersetzt …" : "Ersetzen"}
        </Button>
      </DialogFooter>
    </>
  );
}

function ModeChips<T extends string>({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: T | null;
  onChange: (v: T) => void;
  options: Array<{ mode: T; label: string; hint: string }>;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const active = o.mode === value;
        return (
          <button
            key={o.mode}
            type="button"
            role="radio"
            aria-checked={active}
            title={o.hint || undefined}
            onClick={() => onChange(o.mode)}
            className={cn(
              "rounded-full border px-3 py-1 text-sm transition-colors",
              active
                ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-[var(--color-accent-fg)]"
                : "border-[var(--color-border)] bg-[var(--color-bg)] hover:bg-[var(--color-muted)]",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

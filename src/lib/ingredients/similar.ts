import { sql } from "drizzle-orm";
import { db } from "../../db/index.ts";
import { unaccent } from "../autocomplete.ts";

/**
 * "Similar ingredients" for the shopping list's "Ersetzen" flow: when an
 * article turns out to be the wrong one in the shop, which other articles is
 * the user likely to grab instead? Nothing here is a hand-kept list — every
 * signal is read from the data, so suggestions follow the catalogue and the
 * household's habits:
 *
 *   1. Learned substitutions (`ingredient_substitution`): pairs the user has
 *      swapped before via "Ersetzen". Strongest signal.
 *   2. Recipe alternatives: two articles that appear as primary/alternative of
 *      the same recipe line ("Räuchertofu oder Jackfruit"), or as two
 *      alternatives of one primary (siblings, weaker).
 *   3. Name similarity on canonical names and aliases, tuned for German
 *      compounds: the head noun sits at the end ("Räuchertofu" ↔ "Frittierter
 *      Tofu" ↔ "Seidentofu"), adjectives in front don't count on their own.
 *   4. Same default category — only as a booster for a name match, never on
 *      its own (it would flood the list with "Obst und Gemüse").
 *
 * Ties break on how often the article is used in recipes.
 */

export type SimilarReason = "substitution" | "alternative" | "sibling" | "name";

export type SimilarIngredient = {
  id: number;
  name: string;
  categoryName: string | null;
  score: number;
  /** Why it was suggested, strongest first — the UI turns these into hints. */
  reasons: SimilarReason[];
  /** Times the user replaced the target with this article before. */
  substitutionUses: number;
  /** Recipes in which the two appear as primary/alternative of one line. */
  alternativeRecipes: number;
};

// ---------------------------------------------------------------------------
// Name similarity (pure)
// ---------------------------------------------------------------------------

type NameShape = {
  /** Stems of the head nouns: the last word of the main part, plus words in
   *  parentheses ("Colby (Käse)" → "kas"). */
  heads: string[];
  /** Stems of every other word (adjectives, qualifiers after a comma). */
  others: string[];
};

/** Words that carry no identity on their own ("Veganer Käse" and "Veganer
 *  Frischkäse" are related through "Käse", not through "veganer"). */
const STOP = new Set([
  "und", "oder", "mit", "ohne", "von", "aus", "der", "die", "das", "in",
  "vegan", "veganer", "vegane", "veganes", "bio", "frisch", "frische",
  "frischer", "getrocknet", "getrocknete", "gemahlen", "gemahlener",
  "rot", "rote", "roter", "gelb", "gelbe", "gruen", "gruene", "weiss",
  "weisse", "schwarz", "schwarze", "gross", "grosse", "klein", "kleine",
  "fein", "feine", "grob", "natur", "extra", "fresh", "dried", "ground",
  "red", "green", "white", "black", "and", "or", "of", "the",
]);

/** Light German singular/inflection fold so "Nudeln" meets "Schupfnudel" and
 *  "Käse" meets "Frischkäse" (both lose the trailing "e"). */
export function stem(word: string): string {
  if (word.length >= 4) return word.replace(/(en|n|e|s)$/, "");
  return word;
}

function words(s: string): string[] {
  return unaccent(s)
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 0);
}

export function nameShape(name: string): NameShape {
  const parens: string[] = [];
  const withoutParens = name.replace(/\(([^)]*)\)/g, (_, inner: string) => {
    parens.push(inner);
    return " ";
  });
  const [main, ...qualifiers] = withoutParens.split(",");
  const mainWords = words(main ?? "");
  const heads: string[] = [];
  const others: string[] = [];
  if (mainWords.length > 0) heads.push(stem(mainWords[mainWords.length - 1]));
  for (const w of mainWords.slice(0, -1)) others.push(stem(w));
  for (const p of parens) for (const w of words(p)) heads.push(stem(w));
  for (const q of qualifiers) for (const w of words(q)) others.push(stem(w));
  return {
    heads: heads.filter((w) => w.length >= 2),
    others: others.filter((w) => w.length >= 3 && !STOP.has(w)),
  };
}

function commonSuffixLength(a: string, b: string): number {
  let n = 0;
  while (n < a.length && n < b.length && a[a.length - 1 - n] === b[b.length - 1 - n]) {
    n += 1;
  }
  return n;
}

/**
 * Relation between two head stems:
 *   5   same head ("Gelbe Zwiebel" ↔ "Rote Zwiebel")
 *   4   one is the compound head of the other ("Räuchertofu" ↔ "Tofu"); the
 *       compound must add ≥ 3 letters so "Brei" doesn't contain "Reis"
 *   3.5 shared compound tail of ≥ 4 letters that is a word of its own
 *       ("Seidentofu" ↔ "Räuchertofu" via "Tofu"; but not "Drilling" ↔
 *       "Seitling" via the suffix "-ling")
 *   2   short shared tail (2–3 letters, "Olivenöl" ↔ "Rapsöl") — only when
 *       both share a category and the tail is a word of its own somewhere in
 *       the catalogue ("Öl" in the category "Essig und Öl"); otherwise
 *       "Kartoffel" ↔ "Zwiebel" or "potato" ↔ "tomato" would match
 *   1   one is the modifier of the other ("Zwiebel" ↔ "Zwiebelpulver") —
 *       related, but rarely a drop-in replacement
 */
function headRelation(
  a: string,
  b: string,
  sameCategory: boolean,
  vocabulary: ReadonlySet<string>,
): number {
  if (a === b) return 5;
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (long.endsWith(short) && long.length - short.length >= 3) return 4;
  const tail = commonSuffixLength(a, b);
  const tailIsWord = tail >= 2 && vocabulary.has(a.slice(a.length - tail));
  if (tailIsWord && tail >= 4 && a.length - tail >= 3 && b.length - tail >= 3) {
    return 3.5;
  }
  if (
    sameCategory &&
    tailIsWord &&
    a.length - tail >= 3 &&
    b.length - tail >= 3
  ) {
    return 2;
  }
  if (short.length >= 4 && long.startsWith(short)) return 1;
  return 0;
}

/** Name similarity of two article names, 0 (unrelated) … 5 (same head). */
export function nameSimilarity(
  a: NameShape,
  b: NameShape,
  sameCategory: boolean,
  vocabulary: ReadonlySet<string> = new Set(),
): number {
  let best = 0;
  for (const ha of a.heads) {
    for (const hb of b.heads) {
      best = Math.max(best, headRelation(ha, hb, sameCategory, vocabulary));
      if (best === 5) return best;
    }
  }
  if (best > 0) return best;
  // Shared non-head word ("Käse Cotija" ↔ "Käse Monterey Jack"): weak.
  for (const oa of [...a.others, ...a.heads]) {
    if (oa.length < 4) continue;
    if (b.others.includes(oa) || (a.others.includes(oa) && b.heads.includes(oa))) {
      return 1.5;
    }
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Ranking (pure)
// ---------------------------------------------------------------------------

export type CandidateInput = {
  id: number;
  name: string;
  /** Alternative names (aliases), without the canonical name. */
  aliases: string[];
  categoryId: number | null;
  categoryName: string | null;
  usage: number;
};

export type Signals = {
  /** Candidate id → times the target was replaced by it. */
  substitutedBy: Map<number, number>;
  /** Candidate id → times it was replaced by the target (reverse swap). */
  substitutedFor: Map<number, number>;
  /** Candidate id → recipes pairing it with the target as primary/alt. */
  alternatives: Map<number, number>;
  /** Candidate id → recipes where both are alternatives of one primary. */
  siblings: Map<number, number>;
};

/** Alias matches count a bit less than canonical-name ones: aliases include
 *  translations and loose spellings. */
const ALIAS_WEIGHT = 0.8;

/** Name-only candidates below this score are dropped. */
const MIN_NAME_SCORE = 3;

/**
 * The names an article is compared by: its canonical name (weight 1) and its
 * aliases (weight {@link ALIAS_WEIGHT}). Aliases that merely extend the
 * canonical name are preparation forms ("Zwiebelringe", "Zwiebelwürfel" for
 * "Zwiebel") — their head ("Ringe") says nothing about the article, so they
 * are left out ("Zwiebelringe" would otherwise pair onions with
 * "Ananasringe").
 */
function comparableNames(c: CandidateInput): Array<[NameShape, number]> {
  const canonical = nameShape(c.name);
  const out: Array<[NameShape, number]> = [[canonical, 1]];
  const canonHeads = canonical.heads;
  for (const alias of c.aliases) {
    const shape = nameShape(alias);
    const prepForm = shape.heads.some((h) =>
      canonHeads.some((ch) => ch.length >= 4 && h !== ch && h.startsWith(ch)),
    );
    if (!prepForm) out.push([shape, ALIAS_WEIGHT]);
  }
  return out;
}

/** Stemmed words that exist on their own: every word of a canonical article
 *  name or a category name. Aliases stay out — they bring abbreviations and
 *  translations ("EL", "el") that would make any "-el" ending a word. */
export function buildVocabulary(
  candidates: CandidateInput[],
  categoryNames: string[] = [],
): Set<string> {
  const vocab = new Set<string>();
  // Split on spaces only: a hyphenated name is one word ("Raz-el-Hanout"
  // must not make "el" a word).
  const add = (s: string) => {
    for (const w of s.split(/[\s,()]+/)) {
      const folded = unaccent(w).replace(/[^a-z0-9]/g, "");
      if (folded.length > 0) vocab.add(stem(folded));
    }
  };
  for (const c of candidates) add(c.name);
  for (const n of categoryNames) add(n);
  return vocab;
}

export function rankSimilar(
  target: CandidateInput,
  candidates: CandidateInput[],
  signals: Signals,
  limit: number,
  vocabulary: ReadonlySet<string> = buildVocabulary(candidates),
): SimilarIngredient[] {
  const targetShapes = comparableNames(target);
  const out: SimilarIngredient[] = [];
  for (const c of candidates) {
    if (c.id === target.id) continue;
    const reasons: Array<[SimilarReason, number]> = [];

    const subBy = signals.substitutedBy.get(c.id) ?? 0;
    const subFor = signals.substitutedFor.get(c.id) ?? 0;
    if (subBy > 0 || subFor > 0) {
      const s =
        (subBy > 0 ? 6 + 2 * Math.min(subBy, 5) : 0) +
        (subFor > 0 ? 3 + Math.min(subFor, 5) : 0);
      reasons.push(["substitution", s]);
    }
    const alt = signals.alternatives.get(c.id) ?? 0;
    if (alt > 0) reasons.push(["alternative", 4 + 1.5 * Math.min(alt, 4)]);
    const sib = signals.siblings.get(c.id) ?? 0;
    if (sib > 0) reasons.push(["sibling", 2 + 0.5 * Math.min(sib, 4)]);

    const sameCategory =
      target.categoryId != null && target.categoryId === c.categoryId;
    let name = 0;
    for (const [cs, cw] of comparableNames(c)) {
      for (const [ts, tw] of targetShapes) {
        const s = nameSimilarity(ts, cs, sameCategory, vocabulary) * cw * tw;
        name = Math.max(name, s);
      }
      if (name === 5) break;
    }
    if (name > 0) reasons.push(["name", name + (sameCategory ? 1.5 : 0)]);

    if (reasons.length === 0) continue;
    // A lone weak name hit ("Zwiebel" ↔ "Zwiebelpulver") is noise, not a
    // suggestion; the search field covers those.
    if (reasons.length === 1 && reasons[0][0] === "name" && reasons[0][1] < MIN_NAME_SCORE) {
      continue;
    }
    reasons.sort((a, b) => b[1] - a[1]);
    const score =
      reasons.reduce((sum, [, s]) => sum + s, 0) +
      0.3 * Math.log10(1 + c.usage);
    out.push({
      id: c.id,
      name: c.name,
      categoryName: c.categoryName,
      score,
      reasons: reasons.map(([r]) => r),
      substitutionUses: subBy,
      alternativeRecipes: alt,
    });
  }
  out.sort(
    (a, b) =>
      b.score - a.score || a.name.localeCompare(b.name, "de", { sensitivity: "base" }),
  );
  return out.slice(0, limit);
}

// ---------------------------------------------------------------------------
// DB
// ---------------------------------------------------------------------------

function countMap(rows: Array<{ id: number; n: number }>): Map<number, number> {
  return new Map(rows.map((r) => [r.id, r.n]));
}

/**
 * Up to `limit` articles similar to `ingredientId`, best first. Empty when the
 * article doesn't exist.
 */
export function findSimilarIngredients(
  ingredientId: number,
  limit = 8,
): SimilarIngredient[] {
  const rows = db.all<{
    id: number;
    name: string;
    categoryId: number | null;
    categoryName: string | null;
    usage: number;
  }>(sql`
    SELECT i.id, i.name, i.default_category_id AS categoryId,
           c.name AS categoryName,
           (SELECT COUNT(*) FROM recipe_ingredient ri WHERE ri.ingredient_id = i.id) AS usage
    FROM ingredient i
    LEFT JOIN category c ON c.id = i.default_category_id
  `);
  const aliases = db.all<{ ingredientId: number; name: string }>(sql`
    SELECT ingredient_id AS ingredientId, name FROM ingredient_alias
  `);
  const aliasMap = new Map<number, string[]>();
  for (const a of aliases) {
    const list = aliasMap.get(a.ingredientId) ?? [];
    list.push(a.name);
    aliasMap.set(a.ingredientId, list);
  }
  const candidates: CandidateInput[] = rows.map((r) => ({
    id: r.id,
    name: r.name,
    aliases: aliasMap.get(r.id) ?? [],
    categoryId: r.categoryId,
    categoryName: r.categoryName,
    usage: r.usage,
  }));
  const target = candidates.find((c) => c.id === ingredientId);
  if (!target) return [];
  const categoryNames = db
    .all<{ name: string }>(sql`SELECT name FROM category`)
    .map((r) => r.name);

  const substitutedBy = countMap(
    db.all<{ id: number; n: number }>(sql`
      SELECT to_ingredient_id AS id, uses AS n FROM ingredient_substitution
      WHERE from_ingredient_id = ${ingredientId}
    `),
  );
  const substitutedFor = countMap(
    db.all<{ id: number; n: number }>(sql`
      SELECT from_ingredient_id AS id, uses AS n FROM ingredient_substitution
      WHERE to_ingredient_id = ${ingredientId}
    `),
  );
  // Primary ↔ alternative pairs, counted per recipe (a recipe listing the pair
  // twice still counts once).
  const alternatives = countMap(
    db.all<{ id: number; n: number }>(sql`
      SELECT other AS id, COUNT(DISTINCT recipe_id) AS n FROM (
        SELECT CASE WHEN alt.ingredient_id = ${ingredientId}
                    THEN prim.ingredient_id ELSE alt.ingredient_id END AS other,
               s.recipe_id AS recipe_id
        FROM recipe_ingredient alt
        JOIN recipe_ingredient prim ON prim.id = alt.alternative_for_id
        JOIN recipe_section s ON s.id = prim.section_id
        WHERE (alt.ingredient_id = ${ingredientId} OR prim.ingredient_id = ${ingredientId})
          AND alt.ingredient_id IS NOT NULL AND prim.ingredient_id IS NOT NULL
      )
      WHERE other <> ${ingredientId}
      GROUP BY other
    `),
  );
  const siblings = countMap(
    db.all<{ id: number; n: number }>(sql`
      SELECT b.ingredient_id AS id, COUNT(DISTINCT s.recipe_id) AS n
      FROM recipe_ingredient a
      JOIN recipe_ingredient b
        ON b.alternative_for_id = a.alternative_for_id AND b.id <> a.id
      JOIN recipe_ingredient prim ON prim.id = a.alternative_for_id
      JOIN recipe_section s ON s.id = prim.section_id
      WHERE a.ingredient_id = ${ingredientId}
        AND b.ingredient_id IS NOT NULL AND b.ingredient_id <> ${ingredientId}
      GROUP BY b.ingredient_id
    `),
  );

  return rankSimilar(
    target,
    candidates,
    { substitutedBy, substitutedFor, alternatives, siblings },
    limit,
    buildVocabulary(candidates, categoryNames),
  );
}

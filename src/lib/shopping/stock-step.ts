/**
 * The −/+ buttons next to an "Auf Lager" amount (stock-check form): step the
 * raw input text by `delta` and return the new input text.
 *
 * - Empty or unparsable input counts as nothing at home: "+" gives 1, "−"
 *   leaves it empty.
 * - Never goes below zero; reaching zero clears the field, because an empty
 *   field ("nothing at home") is what the form saves as "no stock" — a literal
 *   0 would be stored as a pointless zero amount.
 * - Fractions survive (0,5 + 1 = 1,5) and float noise is rounded away.
 * - Keeps the decimal separator the user typed (comma stays comma).
 */
export function stepStockInput(raw: string, delta: number): string {
  const trimmed = raw.trim();
  const n = trimmed.length === 0 ? NaN : Number(trimmed.replace(",", "."));
  if (!Number.isFinite(n)) return delta > 0 ? String(delta) : "";
  const next = Math.round((n + delta) * 1000) / 1000;
  if (next <= 0) return "";
  const text = String(next);
  return trimmed.includes(",") ? text.replace(".", ",") : text;
}

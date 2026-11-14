import { EmbedStockCheck } from "@/components/shopping/embed-stock-check";
import { listShoppingItems } from "@/lib/shopping/items";

export const dynamic = "force-dynamic";

export const metadata = { title: "Auf Lager prüfen" };

/**
 * Chrome-less "Auf Lager prüfen" (stock check) for the Home Assistant kitchen
 * dashboard: the same form as the dialog on /einkauf, as a full page so HA can
 * show it in a browser_mod popup. Auth is the `__nomly_embed` cookie minted by
 * proxy.ts from the `?k=` token; the embed allow-list permits the stock
 * endpoints this form calls (plus the unit search).
 *
 * Query params:
 *   title=0  hides the heading (the HA popup header already shows it).
 */
export default async function EmbedStockCheckPage({
  searchParams,
}: {
  searchParams: Promise<{ title?: string }>;
}) {
  const { title } = await searchParams;
  return (
    <EmbedStockCheck
      initialItems={listShoppingItems()}
      showTitle={title !== "0"}
    />
  );
}

import { FileWarning } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { OfflineAwareLink } from "./offline-aware-link";

export type DashboardImportFailure = {
  id: number;
  url: string;
  errorMessage: string;
  attempts: number;
};

const MAX_VISIBLE = 5;

/** "example.com/foo/bar" — the URL without scheme, `www.` and trailing slash. */
function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const path = (u.pathname + u.search).replace(/\/$/, "");
    return u.host.replace(/^www\./, "") + path;
  } catch {
    return url;
  }
}

/**
 * Dashboard card: recipe URLs whose import failed. Hidden while the list is
 * empty (the normal state). An entry opens the import page with the URL
 * prefilled and the import re-run; "Alle ansehen" goes to the full list there.
 */
export function ImportFailuresCard({
  failures,
  className,
}: {
  failures: DashboardImportFailure[];
  className?: string;
}) {
  if (failures.length === 0) return null;
  const visible = failures.slice(0, MAX_VISIBLE);
  const more = failures.length - visible.length;

  return (
    <Card className={className}>
      <CardHeader className="flex-row items-baseline justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileWarning className="size-4 text-[var(--color-muted-fg)]" />
          Fehlgeschlagene Importe
        </CardTitle>
        <OfflineAwareLink
          href="/rezepte/importieren"
          className="text-sm font-medium text-[var(--color-accent)] hover:underline"
        >
          Alle ansehen →
        </OfflineAwareLink>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col gap-1">
          {visible.map((f) => (
            <li key={f.id}>
              <OfflineAwareLink
                href={`/rezepte/importieren?url=${encodeURIComponent(f.url)}`}
                title={`${f.url} – erneut importieren`}
                className="flex min-h-11 min-w-0 flex-col justify-center rounded-md px-2 -mx-2 text-sm hover:bg-[var(--color-muted)]/50"
              >
                <span className="truncate font-medium text-[var(--color-fg)] hover:underline">
                  {shortUrl(f.url)}
                </span>
                <span className="truncate text-xs text-[var(--color-muted-fg)]">
                  {f.errorMessage}
                  {f.attempts > 1 ? ` · ${f.attempts} Versuche` : ""}
                </span>
              </OfflineAwareLink>
            </li>
          ))}
        </ul>
        {more > 0 ? (
          <p className="mt-2 text-xs text-[var(--color-muted-fg)]">
            + {more} weitere
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

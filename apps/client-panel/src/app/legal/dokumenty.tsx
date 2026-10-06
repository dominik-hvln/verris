// Wspólne dla stron /legal: lista dokumentów, typy odpowiedzi API, przełącznik dokumentów.

import { cx } from "@/components/panel/cx";

export type LegalKind = "TERMS" | "PRIVACY" | "COOKIES" | "DPA";

export interface LegalDocument {
  kind: string;
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  changelogMarkdown: string | null;
  publishedAt: string;
}

export interface LegalVersion {
  version: string;
  publishedAt: string;
  isCurrent: boolean;
}

export const LEGAL_DOCS: { kind: LegalKind; slug: string; label: string; short: string; description: string }[] = [
  {
    kind: "TERMS",
    slug: "terms",
    label: "Regulamin",
    short: "Regulamin",
    description:
      "Warunki świadczenia usług hostingowych Verris, prawa i obowiązki klienta oraz dostawcy, w tym SLA i rekompensaty.",
  },
  {
    kind: "PRIVACY",
    slug: "privacy",
    label: "Polityka prywatności",
    short: "Prywatność",
    description: "Jak Verris przetwarza dane osobowe — podstawy prawne, cele, odbiorcy i Twoje prawa.",
  },
  {
    kind: "COOKIES",
    slug: "cookies",
    label: "Polityka cookies",
    short: "Cookies",
    description:
      "Pliki cookies używane w panelu klienta, na stronie statusu i stronach publicznych oraz zarządzanie zgodami.",
  },
  {
    kind: "DPA",
    slug: "dpa",
    label: "Umowa powierzenia (DPA)",
    short: "DPA",
    description: "Umowa powierzenia przetwarzania danych osobowych dla klientów biznesowych.",
  },
];

export const docByKind = (kind: string) => LEGAL_DOCS.find((d) => d.kind === kind);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pl-PL", { year: "numeric", month: "long", day: "numeric", timeZone: "Europe/Warsaw" });

/** Przełącznik między dokumentami; `sub` = podstrona (np. "/versions" na stronie historii wersji). */
export function DocSwitcher({ active, sub = "" }: { active: string; sub?: string }) {
  return (
    <nav aria-label="Przełącz dokument" className="print:hidden">
      <ul className="flex flex-wrap gap-2">
        {LEGAL_DOCS.map((d) => {
          const on = d.kind === active;
          return (
            <li key={d.kind}>
              <a
                href={`/legal/${d.slug}${sub}`}
                aria-current={on ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 items-center rounded-md border px-3.5 text-sm font-medium transition-colors",
                  on
                    ? "border-line-strong bg-raised text-foreground"
                    : "border-line text-muted-foreground hover:border-line-strong hover:text-foreground",
                )}
              >
                <span className="sm:hidden">{d.short}</span>
                <span className="hidden sm:inline">{d.label}</span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

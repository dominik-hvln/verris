// Publiczny indeks dokumentów prawnych. Strona verris.pl (stopka, formularze,
// baner cookie) linkuje do gołego `/legal`, które wcześniej nie miało strony —
// stąd błąd (brak route → not-found/403). Indeks kieruje do 4 dokumentów.
//
// Publiczny bez logowania (middleware whitelistuje ścieżki `/legal`).

import type { Metadata } from "next";
import { apiFetch } from "@/lib/api";
import { LEGAL_DOCS, formatDate, type LegalDocument } from "./dokumenty";
import { LegalShell } from "./legal-shell";

export const metadata: Metadata = {
  title: "Dokumenty prawne — Verris",
  description:
    "Regulamin, polityka prywatności, polityka cookies i umowa powierzenia (DPA) hostingu Verris.",
};

export const revalidate = 300;

export default async function LegalIndexPage() {
  // Wersje i daty to dodatek — gdy API chwilowo nie odpowiada, lista dokumentów i tak działa.
  const current = await apiFetch<Record<string, LegalDocument | null>>("/legal?locale=pl", {
    unauthenticated: true,
  }).catch(() => null);

  return (
    <LegalShell>
      <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 lg:py-14">
        <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Dokumenty prawne</h1>
        <p className="mt-3 max-w-[62ch] text-muted-foreground">
          Regulamin, polityki i umowa powierzenia danych — zawsze w aktualnej wersji, z pełną historią poprzednich
          wersji.
        </p>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {LEGAL_DOCS.map((d) => {
            const doc = current?.[d.kind];
            return (
              <li
                key={d.kind}
                className="relative flex flex-col rounded-lg border border-line bg-card p-6 transition-colors hover:border-line-strong"
              >
                <h2 className="text-lg font-bold">
                  {/* Cała karta klikalna (rozciągnięty link); „Historia wersji” leży nad nim. */}
                  <a href={`/legal/${d.slug}`} className="after:absolute after:inset-0 after:rounded-lg">
                    {d.label}
                  </a>
                </h2>
                <p className="mt-2 flex-1 text-sm text-verris-body">{d.description}</p>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line pt-4 text-sm">
                  {doc ? (
                    <span className="text-muted-foreground">
                      Wersja <span className="font-mono text-[0.95em] text-foreground">{doc.version}</span> · obowiązuje od{" "}
                      <time dateTime={doc.publishedAt}>{formatDate(doc.publishedAt)}</time>
                    </span>
                  ) : current ? (
                    <span className="text-muted-foreground">W przygotowaniu</span>
                  ) : (
                    <span />
                  )}
                  <a
                    href={`/legal/${d.slug}/versions`}
                    className="relative z-10 text-data-hi underline-offset-4 hover:underline"
                  >
                    Historia wersji
                  </a>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="mt-10 text-sm text-muted-foreground">
          Pytania dotyczące ochrony danych:{" "}
          <a href="mailto:rodo@verris.pl" className="text-data-hi underline underline-offset-2">
            rodo@verris.pl
          </a>
          .
        </p>
      </div>
    </LegalShell>
  );
}

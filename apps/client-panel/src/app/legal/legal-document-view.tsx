// Treść strony dokumentu prawnego (bez pobierania danych — testowalna w izolacji).

import { History } from "lucide-react";
import { cx } from "@/components/panel/cx";
import { plForm } from "@/lib/pl";
import { legalToc, renderLegalMarkdown, type LegalHeading } from "@/lib/markdown";
import { DocSwitcher, docByKind, formatDate, type LegalDocument, type LegalVersion } from "./dokumenty";
import { PrintButton } from "./print-button";

const action = "inline-flex items-center gap-1.5 text-data-hi underline-offset-4 hover:underline";

function Toc({ items }: { items: LegalHeading[] }) {
  return (
    <ol className="space-y-0.5 text-sm">
      {items.map((h) => {
        // „Rozdział …” grupuje paragrafy — w spisie jako nagłówek grupy.
        const grupa = /^rozdział\s/i.test(h.text);
        return (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={cx(
                "block rounded px-2 py-1 leading-snug hover:bg-raised hover:text-foreground",
                grupa ? "mt-3 font-semibold text-foreground" : "text-muted-foreground",
                h.level === 3 && "pl-5",
              )}
            >
              {h.text}
            </a>
          </li>
        );
      })}
    </ol>
  );
}

export function LegalDocumentView({
  kind,
  doc,
  versions,
}: {
  kind: string;
  doc: LegalDocument | null;
  versions: LegalVersion[];
}) {
  const meta = docByKind(kind)!;
  const toc = doc ? legalToc(doc.contentMarkdown) : [];
  const current = versions.find((v) => v.isCurrent);
  const archiwalna = doc && current && current.version !== doc.version ? current : null;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:py-12">
      <DocSwitcher active={kind} />

      <div className={cx("mt-8 print:mt-0 print:block", toc.length > 0 && "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12")}>
        {toc.length > 0 && (
          <aside className="hidden lg:block print:hidden">
            <nav
              aria-label="Spis treści"
              className="sticky top-24 max-h-[calc(100vh-7.5rem)] overflow-y-auto pb-4 pr-1"
            >
              <p className="px-2 font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                Spis treści
              </p>
              <div className="mt-2">
                <Toc items={toc} />
              </div>
            </nav>
          </aside>
        )}

        {/* Kolumna tekstu ok. 70 znaków (44 rem przy 17 px) — wszystkie bloki tej samej szerokości. */}
        <div className="min-w-0 max-w-[44rem] print:max-w-none">
          <h1 className="font-display text-3xl font-extrabold tracking-tight sm:text-4xl">{meta.label}</h1>
          <p className="mt-3 text-muted-foreground">{meta.description}</p>

          {!doc ? (
            <div className="mt-8 rounded-lg border border-line bg-card p-6">
              <h2 className="text-lg font-bold">Dokument w przygotowaniu</h2>
              <p className="mt-2 text-verris-body">
                Ten dokument nie został jeszcze opublikowany. Pracujemy nad jego finalizacją z zespołem prawnym.
                Skontaktuj się z nami:{" "}
                <a href="mailto:rodo@verris.pl" className="text-data-hi underline underline-offset-2">
                  rodo@verris.pl
                </a>
                .
              </p>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3 border-y border-line py-3 text-sm">
                <dl className="flex flex-wrap gap-x-6 gap-y-1">
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Wersja</dt>
                    <dd className="font-mono text-[0.95em] font-medium text-foreground">{doc.version}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted-foreground">Obowiązuje od</dt>
                    <dd className="font-medium text-foreground">
                      <time dateTime={doc.publishedAt}>{formatDate(doc.publishedAt)}</time>
                    </dd>
                  </div>
                </dl>
                <div className="flex flex-wrap gap-x-5 gap-y-2 print:hidden">
                  <a href={`/legal/${meta.slug}/versions`} className={action}>
                    <History aria-hidden className="h-4 w-4" />
                    Historia wersji
                    {versions.length > 0 &&
                      ` (${versions.length} ${plForm(versions.length, "wersja", "wersje", "wersji")})`}
                  </a>
                  <PrintButton className={action} />
                </div>
              </div>

              {archiwalna && (
                <p className="mt-4 rounded-lg border border-warn/40 bg-warn-soft px-4 py-3 text-sm text-foreground">
                  Czytasz archiwalną wersję {doc.version}.{" "}
                  <a href={`/legal/${meta.slug}`} className="font-medium text-data-hi underline underline-offset-2">
                    Przejdź do aktualnej wersji {archiwalna.version}
                  </a>
                </p>
              )}

              {doc.changelogMarkdown && (
                <section
                  aria-labelledby="co-sie-zmienilo"
                  className="mt-6 border-l-2 border-data pl-4"
                >
                  <h2 id="co-sie-zmienilo" className="text-sm font-semibold text-foreground">
                    Co się zmieniło w wersji {doc.version}
                  </h2>
                  {renderLegalMarkdown(doc.changelogMarkdown, {
                    className: "text-sm leading-relaxed text-verris-body [&_p]:my-1.5 [&_ul]:my-1.5 [&_ol]:my-1.5",
                  })}
                </section>
              )}

              {toc.length > 0 && (
                <details className="group mt-6 rounded-lg border border-line bg-card lg:hidden print:hidden">
                  <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
                    Spis treści
                    <span className="text-sm text-muted-foreground group-open:hidden">Pokaż</span>
                    <span className="hidden text-sm text-muted-foreground group-open:inline">Zwiń</span>
                  </summary>
                  <nav aria-label="Spis treści" className="border-t border-line px-2 py-2">
                    <Toc items={toc} />
                  </nav>
                </details>
              )}

              <article className="mt-8 text-[1.0625rem] leading-[1.75]">
                {renderLegalMarkdown(doc.contentMarkdown)}
              </article>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

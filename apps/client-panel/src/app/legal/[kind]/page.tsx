import { notFound } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { renderLegalMarkdown } from "@/lib/markdown";

interface LegalDocument {
  kind: string;
  version: string;
  locale: string;
  title: string;
  contentMarkdown: string;
  changelogMarkdown: string | null;
  publishedAt: string;
}

interface LegalVersion {
  version: string;
  publishedAt: string;
  isCurrent: boolean;
}

const KIND_LABELS: Record<string, string> = {
  TERMS: "Regulamin",
  PRIVACY: "Polityka prywatności",
  COOKIES: "Polityka cookies",
  DPA: "Umowa powierzenia (DPA)",
};

const KIND_DESCRIPTIONS: Record<string, string> = {
  TERMS:
    "Warunki świadczenia usług hostingowych Verris, prawa i obowiązki klienta oraz dostawcy.",
  PRIVACY:
    "Jak Verris przetwarza dane osobowe — podstawy prawne, cele, odbiorcy, prawa klienta.",
  COOKIES:
    "Pliki cookies, których używamy w panelu klienta, status page i stronach publicznych.",
  DPA: "Umowa powierzenia przetwarzania danych osobowych dla klientów biznesowych.",
};

const VALID_KINDS = new Set(Object.keys(KIND_LABELS));

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ locale?: string; version?: string }>;
}

export const revalidate = 300;

export default async function LegalPage({ params, searchParams }: PageProps) {
  const { kind: kindParam } = await params;
  const search = await searchParams;
  const kind = kindParam.toUpperCase();
  if (!VALID_KINDS.has(kind)) notFound();

  const locale = search.locale ?? "pl";
  const path = search.version
    ? `/legal/${kind}/version/${search.version}?locale=${locale}`
    : `/legal/${kind}?locale=${locale}`;

  let doc: LegalDocument | null = null;
  let versions: LegalVersion[] = [];

  try {
    [doc, versions] = await Promise.all([
      apiFetch<LegalDocument>(path, { unauthenticated: true }),
      apiFetch<LegalVersion[]>(`/legal/${kind}/versions?locale=${locale}`, {
        unauthenticated: true,
      }),
    ]);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      doc = null;
    } else {
      throw err;
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-sky-500/5 blur-[120px]" />
        </div>
        <header className="relative z-10 mx-auto max-w-3xl px-4 pt-16 pb-8">
          <a
            href="/"
            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
          >
            ← Verris
          </a>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white">
            {KIND_LABELS[kind]}
          </h1>
          <p className="mt-2 text-sm text-neutral-400">{KIND_DESCRIPTIONS[kind]}</p>
        </header>

        <main className="relative z-10 mx-auto max-w-3xl px-4 pb-24">
          {!doc ? (
            <div className="rounded-2xl border border-white/10 bg-neutral-900/40 p-8 text-sm text-neutral-300">
              <p className="font-semibold text-white mb-2">Dokument w przygotowaniu</p>
              <p>
                Ten dokument nie został jeszcze opublikowany. Pracujemy nad jego
                finalizacją z zespołem prawnym. Skontaktuj się z nami:{" "}
                <a
                  href="mailto:rodo@verris.pl"
                  className="text-sky-400 hover:text-sky-300 underline"
                >
                  rodo@verris.pl
                </a>
                .
              </p>
            </div>
          ) : (
            <article className="rounded-2xl border border-white/10 bg-neutral-900/40 p-8 sm:p-12 backdrop-blur">
              <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3 border-b border-white/10 pb-4 text-xs text-neutral-400">
                <span>
                  <span className="font-semibold text-neutral-200">Wersja {doc.version}</span>
                  {" · "}
                  obowiązuje od{" "}
                  {new Date(doc.publishedAt).toLocaleDateString("pl-PL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </span>
                {versions.length > 1 && (
                  <a
                    href={`/legal/${kindParam}/versions`}
                    className="text-sky-400 hover:text-sky-300 underline"
                  >
                    Poprzednie wersje ({versions.length})
                  </a>
                )}
              </div>

              {doc.changelogMarkdown && (
                <div className="mb-8 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4 text-xs">
                  <p className="font-semibold text-amber-300">Co się zmieniło w tej wersji</p>
                  <div className="mt-2 text-amber-100/80">
                    {renderLegalMarkdown(doc.changelogMarkdown, {
                      className: "text-xs",
                    })}
                  </div>
                </div>
              )}

              {renderLegalMarkdown(doc.contentMarkdown)}
            </article>
          )}
        </main>

        <footer className="border-t border-white/5 bg-neutral-950/80">
          <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-8 text-xs text-neutral-500 sm:flex-row sm:justify-between">
            <p>
              Verris używa wyłącznie niezbędnych plików cookies. Szczegóły:{" "}
              <a href="/legal/cookies" className="text-sky-400 hover:text-sky-300 underline">
                Polityka cookies
              </a>
              .
            </p>
            <p>
              Pytania RODO?{" "}
              <a href="mailto:rodo@verris.pl" className="text-sky-400 hover:text-sky-300 underline">
                rodo@verris.pl
              </a>
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

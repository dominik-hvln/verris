import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { DocSwitcher, docByKind, formatDate, type LegalVersion } from "../../dokumenty";
import { LegalShell } from "../../legal-shell";

interface PageProps {
  params: Promise<{ kind: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const meta = docByKind((await params).kind.toUpperCase());
  return meta ? { title: `Historia wersji: ${meta.label} — Verris` } : {};
}

export default async function LegalVersionsPage({ params }: PageProps) {
  const { kind: kindParam } = await params;
  const kind = kindParam.toUpperCase();
  const meta = docByKind(kind);
  if (!meta) notFound();

  const versions = await apiFetch<LegalVersion[]>(`/legal/${kind}/versions?locale=pl`, {
    unauthenticated: true,
  });

  return (
    <LegalShell>
      <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:py-12">
        <DocSwitcher active={kind} sub="/versions" />
        <nav aria-label="Okruszki" className="mt-8 text-sm text-muted-foreground">
          <Link href="/legal" className="hover:text-foreground">
            Dokumenty prawne
          </Link>
          <span aria-hidden className="mx-2">
            /
          </span>
          <a href={`/legal/${meta.slug}`} className="hover:text-foreground">
            {meta.label}
          </a>
        </nav>
        <h1 className="mt-2 font-display text-3xl font-extrabold tracking-tight sm:text-4xl">Historia wersji</h1>
        <p className="mt-3 text-muted-foreground">
          {meta.label} — pełny rejestr opublikowanych wersji dokumentu (przejrzystość wobec RODO).
        </p>

        <ol className="mt-8 divide-y divide-line rounded-lg border border-line bg-card">
          {versions.length === 0 && <li className="p-5 text-sm text-muted-foreground">Brak opublikowanych wersji.</li>}
          {versions.map((v) => (
            <li key={v.version} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 p-5">
              <div>
                <a
                  href={v.isCurrent ? `/legal/${meta.slug}` : `/legal/${meta.slug}?version=${encodeURIComponent(v.version)}`}
                  className="font-semibold text-foreground underline-offset-4 hover:underline"
                >
                  Wersja <span className="font-mono">{v.version}</span>
                </a>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  Opublikowana <time dateTime={v.publishedAt}>{formatDate(v.publishedAt)}</time>
                </p>
              </div>
              {v.isCurrent && (
                <span className="inline-flex items-center gap-2 text-sm font-medium text-data-hi">
                  <span aria-hidden className="h-2 w-2 rounded-full bg-data" />
                  Aktualna
                </span>
              )}
            </li>
          ))}
        </ol>
      </div>
    </LegalShell>
  );
}

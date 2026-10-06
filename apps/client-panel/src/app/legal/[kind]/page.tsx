import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { docByKind, type LegalDocument, type LegalVersion } from "../dokumenty";
import { LegalShell } from "../legal-shell";
import { LegalDocumentView } from "../legal-document-view";

const LOCALES = new Set(["pl", "en"]);

interface PageProps {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ locale?: string; version?: string }>;
}

export const revalidate = 300;

export async function generateMetadata({ params }: Pick<PageProps, "params">): Promise<Metadata> {
  const meta = docByKind((await params).kind.toUpperCase());
  return meta ? { title: `${meta.label} — Verris`, description: meta.description } : {};
}

export default async function LegalPage({ params, searchParams }: PageProps) {
  const { kind: kindParam } = await params;
  const search = await searchParams;
  const kind = kindParam.toUpperCase();
  if (!docByKind(kind)) notFound();

  // Parametry z URL idą do ścieżki API — tylko znane języki i wersje semver, reszta = 404.
  const locale = search.locale ?? "pl";
  if (!LOCALES.has(locale)) notFound();
  if (search.version !== undefined && !/^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(String(search.version))) notFound();
  const path = search.version
    ? `/legal/${kind}/version/${encodeURIComponent(search.version)}?locale=${locale}`
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
    <LegalShell>
      <LegalDocumentView kind={kind} doc={doc} versions={versions} />
    </LegalShell>
  );
}

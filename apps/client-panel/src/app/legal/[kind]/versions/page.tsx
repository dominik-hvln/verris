import { notFound } from "next/navigation";
import { apiFetch } from "@/lib/api";

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

interface PageProps {
  params: Promise<{ kind: string }>;
}

export const revalidate = 300;

export default async function LegalVersionsPage({ params }: PageProps) {
  const { kind: kindParam } = await params;
  const kind = kindParam.toUpperCase();
  if (!Object.keys(KIND_LABELS).includes(kind)) notFound();

  const versions = await apiFetch<LegalVersion[]>(`/legal/${kind}/versions?locale=pl`, {
    unauthenticated: true,
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <header className="mx-auto max-w-3xl px-4 pt-16 pb-8">
        <a
          href={`/legal/${kindParam}`}
          className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
        >
          ← {KIND_LABELS[kind]}
        </a>
        <h1 className="mt-4 text-3xl font-extrabold text-white">
          Historia wersji — {KIND_LABELS[kind]}
        </h1>
        <p className="mt-2 text-sm text-neutral-400">
          Pełen rejestr opublikowanych wersji dokumentu (transparentność RODO).
        </p>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-24">
        <ul className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-neutral-900/40">
          {versions.length === 0 && (
            <li className="p-6 text-sm text-neutral-400">Brak opublikowanych wersji.</li>
          )}
          {versions.map((v) => (
            <li key={v.version} className="flex items-center justify-between p-5">
              <div>
                <a
                  href={`/legal/${kindParam}?version=${v.version}`}
                  className="text-base font-semibold text-white hover:text-sky-300"
                >
                  Wersja {v.version}
                </a>
                <p className="mt-0.5 text-xs text-neutral-500">
                  Opublikowana{" "}
                  {new Date(v.publishedAt).toLocaleDateString("pl-PL", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                </p>
              </div>
              {v.isCurrent && (
                <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-400">
                  Aktualna
                </span>
              )}
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}

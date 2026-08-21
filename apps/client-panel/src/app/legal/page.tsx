// Publiczny indeks dokumentów prawnych. Strona verris.pl (stopka, formularze,
// baner cookie) linkuje do gołego `/legal`, które wcześniej nie miało strony —
// stąd błąd (brak route → not-found/403). Indeks kieruje do 4 dokumentów.
//
// Publiczny bez logowania (middleware whitelistuje ścieżki `/legal`).

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Dokumenty prawne — Verris",
  description:
    "Regulamin, polityka prywatności, polityka cookies i umowa powierzenia (DPA) hostingu Verris.",
};

const DOCS: { kind: string; href: string; label: string; description: string }[] = [
  {
    kind: "TERMS",
    href: "/legal/terms",
    label: "Regulamin",
    description:
      "Warunki świadczenia usług hostingowych Verris, prawa i obowiązki klienta oraz dostawcy, w tym SLA i rekompensaty.",
  },
  {
    kind: "PRIVACY",
    href: "/legal/privacy",
    label: "Polityka prywatności",
    description:
      "Jak Verris przetwarza dane osobowe — podstawy prawne, cele, odbiorcy i Twoje prawa.",
  },
  {
    kind: "COOKIES",
    href: "/legal/cookies",
    label: "Polityka cookies",
    description:
      "Pliki cookies używane w panelu klienta, na status page i stronach publicznych oraz zarządzanie zgodami.",
  },
  {
    kind: "DPA",
    href: "/legal/dpa",
    label: "Umowa powierzenia (DPA)",
    description:
      "Umowa powierzenia przetwarzania danych osobowych dla klientów biznesowych.",
  },
];

export const revalidate = 300;

export default function LegalIndexPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100">
      <div className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute -top-32 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-sky-500/5 blur-[120px]" />
        </div>
        <header className="relative z-10 mx-auto max-w-3xl px-4 pt-16 pb-8">
          <a
            href="https://verris.pl"
            className="text-xs uppercase tracking-widest text-neutral-500 hover:text-neutral-300"
          >
            ← Verris
          </a>
          <h1 className="mt-4 text-4xl font-extrabold tracking-tight text-white">
            Dokumenty prawne
          </h1>
          <p className="mt-2 text-sm text-neutral-400">
            Regulamin, polityki i umowa powierzenia danych. Wszystkie w aktualnej wersji, z archiwum
            poprzednich wersji dostępnym w każdym dokumencie.
          </p>
        </header>

        <main className="relative z-10 mx-auto max-w-3xl px-4 pb-24">
          <ul className="grid gap-4 sm:grid-cols-2">
            {DOCS.map((d) => (
              <li key={d.kind}>
                <a
                  href={d.href}
                  className="block h-full rounded-2xl border border-white/10 bg-neutral-900/40 p-6 backdrop-blur transition hover:border-sky-400/40 hover:bg-neutral-900/70"
                >
                  <h2 className="text-lg font-semibold text-white">{d.label}</h2>
                  <p className="mt-2 text-sm text-neutral-400">{d.description}</p>
                  <span className="mt-4 inline-block text-xs font-medium text-sky-400">
                    Czytaj →
                  </span>
                </a>
              </li>
            ))}
          </ul>

          <p className="mt-10 text-xs text-neutral-500">
            Pytania dotyczące ochrony danych:{" "}
            <a href="mailto:rodo@verris.pl" className="text-sky-400 hover:text-sky-300 underline">
              rodo@verris.pl
            </a>
            .
          </p>
        </main>
      </div>
    </div>
  );
}

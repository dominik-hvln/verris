// Rama stron /legal: nagłówek marki (jak verris.pl), stopka z linkami prawnymi, tokeny panelu.
// `.v2-content` włącza motyw jasny/ciemny wybrany w panelu (<html data-vtheme>), `.legal-doc` — styl wydruku.

import Link from "next/link";
import { VerrisMark, VerrisWordmark } from "@/components/logo";
import { ThemeToggle } from "@/components/panel/theme-toggle";
import { CookiePreferencesButton } from "@/components/cookie-consent";
import { LEGAL_DOCS } from "./dokumenty";

const WWW = "https://verris.pl";
const link = "text-muted-foreground hover:text-foreground";

export function LegalShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="v2-content legal-doc flex min-h-screen flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-line bg-background/90 backdrop-blur print:hidden">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <a href={WWW} aria-label="Verris — strona główna" className="inline-flex items-center gap-1 text-foreground">
            <VerrisMark className="h-9 w-9 shrink-0 text-verris-green" />
            <VerrisWordmark className="h-[18px] shrink-0" />
          </a>
          <nav aria-label="Serwis" className="flex items-center gap-4 text-sm">
            <Link href="/legal" className={`hidden sm:inline ${link}`}>
              Dokumenty prawne
            </Link>
            <a href={WWW} className={`hidden md:inline ${link}`}>
              verris.pl
            </a>
            <ThemeToggle zapiszNaKoncie={false} />
            <a
              href="/dashboard"
              className="inline-flex h-9 items-center rounded-md bg-primary px-3.5 font-semibold text-primary-foreground hover:opacity-90"
            >
              Panel klienta
            </a>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="mt-16 border-t border-line print:hidden">
        <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-10 text-sm sm:px-6 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <a href={WWW} aria-label="Verris — strona główna" className="inline-flex items-center gap-1 text-foreground">
              <VerrisMark className="h-8 w-8 shrink-0 text-verris-green" />
              <VerrisWordmark className="h-4 shrink-0" />
            </a>
            <p className="mt-3 max-w-xs text-muted-foreground">
              Nowoczesny polski hosting z uczciwymi zasadami. Skaluj świadomie.
            </p>
          </div>
          <nav aria-label="Informacje prawne">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Prawne</p>
            <ul className="mt-3 space-y-2">
              {LEGAL_DOCS.map((d) => (
                <li key={d.kind}>
                  <a href={`/legal/${d.slug}`} className={link}>
                    {d.label}
                  </a>
                </li>
              ))}
              <li>
                <CookiePreferencesButton className={link} />
              </li>
            </ul>
          </nav>
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Kontakt</p>
            <ul className="mt-3 space-y-2">
              <li>
                <a href="mailto:rodo@verris.pl" className={link}>
                  rodo@verris.pl
                </a>{" "}
                <span className="text-muted-foreground">— ochrona danych</span>
              </li>
              <li>
                <a href="mailto:kontakt@verris.pl" className={link}>
                  kontakt@verris.pl
                </a>
              </li>
              <li>
                <a href="https://status.verris.pl" className={link}>
                  Status usług
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-line">
          <p className="mx-auto w-full max-w-6xl px-4 py-5 text-xs text-muted-foreground sm:px-6">
            © {new Date().getFullYear()} Verris · Operator: HVLN Dominik Kowalski, Zielona Góra · NIP 9292069367
          </p>
        </div>
      </footer>
    </div>
  );
}

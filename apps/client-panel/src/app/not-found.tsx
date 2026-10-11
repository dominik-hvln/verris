import type { Metadata } from "next";
import Link from "next/link";
import { VerrisLockup } from "@/components/logo";

export const metadata: Metadata = { title: "Nie ma takiej strony — Verris" };

/**
 * Weryfikacja 11.10 — nieistniejący adres (np. stary link do zakładki usługi) pokazywał domyślną czarną stronę
 * Next.js po angielsku („404 This page could not be found.”). Strona Verris po polsku, w stylu ekranów logowania,
 * z drogą do panelu. White label: bez nazw oprogramowania serwera, portów i adresów.
 */
export default function NieMaStrony() {
  return (
    <main id="main" tabIndex={-1} className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background py-12">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-verris-mint/5 blur-[120px]" />
      </div>
      <div className="relative z-10 mx-4 w-full max-w-[420px]" data-strona-404="">
        <div className="mb-10 flex justify-center">
          <VerrisLockup size="lg" layout="vertical" className="items-center" />
        </div>
        <div className="rounded-[32px] border border-border bg-card/95 p-8">
          <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Błąd 404</p>
          <h1 className="mt-2 font-display text-xl font-bold text-foreground">Nie ma takiej strony</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Link mógł się zmienić albo strona została usunięta. Wszystko, czego potrzebujesz, znajdziesz w panelu.
          </p>
          <Link
            href="/dashboard"
            className="mt-6 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            Przejdź do panelu
          </Link>
        </div>
      </div>
    </main>
  );
}

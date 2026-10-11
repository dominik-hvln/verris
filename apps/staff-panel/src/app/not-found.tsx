import type { Metadata } from "next";
import Link from "next/link";
import { VerrisMark } from "@/components/verris-mark";

export const metadata: Metadata = { title: "Nie ma takiej strony — Verris Support" };

/**
 * Weryfikacja 11.10 — nieistniejący adres pokazywał domyślną czarną stronę Next.js po angielsku („404 This page could
 * not be found.”). Strona Verris po polsku, w stylu ekranu logowania panelu obsługi, z drogą na pulpit.
 * Bez danych i bez sprawdzania sesji: widzi ją także niezalogowany (proxy i tak kieruje go na logowanie).
 */
export default function NieMaStrony() {
  return (
    <main id="main" className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 rounded-2xl border border-white/10 bg-black/50 p-8 shadow-2xl" data-strona-404="">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-[#34e5a0]/30 bg-[#0c1a14]">
            <VerrisMark className="h-7 w-7 text-[#f4f4ee]" />
          </div>
          <div>
            <p className="text-xl font-semibold leading-tight">Verris Support</p>
            <p className="font-mono text-xs uppercase tracking-widest text-muted-foreground">Błąd 404</p>
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">Nie ma takiej strony</h1>
          <p className="text-sm text-muted-foreground">
            Adres jest błędny albo strona została przeniesiona. Wróć na pulpit i wybierz widok z menu.
          </p>
        </div>
        <Link
          href="/"
          className="inline-flex h-10 items-center rounded-lg border border-[#34e5a0]/40 bg-[#34e5a0]/10 px-4 text-sm font-semibold text-[#34e5a0] hover:bg-[#34e5a0]/20"
        >
          Wróć na pulpit
        </Link>
      </div>
    </main>
  );
}

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { StaffApiError } from "@/lib/staff-api";

/**
 * X-05 — komunikat zamiast „This page couldn’t load”, gdy API odmówi (403) albo nie odpowiada.
 * Strona zostaje w panelu: nagłówek, powrót i powód po polsku.
 */
export function BladStrony({ blad, powrot, tytul }: { blad: unknown; powrot: { href: string; label: string }; tytul: string }) {
  const odmowa = blad instanceof StaffApiError && blad.status === 403;
  return (
    <div className="space-y-6">
      <Link href={powrot.href} className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400">
        <ArrowLeft className="h-3.5 w-3.5" />
        {powrot.label}
      </Link>
      <h1 className="text-2xl font-bold tracking-tight text-white">{tytul}</h1>
      <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {odmowa
          ? "Twoje konto nie ma uprawnienia do tego widoku. Nada je administrator: panel admina → Role i uprawnienia."
          : "Nie udało się pobrać danych. Odśwież stronę za chwilę — jeśli błąd wraca, zgłoś go administratorowi."}
      </p>
    </div>
  );
}

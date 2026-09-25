import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AdminApiError } from "@/lib/api";

/** X-05 — wynik zapytania bez wyjątku: strona sama decyduje, co pokazać przy odmowie albo awarii API. */
export async function wynik<T>(p: Promise<T>): Promise<{ ok: true; dane: T } | { ok: false; blad: unknown }> {
  try {
    return { ok: true, dane: await p };
  } catch (blad) {
    return { ok: false, blad };
  }
}

/**
 * X-05 — komunikat zamiast „This page couldn’t load”, gdy API odmówi (403) albo nie odpowiada
 * (np. w trakcie wdrożenia). Strona zostaje w panelu: tytuł, powrót i powód po polsku.
 */
export function BladStrony({ blad, tytul, powrot }: { blad: unknown; tytul: string; powrot?: { href: string; label: string } }) {
  const odmowa = blad instanceof AdminApiError && blad.status === 403;
  return (
    <div className="space-y-6">
      {powrot ? (
        <Link href={powrot.href} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-white">
          <ArrowLeft className="h-3.5 w-3.5" />
          {powrot.label}
        </Link>
      ) : null}
      <h1 className="text-2xl font-bold tracking-tight text-white">{tytul}</h1>
      <p role="alert" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
        {odmowa
          ? "Twoje konto nie ma uprawnienia do tego widoku (Role i uprawnienia)."
          : "Nie udało się pobrać danych z API. Odśwież stronę za chwilę — w trakcie wdrożenia API bywa niedostępne przez kilkadziesiąt sekund."}
      </p>
    </div>
  );
}

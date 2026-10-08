import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { staffApi, StaffApiError } from "@/lib/staff-api";
import { FormularzZaKlienta } from "./formularz-za-klienta";

export const dynamic = "force-dynamic";

/**
 * PB-45 — migracja za klienta. Obsługa wypełnia źródło (np. z danych ze zgłoszenia), klient dostaje mail
 * z prośbą o zgodę, a migracja rusza dopiero po jego „Zgadzam się”. Wejście z karty usługi klienta (CRM)
 * albo z kolejki migracji (wtedy ID usługi podaje się ręcznie). Usługę czyta za tym samym uprawnieniem co założenie
 * (MIGRATIONS_MANAGE) — nie przez GET /admin/subscriptions/:id, które wymaga jeszcze SUBSCRIPTIONS_MANAGE.
 */

/** Odpowiedź `GET /staff/migrations/za-klienta/usluga/:id`. */
interface UslugaZaKlienta {
  id: string;
  user: { email: string; firstName: string | null; lastName: string | null };
  account: { domain: string } | null;
}

export default async function MigracjaZaKlientaPage({
  searchParams,
}: {
  searchParams: Promise<{ subscriptionId?: string }>;
}) {
  const { subscriptionId } = await searchParams;
  let usluga: UslugaZaKlienta | null = null;
  let blad: string | null = null;
  if (subscriptionId) {
    try {
      usluga = await staffApi<UslugaZaKlienta>(`/staff/migrations/za-klienta/usluga/${encodeURIComponent(subscriptionId.trim())}`);
    } catch (e) {
      blad =
        e instanceof StaffApiError && e.status === 404
          ? "Nie znaleziono usługi o tym ID."
          : e instanceof StaffApiError && e.status === 403
            ? "Twoja rola nie ma uprawnienia „Migracje (cockpit)”. Poproś administratora o jego nadanie."
            : "Nie udało się pobrać usługi — spróbuj ponownie.";
    }
  }

  return (
    <div className="space-y-6">
      <Link
        href="/migrations"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Kolejka migracji
      </Link>
      <div>
        <h1 className="text-3xl font-bold text-white">Migracja za klienta</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Wypełnij dane starego hostingu (np. ze zgłoszenia). Klient dostanie e-mail z prośbą o zgodę i baner w panelu —
          migracja wystartuje dopiero po jego „Zgadzam się”. Dane dostępowe są zaszyfrowane; jeśli klient nie zdecyduje
          w ciągu 7 dni, migracja zostanie anulowana, a dane usunięte.
        </p>
      </div>

      {!usluga ? (
        <form method="get" className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-black/30 p-4">
          <label className="space-y-1 text-xs text-muted-foreground">
            <span>ID usługi klienta</span>
            <input
              name="subscriptionId"
              defaultValue={subscriptionId ?? ""}
              required
              className="block w-80 max-w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white"
            />
          </label>
          <button type="submit" className="rounded-lg bg-cyan-700 px-3 py-2 text-xs font-semibold text-white">
            Dalej
          </button>
          <p className="basis-full text-xs text-muted-foreground">
            Najprościej: karta klienta w CRM → usługa → „Migracja za klienta”.
          </p>
          {blad ? <p className="basis-full text-sm text-rose-300">{blad}</p> : null}
        </form>
      ) : !usluga.account ? (
        <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          Ta usługa nie ma konta hostingowego — nie ma dokąd przenieść danych.
        </p>
      ) : (
        <FormularzZaKlienta
          subscriptionId={usluga.id}
          klient={[usluga.user.firstName, usluga.user.lastName].filter(Boolean).join(" ") || usluga.user.email}
          email={usluga.user.email}
          domenaKonta={usluga.account.domain}
        />
      )}
    </div>
  );
}

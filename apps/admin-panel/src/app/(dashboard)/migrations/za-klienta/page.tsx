import Link from "next/link";
import { adminApi, AdminApiError } from "@/lib/api";
import { FormularzZaKlienta } from "./formularz-za-klienta";

export const dynamic = "force-dynamic";

/**
 * ADMIN-MIGR (decyzja właściciela 08.10) — „Migracja za klienta” także w panelu admina; PB-45 zrobił ją tylko
 * w panelu obsługi. Te same trasy API (`staff/migrations/za-klienta…`, ADMIN wpuszczony, MIGRATIONS_MANAGE dla STAFF):
 * admin wypełnia źródło, klient dostaje mail z prośbą o zgodę, migracja rusza dopiero po jego „Zgadzam się”.
 * Wejście z karty usługi (subscriptions/[id]) albo z listy migracji (wtedy ID usługi podaje się ręcznie).
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
  if (subscriptionId?.trim()) {
    try {
      usluga = await adminApi<UslugaZaKlienta>(`/staff/migrations/za-klienta/usluga/${encodeURIComponent(subscriptionId.trim())}`);
    } catch (e) {
      blad =
        e instanceof AdminApiError && e.status === 404
          ? "Nie znaleziono usługi o tym ID."
          : e instanceof AdminApiError && e.status === 403
            ? "Twoja rola nie ma uprawnienia „Migracje (cockpit)”. Nada je administrator w „Role i uprawnienia”."
            : "Nie udało się pobrać usługi — spróbuj ponownie.";
    }
  }

  return (
    <div className="space-y-6">
      <Link href="/migrations" className="text-xs text-indigo-400 hover:underline">
        ← Kolejka migracji
      </Link>
      <div>
        <h1 className="text-[28px] lg:text-[34px]">Migracja za klienta</h1>
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
          <button type="submit" className="rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white">
            Dalej
          </button>
          <p className="basis-full text-xs text-muted-foreground">
            Najprościej: Subskrypcje → karta usługi → „Migracja za klienta”.
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

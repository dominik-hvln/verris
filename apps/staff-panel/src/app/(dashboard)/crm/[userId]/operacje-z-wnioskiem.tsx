import { staffApi } from "@/lib/staff-api";
import { OperacjeKlienta, type FakturaDoAnulowania } from "./operacje-klienta";

/**
 * PB-48 — karta „Operacje wymagające uprawnień” na karcie klienta (wpinana jedną linią — scalenie z PB-46).
 * Kto ma uprawnienie, wykonuje od razu; kto nie ma — widzi „Wyślij wniosek”. Uprawnienia z `/staff/me/access`
 * (suma ról) tylko do wyglądu; API i tak decyduje (403 WYMAGA_WNIOSKU → panel przełącza się na wniosek).
 */
export async function OperacjeZWnioskiem({
  userId,
  faktury,
}: {
  userId: string;
  faktury: { id: string; number: string; status: string; amount: string; currency: string }[];
}) {
  const [dostep, szczegoly] = await Promise.all([
    staffApi<{ isAdmin?: boolean; permissions?: string[] }>("/staff/me/access").catch(() => null),
    staffApi<{ isInternal?: boolean }>(`/admin/users/${encodeURIComponent(userId)}/operational-detail`).catch(() => null),
  ]);
  const ma = (k: string) => Boolean(dostep?.isAdmin || dostep?.permissions?.includes(k));
  const doAnulowania: FakturaDoAnulowania[] = faktury
    .filter((f) => f.status === "DRAFT" || f.status === "OPEN")
    .map((f) => ({ id: f.id, number: f.number, amount: f.amount, currency: f.currency }));

  return (
    <section className="rounded-2xl border border-white/10 bg-black/30 p-5" data-karta="operacje-wnioski">
      <h2 className="text-sm font-bold uppercase tracking-wide text-white">Operacje wymagające uprawnień</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Bez uprawnienia operację zlecasz wnioskiem — akceptuje ją kierownik zmiany albo administrator, a w dzienniku
        zapisują się obie osoby.
      </p>
      <OperacjeKlienta
        userId={userId}
        isInternal={typeof szczegoly?.isInternal === "boolean" ? szczegoly.isInternal : null}
        // Tak jak bezpośrednia ścieżka API (PATCH operational: CUSTOMERS_MANAGE + CUSTOMERS_INTERNAL_FLAG).
        mozeFlage={ma("CUSTOMERS_MANAGE") && ma("CUSTOMERS_INTERNAL_FLAG")}
        mozeFinanse={ma("BILLING_MANAGE")}
        faktury={doAnulowania}
      />
    </section>
  );
}

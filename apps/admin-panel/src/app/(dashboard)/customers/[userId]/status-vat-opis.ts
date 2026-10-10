// Bez "use client": wiersz „Status VAT nabywcy” liczy Server Component karty klienta (page.tsx). Funkcji
// z modułu "use client" nie da się wywołać na serwerze — na produkcji 09.10 cała karta klienta w adminie
// padała z „Nie udało się wczytać tej strony” (React #441), bo opisStatusuVat siedziała w status-vat-nabywcy.tsx.
/** Odpowiedź GET /admin/billing/nabywcy/:userId/vat. */
export interface StatusVatNabywcy {
  kraj: string;
  nip?: string | null;
  pozaUe: boolean;
  wymagaWeryfikacji: boolean;
  weryfikacja: { at: string; przez: string | null; podstawa: string | null; kraj: string | null; aktualna: boolean } | null;
}

/** Tekst do wiersza „Status VAT nabywcy” na karcie klienta. */
export function opisStatusuVat(s: StatusVatNabywcy): string {
  if (!s.pozaUe) return s.kraj === "PL" ? "Polska — 23%" : `UE (${s.kraj}) — stawka wg VIES przy płatności`;
  if (s.weryfikacja?.aktualna) {
    const kiedy = new Date(s.weryfikacja.at).toLocaleDateString("pl-PL");
    return `spoza UE (${s.kraj}) — zweryfikowany ${kiedy}, cena netto · ${s.weryfikacja.podstawa ?? ""}`.trim();
  }
  return `spoza UE (${s.kraj}) — NIEZWERYFIKOWANY, płatności z 23% VAT`;
}

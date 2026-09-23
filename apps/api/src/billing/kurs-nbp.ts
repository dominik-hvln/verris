/**
 * M-10 — kurs średni NBP (tabela A) z ostatniego dnia roboczego PRZED dniem
 * powstania obowiązku podatkowego (art. 31a ust. 1 ustawy o VAT).
 *
 * Nie „ostatnia tabela”: przy wpłacie o 13:00 ostatnią tabelą bywa już dzisiejsza,
 * a ustawa każe brać kurs z dnia poprzedzającego. Dzień liczymy w czasie polskim.
 * Bez rezerwowego kursu z konfiguracji: dokument podatkowy z kursem „na oko”
 * jest gorszy niż ponowienie webhooka za chwilę.
 */
export interface KursNbp {
  kod: string;
  kurs: number;
  tabela: string;
  data: string;
}

export function dzienWarszawa(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw' }).format(d);
}

function minusDni(iso: string, dni: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - dni);
  return d.toISOString().slice(0, 10);
}

export async function kursSredniPrzed(
  kod: 'EUR' | 'USD',
  dzien: Date,
  pobierz: typeof fetch = fetch,
): Promise<KursNbp> {
  const d = dzienWarszawa(dzien);
  // 10 dni wstecz wystarcza na każdy ciąg świąt (najdłuższy w PL to 4 dni).
  const url = `https://api.nbp.pl/api/exchangerates/rates/a/${kod.toLowerCase()}/${minusDni(d, 10)}/${minusDni(d, 1)}/?format=json`;
  const res = await pobierz(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8_000) });
  if (!res.ok) throw new Error(`NBP ${kod} ${d}: HTTP ${res.status}`);
  const j = (await res.json()) as { rates?: Array<{ no: string; effectiveDate: string; mid: number }> };
  const r = (j.rates ?? []).filter((x) => x.effectiveDate < d).pop();
  if (!r || !(r.mid > 0)) throw new Error(`NBP ${kod}: brak kursu przed ${d}`);
  return { kod, kurs: r.mid, tabela: r.no, data: r.effectiveDate };
}

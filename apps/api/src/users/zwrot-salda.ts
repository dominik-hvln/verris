import { Prisma, WalletTxStatus, WalletTxType } from '@verris/database';

/**
 * A2-07 / decyzja 9 (3.11.2026) — zwrot salda przy usunięciu konta: zwracamy tylko kredyty opłacone pieniędzmi,
 * bez kredytów z kodów promocyjnych, prowizji z poleceń i rekompensat SLA. Klient podaje numer rachunku, powstaje
 * wniosek dla obsługi, przelew do 14 dni.
 */
export const TERMIN_ZWROTU_DNI = 14;

/** Uznania, które nie są pieniędzmi klienta: kody (PROMO_CREDIT), prowizje z poleceń, rekompensaty SLA. */
export function czyKredytNieoplacony(tx: { type: WalletTxType; idempotencyKey?: string | null }): boolean {
  if (tx.type === WalletTxType.PROMO_CREDIT || tx.type === WalletTxType.COMMISSION_CREDIT) return true;
  // Rekompensata SLA idzie jako ADJUSTMENT z kluczem `sla-<usługa>-<okres>` (sla-credit.scheduler.ts).
  return tx.type === WalletTxType.ADJUSTMENT && Boolean(tx.idempotencyKey?.startsWith('sla-'));
}

type TransakcjaSalda = {
  type: WalletTxType;
  amount: Prisma.Decimal | number | string;
  status?: WalletTxStatus;
  idempotencyKey?: string | null;
  /** Kolejność zdarzeń — gdy jest, transakcje liczymy chronologicznie (inaczej w kolejności z tablicy). */
  createdAt?: Date;
};

/**
 * Kredyty nieopłacone (kody, polecenia, rekompensaty), których wydatki jeszcze nie zjadły. Zasada: każdy wydatek zjada
 * najpierw kredyty nieopłacone obecne wtedy w portfelu, dopiero potem pieniądze klienta. Zwroty i korekty w górę za
 * usługi (REFUND, CREDIT_PLAN_DOWNGRADE) oddają najpierw zjedzone kredyty nieopłacone. Jedno źródło kolejności dla
 * zwrotu salda i wkładu EKO w drzewo (decyzja 16).
 *
 * X1 (4.11.2026): liczone chronologicznie. Wcześniej wzór sumaryczny (darmowe − wydatki) uznawał, że wydatki sprzed
 * rekompensaty SLA albo prowizji „zjadły” je z góry — rekompensata otrzymana po opłaceniu usługi wracała przy zwrocie
 * jak pieniądze. Gdy wszystkie kredyty nieopłacone są przed wydatkami, wynik jest taki sam jak dawniej.
 */
export function darmoweNiewydane(transakcje: TransakcjaSalda[]): Prisma.Decimal {
  const kolejne = transakcje.every((t) => t.createdAt)
    ? [...transakcje].sort((a, b) => a.createdAt!.getTime() - b.createdAt!.getTime())
    : transakcje;
  let darmowe = new Prisma.Decimal(0);
  let zjedzone = new Prisma.Decimal(0);
  for (const tx of kolejne) {
    if (tx.status && tx.status !== WalletTxStatus.COMPLETED) continue;
    const kwota = new Prisma.Decimal(tx.amount);
    if (kwota.greaterThan(0)) {
      if (czyKredytNieoplacony(tx)) darmowe = darmowe.plus(kwota);
      else if (tx.type === WalletTxType.REFUND || tx.type === WalletTxType.CREDIT_PLAN_DOWNGRADE) {
        const wraca = Prisma.Decimal.min(kwota, zjedzone);
        darmowe = darmowe.plus(wraca);
        zjedzone = zjedzone.minus(wraca);
      }
    } else if (kwota.lessThan(0)) {
      const zDarmowych = Prisma.Decimal.min(kwota.abs(), darmowe);
      darmowe = darmowe.minus(zDarmowych);
      zjedzone = zjedzone.plus(zDarmowych);
    }
  }
  return darmowe;
}

/**
 * Część salda do zwrotu: saldo minus niewydane kredyty nieopłacone ({@link darmoweNiewydane}) — klient, który dopłacił
 * do hostingu, odzyskuje to, czego nie wydał.
 * Do decyzji Dominika: odwrotna kolejność (najpierw pieniądze) — wtedy darmowe = min(saldo, suma darmowych).
 */
export function saldoDoZwrotu(saldo: Prisma.Decimal | number | string, transakcje: TransakcjaSalda[]): Prisma.Decimal {
  const s = new Prisma.Decimal(saldo);
  if (s.lessThanOrEqualTo(0)) return new Prisma.Decimal(0);
  const doZwrotu = Prisma.Decimal.max(0, s.minus(darmoweNiewydane(transakcje)));
  return Prisma.Decimal.min(doZwrotu, s).toDecimalPlaces(2);
}

/**
 * Decyzja 16 (4.11.2026) — część obciążenia portfela zapłacona prawdziwymi pieniędzmi: kwota obciążenia minus
 * kredyty nieopłacone, które były jeszcze w portfelu przed nim (schodzą najpierw, jak przy zwrocie salda).
 * `transakcjePrzed` — transakcje konta sprzed tego obciążenia (bez niego).
 */
export function czescOplaconaPieniedzmi(
  kwotaObciazenia: Prisma.Decimal | number | string,
  transakcjePrzed: TransakcjaSalda[],
): Prisma.Decimal {
  const kwota = new Prisma.Decimal(kwotaObciazenia).abs();
  const zDarmowych = Prisma.Decimal.min(kwota, darmoweNiewydane(transakcjePrzed));
  return kwota.minus(zDarmowych).toDecimalPlaces(2);
}

/**
 * Numer rachunku do zwrotu: IBAN (dowolny kraj, suma kontrolna mod 97 wg ISO 13616) albo 26 cyfr polskiego NRB
 * (traktowany jak IBAN z prefiksem PL). Zwraca postać do zapisu (bez spacji, wielkie litery) albo null.
 */
export function normalizujRachunek(raw: string | null | undefined): string | null {
  const r = (raw ?? '').replace(/[\s-]/g, '').toUpperCase();
  const iban = /^\d{26}$/.test(r) ? `PL${r}` : r;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return null;
  if (iban.startsWith('PL') && iban.length !== 28) return null;
  const przestawiony = iban.slice(4) + iban.slice(0, 4);
  const liczby = przestawiony.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reszta = 0;
  for (const cyfra of liczby) reszta = (reszta * 10 + Number(cyfra)) % 97;
  return reszta === 1 ? iban : null;
}

/** Numer rachunku do pokazania (ostatnie 4 cyfry). */
export function maskaRachunku(iban: string): string {
  return `${iban.slice(0, 2)} •••• ${iban.slice(-4)}`;
}

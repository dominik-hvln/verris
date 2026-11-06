import { Prisma, type WalletTransaction } from '@verris/database';
import type { PrismaService } from '../prisma/prisma.service.js';
import type { LedgerEntryInput, WalletLedgerService } from '../billing/wallet-ledger.service.js';

/**
 * Decyzja Dominika 6.11.2026 — „rabat na start” zastąpiony kredytami na autoskalowanie.
 *
 * Przy pierwszym zakupie hostingu (ten sam warunek co dawny rabat: subscriptions/pierwszy-zakup.ts) klient dostaje
 * kwotę z ustawień oferty (domyślnie 60 zł brutto przy planie rocznym, 10 zł przy miesięcznym). Kredyty:
 * - leżą w OSOBNEJ puli (KredytAutoskalowania), poza User.walletBalance — dlatego żadne obciążenie portfela (plan,
 *   domena, dodatek, odnowienie) nie może ich wydać, a zwrot salda przy usunięciu konta ich nie widzi;
 * - wydaje je tylko rozliczenie autoskalowania ({@link obciazAutoskalowanie}): najpierw pula, reszta z portfela;
 * - są ważne 12 miesięcy od przyznania — wygaśnięcie liczone przy użyciu (`wygasaAt > teraz`), bez schedulera;
 * - są nieodpłatne: zejście z puli nie jest ruchem portfela, więc nie trafia na fakturę ani do wkładu EKO.
 * Przyznanie dopiero po opłaceniu zamówienia, gdy konto ruszy (provisioning.service.ts) — nie przy samym złożeniu.
 */
export const WAZNOSC_KREDYTOW_AUTOSKALOWANIA_MIES = 12;

/** Domyślne kwoty (zł brutto), gdy w ustawieniach nic nie zapisano — jedno źródło dla API. */
export const KREDYT_AUTOSKALOWANIA_DOMYSLNIE = { rok: 60, miesiac: 10 } as const;

/** Data wygaśnięcia: ten sam dzień i godzina za 12 miesięcy (UTC). */
export function wygasaPo12Miesiacach(od: Date): Date {
  const d = new Date(od.getTime());
  d.setUTCMonth(d.getUTCMonth() + WAZNOSC_KREDYTOW_AUTOSKALOWANIA_MIES);
  return d;
}

export type PulaKredytow = { saldo: Prisma.Decimal; kwota: Prisma.Decimal; przyznanoAt: Date; wygasaAt: Date; wygasla: boolean };

/** Pula klienta do pokazania w panelu (także wygasła — z flagą), null = nigdy nie przyznano. */
export async function pulaKredytow(
  prisma: Pick<PrismaService, 'kredytAutoskalowania'>,
  userId: string,
  teraz: Date = new Date(),
): Promise<PulaKredytow | null> {
  const p = await prisma.kredytAutoskalowania.findUnique({
    where: { userId },
    select: { kwota: true, pozostalo: true, przyznanoAt: true, wygasaAt: true },
  });
  if (!p) return null;
  const wygasla = p.wygasaAt.getTime() <= teraz.getTime();
  return {
    saldo: wygasla ? new Prisma.Decimal(0) : new Prisma.Decimal(p.pozostalo),
    kwota: new Prisma.Decimal(p.kwota),
    przyznanoAt: p.przyznanoAt,
    wygasaAt: p.wygasaAt,
    wygasla,
  };
}

/** Do odpowiedzi API: `{ saldo: "60.00", kwota, przyznanoAt, wygasaAt, wygasla }` albo null. */
export function pulaDoApi(p: PulaKredytow | null) {
  if (!p) return null;
  return {
    saldo: p.saldo.toFixed(2),
    kwota: p.kwota.toFixed(2),
    przyznanoAt: p.przyznanoAt.toISOString(),
    wygasaAt: p.wygasaAt.toISOString(),
    wygasla: p.wygasla,
  };
}

/** Ile z puli da się jeszcze wydać teraz (0 po wygaśnięciu albo bez puli). */
export async function dostepneKredyty(
  prisma: Pick<PrismaService, 'kredytAutoskalowania'>,
  userId: string,
  teraz: Date = new Date(),
): Promise<Prisma.Decimal> {
  return (await pulaKredytow(prisma, userId, teraz))?.saldo ?? new Prisma.Decimal(0);
}

/**
 * Przyznanie po opłaceniu: wołane w transakcji, w której usługa staje się ACTIVE. Jedna pula na klienta
 * (unikalne userId) — ponowne zakładanie konta albo drugi przebieg nic nie dopisują.
 */
export async function przyznajKredytyStartowe(
  tx: Prisma.TransactionClient,
  sub: { id: string; userId: string; kredytAutoskalowaniaKwota: Prisma.Decimal | null },
  teraz: Date = new Date(),
): Promise<void> {
  const kwota = sub.kredytAutoskalowaniaKwota ? new Prisma.Decimal(sub.kredytAutoskalowaniaKwota) : null;
  if (!kwota || !kwota.greaterThan(0)) return;
  await tx.kredytAutoskalowania.createMany({
    data: [
      {
        userId: sub.userId,
        subscriptionId: sub.id,
        kwota,
        pozostalo: kwota,
        przyznanoAt: teraz,
        wygasaAt: wygasaPo12Miesiacach(teraz),
      },
    ],
    skipDuplicates: true,
  });
}

export type WynikObciazenia = {
  /** Obciążenie portfela za część nieopłaconą z puli (null = całość z puli). */
  walletTx: WalletTransaction | null;
  /** Ile zeszło z puli kredytów autoskalowania. */
  zPuli: Prisma.Decimal;
};

/**
 * Obciążenie za autoskalowanie: najpierw ważne kredyty autoskalowania, reszta z portfela — atomowo (pula i portfel
 * w jednej transakcji: brak środków w portfelu na resztę cofa też zejście z puli, blok czeka na doładowanie).
 * Idempotentne po `idempotencyKey` (ten sam klucz co dotąd obciążenie portfela za blok). Klient bez ważnej puli —
 * dokładnie dotychczasowe `walletLedger.debit`.
 */
export async function obciazAutoskalowanie(
  prisma: PrismaService,
  ledger: WalletLedgerService,
  input: LedgerEntryInput & { idempotencyKey: string },
  teraz: Date = new Date(),
): Promise<WynikObciazenia> {
  const kwota = new Prisma.Decimal(input.amount);
  const [uzycie, obciazenie] = await Promise.all([
    prisma.kredytAutoskalowaniaUzycie.findUnique({ where: { idempotencyKey: input.idempotencyKey }, select: { kwota: true } }),
    ledger.findByIdempotencyKey(input.idempotencyKey),
  ]);
  if (uzycie || obciazenie) {
    return { walletTx: obciazenie, zPuli: uzycie ? new Prisma.Decimal(uzycie.kwota) : new Prisma.Decimal(0) };
  }

  const pula = await prisma.kredytAutoskalowania.findFirst({
    where: { userId: input.userId, pozostalo: { gt: 0 }, wygasaAt: { gt: teraz } },
    select: { id: true },
  });
  if (!pula) return { walletTx: await ledger.debit(input), zPuli: new Prisma.Decimal(0) };

  return prisma.$transaction(async (tx) => {
    const [stan] = await tx.$queryRaw<Array<{ pozostalo: Prisma.Decimal; wygasaAt: Date }>>`
      SELECT "pozostalo", "wygasaAt" FROM "KredytAutoskalowania" WHERE "id" = ${pula.id} FOR UPDATE`;
    const dostepne =
      stan && stan.wygasaAt.getTime() > teraz.getTime() ? new Prisma.Decimal(stan.pozostalo) : new Prisma.Decimal(0);
    const zPuli = Prisma.Decimal.min(kwota, dostepne);
    if (zPuli.greaterThan(0)) {
      await tx.kredytAutoskalowania.update({ where: { id: pula.id }, data: { pozostalo: { decrement: zPuli } } });
      await tx.kredytAutoskalowaniaUzycie.create({
        data: { kredytId: pula.id, subscriptionId: input.subscriptionId ?? '', kwota: zPuli, idempotencyKey: input.idempotencyKey },
      });
    }
    const reszta = kwota.minus(zPuli);
    if (!reszta.greaterThan(0)) return { walletTx: null, zPuli };
    const meta = (input.metadata as Record<string, unknown> | undefined) ?? {};
    const metadata = (
      zPuli.greaterThan(0)
        ? {
            ...meta,
            // Przychód z zasobów (raporty: autoscaling-pricing.service, metrics.service) tylko z części z portfela —
            // kredyty to nie sprzedaż. Udziały skalowane proporcjonalnie, dysk domyka sumę do grosza.
            ...przeskalujPrzychod(meta, reszta.div(kwota), reszta),
            // Dla wglądu: blok częściowo opłacony kredytami — w portfelu i na fakturze tylko reszta.
            zKredytowAutoskalowania: zPuli.toFixed(2),
            kosztBloku: kwota.toFixed(2),
          }
        : meta
    ) as Prisma.InputJsonValue;
    const walletTx = await ledger.zapiszWpis(tx, { ...input, amount: reszta, metadata }, 'debit', reszta, reszta.negated());
    return { walletTx, zPuli };
  });
}

/** Udziały przychodu (revenueCpuPln/RamPln/DiskPln) przeskalowane do części opłaconej z portfela. */
function przeskalujPrzychod(
  meta: Record<string, unknown>,
  ulamek: Prisma.Decimal,
  reszta: Prisma.Decimal,
): Record<string, string> {
  if (meta.revenueCpuPln == null && meta.revenueRamPln == null && meta.revenueDiskPln == null) return {};
  const czesc = (v: unknown) => new Prisma.Decimal(String(v ?? 0)).mul(ulamek).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  const cpu = czesc(meta.revenueCpuPln);
  const ram = czesc(meta.revenueRamPln);
  const disk = Prisma.Decimal.max(0, reszta.minus(cpu).minus(ram));
  return { revenueCpuPln: cpu.toFixed(2), revenueRamPln: ram.toFixed(2), revenueDiskPln: disk.toFixed(2) };
}

import { ConflictException, Injectable, Logger } from '@nestjs/common';
import {
  AutoscalingDirection,
  AutoscalingPriceRule,
  Prisma,
  WalletTxType,
} from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import {
  hourlyCostBreakdownForCatalogAmounts,
  scaledDiskMbToCatalogGb,
  scaledRamMbToCatalogGb,
} from './autoscaling-pricing.util.js';

/**
 * Length of a single billing block. Autoscaling is billed in whole 15-minute
 * blocks, rounded up: the moment a scale-up happens the customer is charged for
 * the first block, and a sustained delta then bills block-by-block. A short
 * spike that reverts after 2 minutes still pays one full block (the minimum),
 * which closes the old revenue leak where anything reverting before the top of
 * the UTC hour was billed nothing at all.
 */
export const BILLING_BLOCK_MINUTES = 15;
const BILLING_BLOCK_MS = BILLING_BLOCK_MINUTES * 60 * 1000;
const BLOCK_FRACTION_OF_HOUR = BILLING_BLOCK_MINUTES / 60;

/** Below this the wallet column (Decimal(12,2)) would truncate to 0. */
const MIN_CHARGEABLE_PLN = 0.01;

/** Safety bound on how many missed blocks a single pass will settle at once. */
const MAX_BLOCKS_PER_PASS = 192; // = 48h of backlog

/** Minimal account shape the biller needs (engine passes it in-memory). */
export interface BillableAccount {
  id: string;
  subscriptionId: string;
  userId: string;
  domain: string;
  scaledCpu: number;
  scaledRamMb: number;
  scaledDiskMb: number;
  scaledSince: Date | null;
  scaledBilledUntil: Date | null;
}

export interface BlockBillingResult {
  blocksCharged: number;
  amountChargedPln: number;
  walletDepleted: boolean;
}

/**
 * Event-driven autoscaling billing.
 *
 * Both the engine (immediately after a scale-up, so brief spikes are billed
 * before they revert) and the scheduler cron (every few minutes, so sustained
 * deltas keep billing) call {@link billDueBlocks}. Each 15-minute block is
 * charged exactly once thanks to a deterministic idempotency key
 * `autoscale-block:<subId>:<blockStartEpochMs>`, so the two callers never
 * double-bill, and a mid-block restart/deploy is safe.
 */
@Injectable()
export class AutoscalingBillingService {
  private readonly logger = new Logger(AutoscalingBillingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly walletLedger: WalletLedgerService,
  ) {}

  /** Cost of one 15-minute block at the current scaled delta, in PLN. */
  blockCostPln(
    rules: AutoscalingPriceRule[],
    scaledCpu: number,
    scaledRamMb: number,
    scaledDiskMb: number,
  ): { total: number; cpu: number; ram: number; disk: number } {
    const hourly = hourlyCostBreakdownForCatalogAmounts(rules, {
      cpuPercent: scaledCpu,
      ramGb: scaledRamMbToCatalogGb(scaledRamMb),
      diskGb: scaledDiskMbToCatalogGb(scaledDiskMb),
    });
    return {
      total: hourly.total * BLOCK_FRACTION_OF_HOUR,
      cpu: hourly.cpu * BLOCK_FRACTION_OF_HOUR,
      ram: hourly.ram * BLOCK_FRACTION_OF_HOUR,
      disk: hourly.disk * BLOCK_FRACTION_OF_HOUR,
    };
  }

  /**
   * Charges every 15-minute block the account has *entered* since the last
   * billed boundary, at the rate of the account's current scaled delta. The
   * block the account is currently sitting in is billed up-front (round up).
   *
   * Advances `Account.scaledBilledUntil` as it goes; if it ever finds an active
   * scaled delta without an episode start it self-heals by opening one as of
   * now (so it only ever bills forward, never retroactively).
   */
  async billDueBlocks(
    account: BillableAccount,
    rules: AutoscalingPriceRule[],
    now: Date = new Date(),
  ): Promise<BlockBillingResult> {
    const hasScale =
      account.scaledCpu > 0 || account.scaledRamMb > 0 || account.scaledDiskMb > 0;

    // No active episode: make sure timestamps are cleared and stop.
    if (!hasScale) {
      if (account.scaledSince || account.scaledBilledUntil) {
        await this.prisma.account.update({
          where: { id: account.id },
          data: { scaledSince: null, scaledBilledUntil: null },
        });
      }
      return { blocksCharged: 0, amountChargedPln: 0, walletDepleted: false };
    }

    const since = account.scaledSince ?? now;
    let nextBlockStart = account.scaledBilledUntil ?? since;

    // Self-heal legacy/partial state (scaled but never tracked).
    if (!account.scaledSince || !account.scaledBilledUntil) {
      await this.prisma.account.update({
        where: { id: account.id },
        data: { scaledSince: since, scaledBilledUntil: nextBlockStart },
      });
    }

    // PB-27/PB-28 — rabat operatora na autoskalowanie i rozliczenie poza Verris.
    const warunki = await this.prisma.subscription.findUnique({
      where: { id: account.subscriptionId },
      select: { autoscalingDiscountPct: true, paymentSource: true },
    });
    const poza = warunki?.paymentSource === 'MANUAL';
    const rabatPct = warunki?.autoscalingDiscountPct ?? 0;
    const block = poRabacie(
      this.blockCostPln(rules, account.scaledCpu, account.scaledRamMb, account.scaledDiskMb),
      rabatPct,
    );

    let blocksCharged = 0;
    let amountChargedPln = 0;
    let walletDepleted = false;
    let passes = 0;

    // A block is billed the instant the account enters it (blockStart <= now).
    while (nextBlockStart.getTime() <= now.getTime() && passes < MAX_BLOCKS_PER_PASS) {
      passes += 1;
      const blockStart = nextBlockStart;
      const blockEnd = new Date(blockStart.getTime() + BILLING_BLOCK_MS);
      // Zajęcie bloku przed obciążeniem: silnik po skalowaniu i cron co 5 min potrafią rozliczać
      // to samo konto naraz. Klucz idempotencji chronił portfel, ale historia zdarzeń dostawała
      // każdy blok dwa razy, a przy rozliczeniu poza Verris (MANUAL) — zestawienie do faktury
      // właściciela liczyło blok podwójnie. Wygrywa jeden przebieg; drugi kończy.
      // Reszta groszy (test na żywo 09.10: blok 0,0165 zł pobrany jako 0,02 zł, +21%): do portfela idzie
      // zaokrąglone (koszt bloku + reszta z poprzednich), różnica przechodzi dalej. Suma pobrań trzyma się
      // cennika z dokładnością do pół grosza, a bloki tańsze niż 0,005 zł w końcu też się zliczą.
      const stan = await this.prisma.account.findUnique({
        where: { id: account.id },
        select: STAN_BLOKU,
      });
      const resztaPrzed = Number(stan?.scaledCostCarryPln ?? 0);
      const dokladnie = block.total + resztaPrzed;
      const amount = Math.max(0, roundToCurrency(dokladnie));
      const resztaPo = dokladnie - amount;
      // Reszta w warunku: równoległa dopłata (niżej) też ją przesuwa — wygrywa jeden zapis, drugi kończy.
      const oplacono = oplaconyPoziom(account, block.total);
      const zajety = await this.prisma.account.updateMany({
        where: {
          id: account.id,
          scaledBilledUntil: blockStart,
          scaledCostCarryPln: stan?.scaledCostCarryPln ?? new Prisma.Decimal(0),
        },
        data: {
          scaledSince: since,
          scaledBilledUntil: blockEnd,
          scaledCostCarryPln: new Prisma.Decimal(resztaPo.toFixed(6)),
          ...oplacono,
        },
      });
      if (zajety.count === 0) break;
      // ponytail: awaria procesu między zajęciem a obciążeniem gubi jeden blok (na korzyść klienta);
      // gdyby to bolało — znacznik „zajęty do” z czasem i ponowienie przez cron.
      // Zwolnienie tylko, jeśli nikt w międzyczasie nie dopłacił do tego bloku (inaczej dopłata poszłaby dwa razy).
      const zwolnij = () =>
        this.prisma.account.updateMany({
          where: { id: account.id, scaledBilledUntil: blockEnd, scaledBlockPaidPln: oplacono.scaledBlockPaidPln },
          data: {
            scaledBilledUntil: blockStart,
            scaledCostCarryPln: new Prisma.Decimal(resztaPrzed.toFixed(6)),
            scaledBlockPaidPln: stan?.scaledBlockPaidPln ?? null,
            scaledBlockPaidCpu: stan?.scaledBlockPaidCpu ?? null,
            scaledBlockPaidRamMb: stan?.scaledBlockPaidRamMb ?? null,
            scaledBlockPaidDiskMb: stan?.scaledBlockPaidDiskMb ?? null,
          },
        });

      if (amount >= MIN_CHARGEABLE_PLN && poza) {
        // Bez obciążenia portfela: blok trafia do zestawienia zużycia, z którego
        // właściciel wystawia własną fakturę (GET /admin/users/:id/autoscaling-outside).
        const znacznik = `outside_block ${BILLING_BLOCK_MINUTES}min ${blockStart.toISOString()}`;
        const juz = await this.prisma.autoscalingEvent.findFirst({
          where: { subscriptionId: account.subscriptionId, reason: znacznik },
          select: { id: true },
        });
        if (!juz) {
          await this.prisma.autoscalingEvent.create({
            data: {
              subscriptionId: account.subscriptionId,
              direction: AutoscalingDirection.UP,
              reason: znacznik,
              costSnapshot: new Prisma.Decimal(amount),
            },
          });
          amountChargedPln += amount;
          blocksCharged += 1;
        }
      } else if (amount >= MIN_CHARGEABLE_PLN) {
        const share = allocateShares(amount, block);
        const idempotencyKey = `autoscale-block:${account.subscriptionId}:${blockStart.getTime()}`;
        try {
          const tx = await this.walletLedger.debit({
            userId: account.userId,
            type: WalletTxType.CHARGE_AUTOSCALING,
            amount,
            description:
              `Autoskalowanie — blok ${BILLING_BLOCK_MINUTES} min ` +
              `(cpu+${account.scaledCpu}% ram+${account.scaledRamMb}MB disk+${account.scaledDiskMb}MB)`,
            idempotencyKey,
            subscriptionId: account.subscriptionId,
            metadata: {
              kind: 'autoscaling_block',
              blockStart: blockStart.toISOString(),
              blockMinutes: BILLING_BLOCK_MINUTES,
              revenueCpuPln: share.cpu,
              revenueRamPln: share.ram,
              revenueDiskPln: share.disk,
            },
          });

          await this.prisma.autoscalingEvent.create({
            data: {
              subscriptionId: account.subscriptionId,
              direction: AutoscalingDirection.UP,
              reason: `block_charge ${BILLING_BLOCK_MINUTES}min tx=${tx.id}`,
              costSnapshot: new Prisma.Decimal(amount),
            },
          });

          amountChargedPln += amount;
          blocksCharged += 1;
        } catch (err) {
          const e = err as Error;
          // Brak środków = ConflictException z WalletLedgerService (typ, nie treść komunikatu).
          if (err instanceof ConflictException) {
            // Wallet is empty — stop here and DON'T advance past this block, so
            // we retry it after a top-up. The engine's guard will scale the
            // customer back to baseline + disable autoscaling on its next tick.
            walletDepleted = true;
            await zwolnij();
            this.logger.warn(
              `Autoscaling block billing: wallet insufficient for sub=${account.subscriptionId} ` +
                `amount=${amount} — pausing, engine will disable shortly`,
            );
            break;
          }
          await zwolnij();
          this.logger.error(
            `Autoscaling block billing failed for sub=${account.subscriptionId} ` +
              `amount=${amount}: ${e.message}`,
          );
          break;
        }
      }

      nextBlockStart = blockEnd;
    }

    if (!walletDepleted) {
      const d = await this.doplataZaPodbicie(account, rules, block, rabatPct, poza, now);
      amountChargedPln += d.amountChargedPln;
      walletDepleted = d.walletDepleted;
    }

    return { blocksCharged, amountChargedPln, walletDepleted };
  }

  /**
   * Dopłata za podbicie w trakcie opłaconego bloku (decyzja 09.10). Blok jest pobierany z góry przy
   * poziomie z chwili wejścia w blok; gdy poziom potem rośnie, różnica kosztu (nowa stawka − już
   * opłacona) × minuty do końca bloku / 15 przepadała — test na żywo: blok opłacony przy +50% CPU,
   * konto do końca bloku miało do +200%. Spadek nie daje zwrotu (blok to minimum), a powrót do już
   * opłaconego poziomu nie dopłaca drugi raz: zapamiętujemy najwyższy opłacony koszt bloku.
   */
  private async doplataZaPodbicie(
    account: BillableAccount,
    rules: AutoscalingPriceRule[],
    block: { total: number; cpu: number; ram: number; disk: number },
    rabatPct: number,
    poza: boolean,
    now: Date,
  ): Promise<{ amountChargedPln: number; walletDepleted: boolean }> {
    const nic = { amountChargedPln: 0, walletDepleted: false };
    const stan = await this.prisma.account.findUnique({
      where: { id: account.id },
      select: { scaledBilledUntil: true, ...STAN_BLOKU },
    });
    const koniec = stan?.scaledBilledUntil;
    // Tylko blok, w którym konto właśnie jest i który jest już opłacony.
    if (!stan || !koniec || koniec.getTime() <= now.getTime()) return nic;
    const blockStart = new Date(koniec.getTime() - BILLING_BLOCK_MS);
    if (blockStart.getTime() > now.getTime()) return nic;

    const nowy = oplaconyPoziom(account, block.total);
    const oplacony = stan.scaledBlockPaidPln;
    if (oplacony === null) {
      // Konto skalowane przed wdrożeniem kolumn: nie wiemy, co opłacono — bieżący poziom uznajemy
      // za opłacony (bez dopłaty), od następnego bloku wszystko już jest zapisane.
      await this.prisma.account.updateMany({
        where: { id: account.id, scaledBilledUntil: koniec, scaledBlockPaidPln: null },
        data: nowy,
      });
      return nic;
    }
    // Dopłata tylko za podbicie poziomu. Sama zmiana cennika albo rabatu w trakcie bloku (operator
    // podnosi stawkę, zdejmuje rabat) nie jest podbiciem — opłacony blok zostaje po starej cenie.
    const podbito =
      account.scaledCpu > (stan.scaledBlockPaidCpu ?? 0) ||
      account.scaledRamMb > (stan.scaledBlockPaidRamMb ?? 0) ||
      account.scaledDiskMb > (stan.scaledBlockPaidDiskMb ?? 0);
    if (!podbito || nowy.scaledBlockPaidPln.lessThanOrEqualTo(oplacony)) return nic;

    const minuty = (koniec.getTime() - now.getTime()) / 60_000;
    const ulamek = minuty / BILLING_BLOCK_MINUTES;
    const roznica = nowy.scaledBlockPaidPln.minus(oplacony).toNumber();
    const resztaPrzed = Number(stan.scaledCostCarryPln);
    const dokladnie = roznica * ulamek + resztaPrzed;
    const amount = Math.max(0, roundToCurrency(dokladnie));
    const resztaPo = dokladnie - amount;

    // Zajęcie dopłaty: warunek na opłacony koszt i resztę — z dwóch przebiegów (silnik + cron) wygrywa jeden.
    const zajety = await this.prisma.account.updateMany({
      where: {
        id: account.id,
        scaledBilledUntil: koniec,
        scaledBlockPaidPln: oplacony,
        scaledCostCarryPln: stan.scaledCostCarryPln,
      },
      data: { ...nowy, scaledCostCarryPln: new Prisma.Decimal(resztaPo.toFixed(6)) },
    });
    if (zajety.count === 0) return nic;
    const zwolnij = () =>
      this.prisma.account.updateMany({
        where: { id: account.id, scaledBilledUntil: koniec, scaledBlockPaidPln: nowy.scaledBlockPaidPln },
        data: {
          scaledBlockPaidPln: oplacony,
          scaledBlockPaidCpu: stan.scaledBlockPaidCpu,
          scaledBlockPaidRamMb: stan.scaledBlockPaidRamMb,
          scaledBlockPaidDiskMb: stan.scaledBlockPaidDiskMb,
          scaledCostCarryPln: stan.scaledCostCarryPln,
        },
      });

    if (amount < MIN_CHARGEABLE_PLN) return nic; // grosze zostają w reszcie
    const poziom = `cpu+${account.scaledCpu} ram+${account.scaledRamMb} disk+${account.scaledDiskMb}`;

    if (poza) {
      // Jak bloki: do zestawienia właściciela, bez portfela. Prefiks `outside_block` = to samo zestawienie.
      const znacznik = `outside_block topup ${blockStart.toISOString()} ${poziom}`;
      const juz = await this.prisma.autoscalingEvent.findFirst({
        where: { subscriptionId: account.subscriptionId, reason: znacznik },
        select: { id: true },
      });
      if (juz) return nic;
      await this.prisma.autoscalingEvent.create({
        data: {
          subscriptionId: account.subscriptionId,
          direction: AutoscalingDirection.UP,
          reason: znacznik,
          costSnapshot: new Prisma.Decimal(amount),
        },
      });
      return { amountChargedPln: amount, walletDepleted: false };
    }

    // Udział zasobów w dopłacie: przyrost kosztu każdego zasobu względem opłaconego poziomu.
    const przed = poRabacie(
      this.blockCostPln(
        rules,
        stan.scaledBlockPaidCpu ?? 0,
        stan.scaledBlockPaidRamMb ?? 0,
        stan.scaledBlockPaidDiskMb ?? 0,
      ),
      rabatPct,
    );
    const przyrost = {
      cpu: Math.max(0, block.cpu - przed.cpu),
      ram: Math.max(0, block.ram - przed.ram),
      disk: Math.max(0, block.disk - przed.disk),
    };
    const share = allocateShares(amount, { ...przyrost, total: przyrost.cpu + przyrost.ram + przyrost.disk });
    try {
      const tx = await this.walletLedger.debit({
        userId: account.userId,
        type: WalletTxType.CHARGE_AUTOSCALING,
        amount,
        description:
          `Autoskalowanie — dopłata za podbicie w bloku ` +
          `(${opisZmiany(stan, account)}, ${minutyPl(minuty)} min)`,
        // Jeden klucz na (usługa, blok, poziom docelowy): ponowienie po błędzie nie pobierze drugi raz.
        idempotencyKey:
          `autoscale-topup:${account.subscriptionId}:${blockStart.getTime()}:` +
          `${account.scaledCpu}:${account.scaledRamMb}:${account.scaledDiskMb}`,
        subscriptionId: account.subscriptionId,
        metadata: {
          kind: 'autoscaling_block_topup',
          blockStart: blockStart.toISOString(),
          blockMinutes: BILLING_BLOCK_MINUTES,
          minutesLeft: Number(minuty.toFixed(2)),
          revenueCpuPln: share.cpu,
          revenueRamPln: share.ram,
          revenueDiskPln: share.disk,
        },
      });
      // Prefiks `block_charge` — oś czasu klienta pokazuje wiersz naliczenia, nie surowy znacznik.
      await this.prisma.autoscalingEvent.create({
        data: {
          subscriptionId: account.subscriptionId,
          direction: AutoscalingDirection.UP,
          reason: `block_charge topup tx=${tx.id}`,
          costSnapshot: new Prisma.Decimal(amount),
        },
      });
      return { amountChargedPln: amount, walletDepleted: false };
    } catch (err) {
      // Jak przy blokach: nieudana dopłata nie jest oznaczona jako opłacona — kolejny przebieg w tym
      // samym bloku spróbuje znowu (za minuty, które wtedy zostaną do końca bloku).
      await zwolnij();
      if (err instanceof ConflictException) {
        this.logger.warn(
          `Autoscaling top-up: wallet insufficient for sub=${account.subscriptionId} amount=${amount}`,
        );
        return { amountChargedPln: 0, walletDepleted: true };
      }
      this.logger.error(
        `Autoscaling top-up failed for sub=${account.subscriptionId} amount=${amount}: ${(err as Error).message}`,
      );
      return nic;
    }
  }

  /**
   * Total PLN charged for the autoscaling episode that started at `since`
   * (used for the scale-down summary email). Charges are stored as negative
   * debits, so we sum absolute values.
   */
  async episodeSpendPln(subscriptionId: string, since: Date): Promise<number> {
    const sum = await this.prisma.walletTransaction.aggregate({
      where: {
        subscriptionId,
        type: WalletTxType.CHARGE_AUTOSCALING,
        createdAt: { gte: since },
      },
      _sum: { amount: true },
    });
    return Math.abs(Number(sum._sum.amount ?? 0));
  }
}

const STAN_BLOKU = {
  scaledCostCarryPln: true,
  scaledBlockPaidPln: true,
  scaledBlockPaidCpu: true,
  scaledBlockPaidRamMb: true,
  scaledBlockPaidDiskMb: true,
} as const;

/** Zapis „ten blok opłacono przy tym poziomie” (koszt pełnego bloku po rabacie). */
function oplaconyPoziom(
  account: Pick<BillableAccount, 'scaledCpu' | 'scaledRamMb' | 'scaledDiskMb'>,
  kosztBloku: number,
) {
  return {
    scaledBlockPaidPln: new Prisma.Decimal(kosztBloku.toFixed(6)),
    scaledBlockPaidCpu: account.scaledCpu,
    scaledBlockPaidRamMb: account.scaledRamMb,
    scaledBlockPaidDiskMb: account.scaledDiskMb,
  };
}

/** „cpu+50%→+200%” — tylko zasoby, które się zmieniły względem opłaconego poziomu. */
function opisZmiany(
  oplacony: { scaledBlockPaidCpu: number | null; scaledBlockPaidRamMb: number | null; scaledBlockPaidDiskMb: number | null },
  teraz: Pick<BillableAccount, 'scaledCpu' | 'scaledRamMb' | 'scaledDiskMb'>,
): string {
  const czesci: string[] = [];
  const z = (nazwa: string, przed: number | null, po: number, j: string) => {
    if ((przed ?? 0) !== po) czesci.push(`${nazwa}+${przed ?? 0}${j}→+${po}${j}`);
  };
  z('cpu', oplacony.scaledBlockPaidCpu, teraz.scaledCpu, '%');
  z('ram', oplacony.scaledBlockPaidRamMb, teraz.scaledRamMb, 'MB');
  z('disk', oplacony.scaledBlockPaidDiskMb, teraz.scaledDiskMb, 'MB');
  return czesci.length > 0
    ? czesci.join(' ')
    : `cpu+${teraz.scaledCpu}% ram+${teraz.scaledRamMb}MB disk+${teraz.scaledDiskMb}MB`;
}

/** 7.5 → „7,5”, 12 → „12”. */
function minutyPl(minuty: number): string {
  return String(Math.round(minuty * 10) / 10).replace('.', ',');
}

/** PB-27 — koszt bloku po rabacie operatora (0–100%). */
export function poRabacie<T extends Record<string, number>>(koszt: T, rabatPct: number): T {
  const k = 1 - Math.min(100, Math.max(0, rabatPct)) / 100;
  return Object.fromEntries(Object.entries(koszt).map(([n, v]) => [n, v * k])) as T;
}

/**
 * Audit F-19: the wallet columns are Decimal(12,2) — rounding to 2 dp here
 * keeps the in-memory totals identical to what the DB actually stores (no
 * grosze drift between pass results and the ledger).
 */
function roundToCurrency(value: number): number {
  return Math.round(value * 100) / 100;
}

function allocateShares(
  total: number,
  block: { cpu: number; ram: number; disk: number; total: number },
): { cpu: string; ram: string; disk: string } {
  if (block.total <= 0) return { cpu: '0', ram: '0', disk: '0' };
  const cpu = roundToCurrency((block.cpu / block.total) * total);
  const ram = roundToCurrency((block.ram / block.total) * total);
  const disk = roundToCurrency(Math.max(0, total - cpu - ram));
  return { cpu: cpu.toFixed(2), ram: ram.toFixed(2), disk: disk.toFixed(2) };
}

import { ConflictException, ForbiddenException } from '@nestjs/common';
import { Prisma, ProductKind, SubscriptionStatus } from '@verris/database';
import { CENA_KREATORA_PRO } from '@verris/kreator';
import { rozbicieVat } from '../billing/faktura-za-portfel.js';
import { wProbie } from '../subscriptions/okres-probny.js';

/**
 * Paczka 121 — abonament Verris Kreator Pro (decyzja właściciela 8.11.2026) to zwykła subskrypcja produktu
 * aplikacyjnego KREATOR_PRO: zakup, odnowienia (portfel / karta), karencja, zawieszenie, wygaśnięcie, faktura
 * i anulowanie idą torem subskrypcji (subscriptions.service.ts, renewal.scheduler.ts) jak e-mail marketing.
 * Ten plik trzyma tylko reguły samego produktu:
 *  - kupić można przy płatnym, działającym hostingu (w próbie hostingu – „po opłaceniu hostingu”),
 *  - jeden abonament na konto (drugi zakup → 409),
 *  - wersja kreatora 'pro' = abonament ACTIVE albo PAST_DUE (karencja; zawieszenie = koniec Pro) + płatny hosting.
 */

/** Hosting działa (jak okres-probny.ts / pliki-hostingu.ts). */
export const HOSTING_DZIALA: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PROVISIONING, SubscriptionStatus.PAST_DUE];
/** Pro włączony: opłacony okres albo karencja po nieudanym odnowieniu (do zawieszenia przez harmonogram). */
export const PRO_DZIALA: SubscriptionStatus[] = [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE];
/**
 * Abonament, który blokuje drugi zakup: także zamówienie czekające na płatność (opłacone później dałoby dwa
 * abonamenty – pieniędzy po płatności już nie odmówimy) i zawieszony (wraca sam po zapłacie zaległości).
 */
export const PRO_ZAJMUJE: SubscriptionStatus[] = [
  SubscriptionStatus.PENDING_PAYMENT,
  SubscriptionStatus.PROVISIONING,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.SUSPENDED,
];

export const POWOD_BEZ_PLATNEGO_HOSTINGU = 'Kreator Pro kupisz po opłaceniu hostingu – w okresie próbnym korzystasz z kreatora w wersji próbnej.';
export const POWOD_BEZ_HOSTINGU = 'Kreator Pro wymaga działającego hostingu Verris. Zamów hosting, żeby go kupić.';
export const POWOD_DRUGI_ABONAMENT = 'Masz już abonament Kreator Pro na tym koncie – drugi nie jest potrzebny.';
export const POWOD_ZAMOWIENIE_CZEKA = 'Masz już zamówienie Kreatora Pro czekające na płatność – opłać je albo anuluj, zanim złożysz nowe.';
export const POWOD_BRAK_PLANU = 'Kreator Pro jest chwilowo niedostępny w sprzedaży – spróbuj później.';

type DbSubskrypcji = { subscription: Pick<Prisma.TransactionClient['subscription'], 'findMany' | 'findFirst'> };
type DbPlanu = { plan: Pick<Prisma.TransactionClient['plan'], 'findFirst'> };

/** Działający hosting konta: czy jest w ogóle i czy któryś jest płatny (nie w trwającej próbie). */
export async function stanHostingu(db: DbSubskrypcji, userId: string): Promise<{ jest: boolean; platny: boolean }> {
  const uslugi = await db.subscription.findMany({
    where: { userId, status: { in: HOSTING_DZIALA }, plan: { productKind: ProductKind.HOSTING } },
    select: { isTrial: true, trialConvertedAt: true },
  });
  return { jest: uslugi.length > 0, platny: uslugi.some((u) => !wProbie(u)) };
}

/** Abonament Pro konta zajmujący miejsce (najnowszy), albo null. */
export function abonamentPro(db: DbSubskrypcji, userId: string) {
  return db.subscription.findFirst({
    where: { userId, status: { in: PRO_ZAJMUJE }, plan: { productKind: ProductKind.KREATOR_PRO } },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      status: true,
      interval: true,
      paymentSource: true,
      currentPeriodEnd: true,
      cancelAt: true,
      priceAmount: true,
      listPriceAmount: true,
      stripeSubscriptionId: true,
    },
  });
}

/** Powód, dla którego zakup jest teraz niemożliwy, albo null. Kolejność: hosting, potem drugi abonament. */
export async function powodBlokadyZakupuPro(db: DbSubskrypcji, userId: string): Promise<{ kod: 403 | 409; powod: string } | null> {
  const hosting = await stanHostingu(db, userId);
  if (!hosting.jest) return { kod: 403, powod: POWOD_BEZ_HOSTINGU };
  if (!hosting.platny) return { kod: 403, powod: POWOD_BEZ_PLATNEGO_HOSTINGU };
  const pro = await abonamentPro(db, userId);
  if (pro) return { kod: 409, powod: pro.status === SubscriptionStatus.PENDING_PAYMENT ? POWOD_ZAMOWIENIE_CZEKA : POWOD_DRUGI_ABONAMENT };
  return null;
}

/**
 * Wołane przy zamówieniu (SubscriptionsService.create) pod blokadą doradczą klienta – dwa równoległe zamówienia
 * nie przejdą obu kontroli. Brak płatnego hostingu → 403, drugi abonament → 409.
 */
export async function sprawdzZakupKreatoraPro(db: DbSubskrypcji, userId: string): Promise<void> {
  const b = await powodBlokadyZakupuPro(db, userId);
  if (!b) return;
  throw b.kod === 409 ? new ConflictException(b.powod) : new ForbiddenException(b.powod);
}

export interface CenaKreatoraPro {
  miesiacBrutto: number;
  miesiacNetto: number;
  rokBrutto: number;
  rokNetto: number;
}

/** Netto jak na fakturze (rozbicieVat: VAT jako reszta, 23%). */
function cenaZPlanu(p: { priceMonthly: Prisma.Decimal; priceYearly: Prisma.Decimal }): CenaKreatoraPro {
  const m = rozbicieVat(new Prisma.Decimal(p.priceMonthly));
  const r = rozbicieVat(new Prisma.Decimal(p.priceYearly));
  return { miesiacBrutto: Number(m.brutto), miesiacNetto: Number(m.netto), rokBrutto: Number(r.brutto), rokNetto: Number(r.netto) };
}

export interface StanKreatoraPro {
  /** Plan do zamówienia (POST /subscriptions) – null, gdy planu nie ma w sprzedaży. */
  planId: string | null;
  cena: CenaKreatoraPro;
  zakup: { mozliwy: boolean; powod: string | null };
  abonament: {
    id: string;
    status: SubscriptionStatus;
    interval: 'MONTH' | 'YEAR';
    /** Koniec opłaconego okresu (ISO). */
    aktywnyDo: string | null;
    odnowienie: 'portfel' | 'karta' | 'reczne';
    /** Rezygnacja z odnowienia złożona – abonament kończy się z `aktywnyDo`. */
    bezOdnowienia: boolean;
    /** Kwota zapisana na abonamencie (brutto, zł). */
    cena: string;
  } | null;
}

/** GET /kreator/stan → `pro`: cennik z planu w bazie, możliwość zakupu i bieżący abonament. */
export async function stanKreatoraPro(db: DbSubskrypcji & DbPlanu, userId: string): Promise<StanKreatoraPro> {
  const [plan, pro, blokada] = await Promise.all([
    db.plan.findFirst({
      where: { productKind: ProductKind.KREATOR_PRO, isActive: true, isPublic: true },
      orderBy: { sortOrder: 'asc' },
      select: { id: true, priceMonthly: true, priceYearly: true },
    }),
    abonamentPro(db, userId),
    powodBlokadyZakupuPro(db, userId),
  ]);
  const powod = blokada?.powod ?? (plan ? null : POWOD_BRAK_PLANU);
  return {
    planId: plan?.id ?? null,
    // Bez planu w bazie (przed migracją danych) – cennik z decyzji, ale zakup wyłączony.
    cena: plan ? cenaZPlanu(plan) : { ...CENA_KREATORA_PRO },
    zakup: { mozliwy: powod === null, powod },
    abonament: pro
      ? {
          id: pro.id,
          status: pro.status,
          interval: pro.interval,
          aktywnyDo: pro.currentPeriodEnd?.toISOString() ?? null,
          odnowienie: pro.paymentSource === 'STRIPE_CARD' ? 'karta' : pro.paymentSource === 'MANUAL' ? 'reczne' : 'portfel',
          bezOdnowienia: pro.cancelAt != null,
          cena: new Prisma.Decimal(pro.listPriceAmount ?? pro.priceAmount).toFixed(2),
        }
      : null,
  };
}

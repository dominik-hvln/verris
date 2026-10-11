import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionStatus, type Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { CyklZyciaUslugiActions, SupportActions } from '../common/audit/audit.actions.js';
import { StripeService } from '../billing/stripe/stripe.service.js';
import { zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';

const GODZINA = 60 * 60 * 1000;
const DZIEN = 24 * GODZINA;

/** Obietnica zapłaty: maksymalnie tyle dni od chwili ustawienia (decyzja wykonawcy F3.5 — do potwierdzenia przez właściciela). */
export const OBIETNICA_MAKS_DNI = 7;
/** Zmiana daty odnowienia: nowy koniec okresu najdalej rok (366 dni) po obecnym. */
export const ZMIANA_DATY_MAKS_DNI = 366;
/**
 * Harmonogram odnowień obciąża portfel do 24 h przed końcem okresu (renewal.scheduler.ts renewalWindowMs) i przesuwa
 * okres warunkowo na jego stary koniec. Zmiana daty w tym oknie mogłaby trafić między obciążenie a przesunięcie —
 * klient zapłaciłby za okres, którego nie dostał. Dlatego datę zmieniamy tylko poza oknem (z godziną zapasu).
 */
const OKNO_ODNOWIENIA_MS = 25 * GODZINA;
export const MIN_POWOD_CYKLU = 10;

export interface Operator {
  userId: string;
  role: string;
}

/** Kto i dlaczego (D2): powód obowiązkowy, numer zgłoszenia klienta opcjonalny (musi być zgłoszeniem tego klienta). */
export interface ZlecenieCyklu {
  subscriptionId: string;
  operator: Operator;
  powod: string;
  zgloszenie?: string | null;
}

type Usluga = {
  id: string;
  userId: string;
  status: SubscriptionStatus;
  paymentSource: string;
  stripeSubscriptionId: string | null;
  currentPeriodEnd: Date | null;
  cancelAt: Date | null;
  paymentPromiseUntil: Date | null;
  isTrial: boolean;
  user: { role: string };
  account: { domain: string } | null;
};

const POLA = {
  id: true,
  userId: true,
  status: true,
  paymentSource: true,
  stripeSubscriptionId: true,
  currentPeriodEnd: true,
  cancelAt: true,
  paymentPromiseUntil: true,
  isTrial: true,
  user: { select: { role: true } },
  account: { select: { domain: true } },
} as const;

const kartowa = (s: Pick<Usluga, 'paymentSource' | 'stripeSubscriptionId'>) => s.paymentSource === 'STRIPE_CARD' && !!s.stripeSubscriptionId;
const bladStripe = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 200);

/**
 * F3.5 — cykl życia usługi zmieniany przez operatora z karty usługi (i z wniosku — rejestr-wnioskow.ts):
 * anulacja na koniec okresu i jej cofnięcie, zmiana daty odnowienia (przedłużenie gratis), obietnica zapłaty.
 *
 * Wzorzec F2.2 (akcje-konta-operatora.service.ts): powód (min. 10 znaków), zgłoszenie klienta, STAFF tylko na usługach
 * kont klientów (USER), wpis dla klienta „obsługa Verris (zgłoszenie #…)” bez nazwiska (D3) i dziennik zespołu
 * OPERATOR_ACCOUNT_CHANGED z powodem. Zdarzenia usługi (SubscriptionEvent) bez powodu i bez id pracownika — klient
 * widzi je w historii rozliczeń. Zmiany warunkowe (updateMany na stanie, który sprawdziliśmy): drugi klik albo
 * równoległy harmonogram nic nie psuje — operacja jest idempotentna albo kończy się 409.
 */
@Injectable()
export class CyklZyciaUslugiService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly stripe: StripeService,
  ) {}

  private async przygotuj(z: ZlecenieCyklu): Promise<{ s: Usluga; zgloszenieId: string | null; powod: string }> {
    const s = (await this.prisma.subscription.findUnique({ where: { id: z.subscriptionId }, select: POLA })) as Usluga | null;
    if (!s) throw new NotFoundException('Usługa nie istnieje.');
    // Ta sama twarda reguła co akcje konta (F2.2): STAFF zmienia tylko usługi klientów; usługi zespołu — ADMIN.
    if (z.operator.role !== 'ADMIN' && s.user.role !== 'USER') {
      throw new ForbiddenException('Personel może zmieniać wyłącznie usługi klientów — usługę konta zespołu zmienia administrator.');
    }
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD_CYKLU) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_CYKLU} znaków) — zapisze się w dzienniku.`);
    const zgloszenieId = await zgloszenieKlienta(this.prisma, s.userId, z.zgloszenie);
    return { s, zgloszenieId, powod };
  }

  /** Wpis klienta (aktywność konta) i dziennik zespołu z powodem. */
  private async zapisz(
    z: ZlecenieCyklu,
    s: Usluga,
    o: { akcja: string; wpisKlienta: string; powod: string; zgloszenieId: string | null; szczegoly: Record<string, string | number | null> },
  ) {
    const wspolne = { subscriptionId: s.id, domain: s.account?.domain ?? null, zgloszenieId: o.zgloszenieId, ...o.szczegoly };
    await this.audit.record({
      action: o.wpisKlienta,
      userId: s.userId,
      actorUserId: z.operator.userId,
      details: bezPustych(wspolne) as Prisma.InputJsonValue,
    });
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
      userId: s.userId,
      actorUserId: z.operator.userId,
      details: bezPustych({ ...wspolne, akcja: o.akcja, powod: o.powod, wynik: 'ok' }) as Prisma.InputJsonValue,
    });
  }

  // ── anulacja na koniec okresu ───────────────────────────────────────────────

  async anulujNaKoniecOkresu(z: ZlecenieCyklu) {
    const { s, zgloszenieId, powod } = await this.przygotuj(z);
    if (s.cancelAt && s.status === SubscriptionStatus.ACTIVE) {
      return { bezZmian: true, cancelAt: s.cancelAt.toISOString(), komunikat: 'Usługa jest już anulowana na koniec okresu.' };
    }
    const koniec = s.currentPeriodEnd;
    if (s.status !== SubscriptionStatus.ACTIVE || !koniec || koniec.getTime() <= Date.now()) {
      throw new BadRequestException('Na koniec okresu anulujesz tylko aktywną usługę z trwającym okresem. Zaległą albo zawieszoną kończy administrator.');
    }
    // Najpierw system płatności (jak SubscriptionsService.cancel): błąd = nic nie zmieniamy, karta nie zostaje „w tle”.
    if (kartowa(s)) {
      try {
        await this.stripe.cancelSubscription(s.stripeSubscriptionId!, { atPeriodEnd: true });
      } catch (err) {
        throw new ConflictException(`System płatności nie przyjął rezygnacji — nic nie zmieniono: ${bladStripe(err)}`);
      }
    }
    const { count } = await this.prisma.subscription.updateMany({
      // Audyt Fali 3 — także na koniec okresu, który przeczytaliśmy: odnowienie między odczytem a zapisem ustawiłoby
      // cancelAt na stary koniec przy opłaconym nowym okresie (usługa kończyła się przed końcem opłaconego okresu).
      where: { id: s.id, status: SubscriptionStatus.ACTIVE, cancelAt: null, currentPeriodEnd: koniec },
      data: { cancelAt: koniec },
    });
    if (count === 0) throw new ConflictException('Stan usługi zmienił się w międzyczasie — odśwież kartę.');
    await this.prisma.subscriptionEvent.create({
      data: { subscriptionId: s.id, type: 'CANCEL_SCHEDULED', details: { source: 'OPERATOR', effectiveAt: koniec.toISOString() } },
    });
    await this.zapisz(z, s, {
      akcja: 'anulacja-na-koniec-okresu',
      wpisKlienta: CyklZyciaUslugiActions.SUBSCRIPTION_CANCEL_SCHEDULED,
      powod,
      zgloszenieId,
      szczegoly: { effectiveAt: koniec.toISOString() },
    });
    return { bezZmian: false, cancelAt: koniec.toISOString(), komunikat: `Usługa działa do ${koniec.toISOString().slice(0, 10)} i nie odnowi się.` };
  }

  async cofnijAnulacje(z: ZlecenieCyklu) {
    const { s, zgloszenieId, powod } = await this.przygotuj(z);
    if (s.status === SubscriptionStatus.CANCELED || s.status === SubscriptionStatus.EXPIRED) {
      throw new BadRequestException('Usługa jest już zakończona — anulacji nie da się cofnąć. Klient zamawia usługę od nowa.');
    }
    if (!s.cancelAt) return { bezZmian: true, komunikat: 'Usługa nie jest anulowana — nic do cofnięcia.' };
    if (s.status !== SubscriptionStatus.ACTIVE || s.cancelAt.getTime() <= Date.now()) {
      throw new BadRequestException('Okres już minął — usługa jest właśnie kończona. Cofnięcia nie da się wykonać.');
    }
    // Audyt Fali 3 — cofnięcie rezygnacji, którą złożył klient, wznawia obciążanie jego portfela albo karty. Jak przy
    // skróceniu okresu i dodatku z portfela: tylko na jego prośbę (numer jego zgłoszenia) albo decyzją administratora.
    // Rezygnacja bez wpisu źródła (np. ustawiona z systemu płatności) liczy się jak rezygnacja klienta.
    if (!(await this.anulowanaPrzezObsluge(s.id))) {
      if (z.operator.role !== 'ADMIN' && !zgloszenieId) {
        throw new BadRequestException('Rezygnację złożył klient — cofniesz ją tylko na jego prośbę: podaj numer jego zgłoszenia.');
      }
      // W oknie odnowienia cofnięcie oznacza obciążenie w najbliższym przebiegu, a klient nie zdąży zrezygnować ponownie.
      if (s.paymentSource !== 'MANUAL' && s.cancelAt.getTime() - Date.now() < OKNO_ODNOWIENIA_MS) {
        throw new BadRequestException('Do końca okresu została mniej niż doba — rezygnacji klienta już nie cofniesz. Po zakończeniu klient zamówi usługę ponownie.');
      }
    }
    if (kartowa(s)) {
      try {
        await this.stripe.cofnijAnulacjeSubskrypcji(s.stripeSubscriptionId!);
      } catch (err) {
        throw new ConflictException(`System płatności nie przyjął cofnięcia rezygnacji — nic nie zmieniono: ${bladStripe(err)}`);
      }
    }
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: s.id, status: SubscriptionStatus.ACTIVE, cancelAt: s.cancelAt },
      data: { cancelAt: null },
    });
    if (count === 0) throw new ConflictException('Stan usługi zmienił się w międzyczasie — odśwież kartę.');
    await this.prisma.subscriptionEvent.create({ data: { subscriptionId: s.id, type: 'CANCEL_REVOKED', details: { source: 'OPERATOR' } } });
    await this.zapisz(z, s, {
      akcja: 'cofniecie-anulacji',
      wpisKlienta: CyklZyciaUslugiActions.SUBSCRIPTION_CANCEL_REVOKED,
      powod,
      zgloszenieId,
      szczegoly: {},
    });
    return { bezZmian: false, komunikat: 'Anulacja cofnięta — usługa odnowi się normalnie.' };
  }

  /** Ostatnią rezygnację zaplanowała obsługa (CANCEL_SCHEDULED z source OPERATOR), a nie klient. */
  private async anulowanaPrzezObsluge(subscriptionId: string): Promise<boolean> {
    const e = await this.prisma.subscriptionEvent.findFirst({
      where: { subscriptionId, type: 'CANCEL_SCHEDULED' },
      orderBy: { createdAt: 'desc' },
      select: { details: true },
    });
    const d = e?.details as { source?: unknown } | null | undefined;
    return d?.source === 'OPERATOR';
  }

  // ── data odnowienia (przedłużenie gratis) ───────────────────────────────────

  /**
   * Nowy koniec bieżącego okresu: później = przedłużenie gratis (koszt Verris — wniosek, akceptacja L4/ADMIN),
   * wcześniej = skrócenie opłaconego okresu, więc tylko na prośbę klienta (numer jego zgłoszenia obowiązkowy).
   * Usługi kartą cykliczną (Stripe) — odmowa: tam okres ustala system płatności (do decyzji właściciela).
   *
   * Audyt Fali 3 — `przed` to koniec okresu, który operator widział (formularz) albo wnioskujący (wniosek). Data
   * bezwzględna bez stanu wyjściowego po odnowieniu w międzyczasie (1.11 → 1.12) zamieniała przedłużenie do 8.11
   * w skrócenie opłaconego okresu i drugie obciążenie. Inny okres niż `przed` = 409, nic nie zmieniamy.
   */
  async zmienDateOdnowienia(z: ZlecenieCyklu & { nowaData: Date; przed: Date }) {
    const { s, zgloszenieId, powod } = await this.przygotuj(z);
    const nowa = z.nowaData;
    if (!(nowa instanceof Date) || Number.isNaN(nowa.getTime())) throw new BadRequestException('Nieprawidłowa data odnowienia.');
    const stary = s.currentPeriodEnd;
    if (stary && stary.getTime() === nowa.getTime()) {
      return { bezZmian: true, currentPeriodEnd: stary.toISOString(), komunikat: 'Usługa ma już tę datę odnowienia.' };
    }
    if (s.status !== SubscriptionStatus.ACTIVE || !stary) {
      throw new BadRequestException('Datę odnowienia zmienisz tylko w aktywnej usłudze. Przy zaległości użyj obietnicy zapłaty.');
    }
    if (!(z.przed instanceof Date) || Number.isNaN(z.przed.getTime())) {
      throw new BadRequestException('Brak obecnej daty odnowienia — odśwież kartę usługi.');
    }
    if (z.przed.getTime() !== stary.getTime()) {
      throw new ConflictException(
        `Data odnowienia zmieniła się od otwarcia formularza lub złożenia wniosku (teraz ${stary.toISOString().slice(0, 10)}, np. po odnowieniu) — nic nie zmieniono. Odśwież kartę i zdecyduj ponownie.`,
      );
    }
    if (s.cancelAt) throw new BadRequestException('Usługa jest anulowana na koniec okresu — najpierw cofnij anulację.');
    // Przegląd F3.5 — okres próbny kończy harmonogram prób z `trialEndsAt` (trial-expiry.scheduler.ts), nie z końca
    // okresu: przesunięcie currentPeriodEnd byłoby pozorne (klient widzi nową datę, a próba i tak wygasa).
    if (s.isTrial) {
      throw new BadRequestException('To okres próbny — kończy się z końcem próby. Zmiana daty dotyczy płatnej usługi.');
    }
    if (kartowa(s)) {
      throw new BadRequestException(
        'Usługa jest opłacana kartą cyklicznie — datę odnowienia ustala system płatności. Zmiana daty tej usługi czeka na decyzję właściciela.',
      );
    }
    const teraz = Date.now();
    if (s.paymentSource !== 'MANUAL' && stary.getTime() - teraz < OKNO_ODNOWIENIA_MS) {
      throw new BadRequestException('Do odnowienia zostało mniej niż doba — trwa automatyczne odnowienie. Zmień datę po nim albo użyj obietnicy zapłaty.');
    }
    if (nowa.getTime() - teraz < OKNO_ODNOWIENIA_MS) {
      throw new BadRequestException('Nowa data musi być co najmniej dobę od teraz.');
    }
    if (nowa.getTime() > stary.getTime() + ZMIANA_DATY_MAKS_DNI * DZIEN) {
      throw new BadRequestException(`Przedłużenie najwyżej o ${ZMIANA_DATY_MAKS_DNI} dni naraz.`);
    }
    const skrocenie = nowa.getTime() < stary.getTime();
    if (skrocenie && !zgloszenieId) {
      throw new BadRequestException('Skrócenie opłaconego okresu tylko na prośbę klienta — podaj numer jego zgłoszenia.');
    }
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: s.id, status: SubscriptionStatus.ACTIVE, cancelAt: null, currentPeriodEnd: stary },
      data: { currentPeriodEnd: nowa },
    });
    if (count === 0) throw new ConflictException('Stan usługi zmienił się w międzyczasie (np. odnowienie) — odśwież kartę.');
    const dni = Math.round((nowa.getTime() - stary.getTime()) / DZIEN);
    const szczegoly = { przed: stary.toISOString(), po: nowa.toISOString(), dni };
    await this.prisma.subscriptionEvent.create({ data: { subscriptionId: s.id, type: 'RENEWAL_DATE_CHANGED', details: { source: 'OPERATOR', ...szczegoly } } });
    await this.zapisz(z, s, {
      akcja: skrocenie ? 'skrocenie-okresu' : 'przedluzenie-gratis',
      wpisKlienta: CyklZyciaUslugiActions.SUBSCRIPTION_RENEWAL_DATE_CHANGED,
      powod,
      zgloszenieId,
      szczegoly,
    });
    return { bezZmian: false, currentPeriodEnd: nowa.toISOString(), dni, komunikat: `Nowa data odnowienia: ${nowa.toISOString().slice(0, 10)}.` };
  }

  // ── obietnica zapłaty ───────────────────────────────────────────────────────

  /**
   * Wstrzymanie automatycznego zawieszenia za brak płatności (PAST_DUE) na `dni` dni (1–7). Po dacie normalny cykl:
   * harmonogram zawiesza w pierwszym przebiegu (renewal.scheduler.ts runGraceExpiry). Jedna obietnica na zaległość
   * dla pracownika (L3); kolejną w tej samej zaległości daje administrator — inaczej obietnice szłyby łańcuchem.
   */
  async ustawObietniceZaplaty(z: ZlecenieCyklu & { dni: number }) {
    const { s, zgloszenieId, powod } = await this.przygotuj(z);
    if (!Number.isInteger(z.dni) || z.dni < 1 || z.dni > OBIETNICA_MAKS_DNI) {
      throw new BadRequestException(`Obietnica zapłaty: od 1 do ${OBIETNICA_MAKS_DNI} dni.`);
    }
    if (s.status !== SubscriptionStatus.PAST_DUE) {
      throw new BadRequestException('Obietnica zapłaty dotyczy usługi z zaległą płatnością, przed zawieszeniem.');
    }
    if (z.operator.role !== 'ADMIN') {
      const [nieudana, obietnica] = await Promise.all([
        this.prisma.subscriptionEvent.findFirst({ where: { subscriptionId: s.id, type: 'PAYMENT_FAILED' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
        this.prisma.subscriptionEvent.findFirst({ where: { subscriptionId: s.id, type: 'PAYMENT_PROMISE' }, orderBy: { createdAt: 'desc' }, select: { createdAt: true } }),
      ]);
      if (obietnica && (!nieudana || obietnica.createdAt >= nieudana.createdAt)) {
        throw new ForbiddenException('W tej zaległości obietnica już była — kolejną daje administrator.');
      }
    }
    const doKiedy = new Date(Date.now() + z.dni * DZIEN);
    const { count } = await this.prisma.subscription.updateMany({
      where: { id: s.id, status: SubscriptionStatus.PAST_DUE },
      data: { paymentPromiseUntil: doKiedy },
    });
    if (count === 0) throw new ConflictException('Stan usługi zmienił się w międzyczasie — odśwież kartę.');
    await this.prisma.subscriptionEvent.create({
      data: { subscriptionId: s.id, type: 'PAYMENT_PROMISE', details: { source: 'OPERATOR', do: doKiedy.toISOString(), dni: z.dni } },
    });
    await this.zapisz(z, s, {
      akcja: 'obietnica-zaplaty',
      wpisKlienta: CyklZyciaUslugiActions.SUBSCRIPTION_PAYMENT_PROMISE_SET,
      powod,
      zgloszenieId,
      szczegoly: { do: doKiedy.toISOString(), dni: z.dni },
    });
    return { paymentPromiseUntil: doKiedy.toISOString(), komunikat: `Bez zawieszenia do ${doKiedy.toLocaleString('pl-PL', { timeZone: 'Europe/Warsaw' })}.` };
  }

  async odwolajObietniceZaplaty(z: ZlecenieCyklu) {
    const { s, zgloszenieId, powod } = await this.przygotuj(z);
    if (!s.paymentPromiseUntil || s.paymentPromiseUntil.getTime() <= Date.now()) {
      return { bezZmian: true, komunikat: 'Usługa nie ma trwającej obietnicy zapłaty.' };
    }
    await this.prisma.subscription.updateMany({ where: { id: s.id, paymentPromiseUntil: s.paymentPromiseUntil }, data: { paymentPromiseUntil: null } });
    await this.prisma.subscriptionEvent.create({ data: { subscriptionId: s.id, type: 'PAYMENT_PROMISE_REVOKED', details: { source: 'OPERATOR' } } });
    await this.zapisz(z, s, {
      akcja: 'odwolanie-obietnicy-zaplaty',
      wpisKlienta: CyklZyciaUslugiActions.SUBSCRIPTION_PAYMENT_PROMISE_REVOKED,
      powod,
      zgloszenieId,
      szczegoly: {},
    });
    return { bezZmian: false, komunikat: 'Obietnica odwołana — przy zaległości usługa zostanie zawieszona w najbliższym przebiegu.' };
  }
}

function bezPustych<T extends Record<string, unknown>>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null)) as Partial<T>;
}

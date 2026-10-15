import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CustomerSubaccountInviteStatus, HostingRestoreStatus, MigrationStatus, SslOrderStatus, SubscriptionStatus, type Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { CyklZyciaUslugiActions, SupportActions } from '../common/audit/audit.actions.js';
import { uslugaPrzekazanaTemplate, uslugaPrzyjetaTemplate } from '../mail/templates/zmiana-wlasciciela-notifications.js';
import { OKNO_ODNOWIENIA_MS } from './cykl-zycia-uslugi.service.js';

export const MIN_POWOD_ZMIANY_WLASCICIELA = 10;

type Db = Prisma.TransactionClient;

/** Migracja ze starego hostingu, która jeszcze trwa (worker, obsługa albo zgoda klienta). */
const MIGRACJA_W_TOKU: MigrationStatus[] = [MigrationStatus.DRAFT, MigrationStatus.QUEUED, MigrationStatus.RUNNING, MigrationStatus.ATTENTION];
const ODTWORZENIE_W_TOKU: HostingRestoreStatus[] = [HostingRestoreStatus.QUEUED, HostingRestoreStatus.RUNNING, HostingRestoreStatus.SAFETY_BACKUP, HostingRestoreStatus.RESTORING];
/** Zamówienie SSL przed instalacją: zwrot przy niepowodzeniu idzie do SslOrder.userId — nie może zmienić adresata w trakcie. */
const SSL_W_TOKU: SslOrderStatus[] = [SslOrderStatus.PENDING, SslOrderStatus.VALIDATING, SslOrderStatus.ISSUED];

const POLA_KLIENTA = {
  id: true,
  email: true,
  firstName: true,
  role: true,
  customerOwnerId: true,
  loginBlocked: true,
  anonymizedAt: true,
  deletionRequestedAt: true,
  emailVerifiedAt: true,
  billingOutside: true,
  resellerOwnerId: true,
} as const;

export type KlientZmiany = Prisma.UserGetPayload<{ select: typeof POLA_KLIENTA }>;

/** Wszystko, co decyduje o zgodzie na przeniesienie — czytane jednym zestawem zapytań (także w transakcji). */
export interface StanZmianyWlasciciela {
  usluga: {
    id: string;
    userId: string;
    status: SubscriptionStatus;
    isTrial: boolean;
    paymentSource: string;
    stripeSubscriptionId: string | null;
    resellerMarkupPct: number | null;
    currentPeriodEnd: Date | null;
    cancelAt: Date | null;
    individualPrice: Prisma.Decimal | null;
    autoscalingEnabled: boolean;
    serviceTag: string | null;
    plan: { productKind: string };
    account: { id: string; domain: string; status: string } | null;
    siteMonitor: { paidTier: boolean } | null;
    user: KlientZmiany;
  };
  nowy: KlientZmiany | null;
  wToku: { migracje: number; przeniesieniaKonta: number; odtworzenia: number; ssl: number; wnioski: number; proformy: number };
}

const kartowa = (u: StanZmianyWlasciciela['usluga']) => u.paymentSource === 'STRIPE_CARD' && !!u.stripeSubscriptionId;

/**
 * K2 (PB-53.5, wariant minimalny 12.10) — powody, dla których usługi NIE przenosimy. Pusta lista = można.
 * Komunikaty dla administratora (mówią, co zrobić najpierw). Decyzje:
 *  - tylko ACTIVE: PAST_DUE odmawiamy, bo ponowienie zaległej płatności (renewal.scheduler retryPastDueNow /
 *    runGraceExpiry) obciążyłoby portfel NOWEGO właściciela za okres, z którego korzystał poprzedni; zawieszoną
 *    i zakładaną też nie — najpierw wyjaśnienie u obecnego właściciela;
 *  - karta cykliczna (Stripe): subskrypcja w systemie płatności obciąża kartę poprzedniego właściciela;
 *  - PB-28: rozliczenie poza Verris musi być takie samo po obu stronach (User.billingOutside ⇔ usługi MANUAL —
 *    warunki-indywidualne.service.ts rozliczeniePoza), inaczej nowy właściciel dostałby usługę bez opłat albo odwrotnie;
 *  - okres próbny przysługuje klientowi (User.trialStartedAt), nie usłudze; narzut resellera (O-07) należy do partnera
 *    poprzedniego właściciela;
 *  - okno odnowienia (doba przed końcem okresu): harmonogram obciąża portfel i przesuwa okres w dwóch krokach.
 */
export function odmowyZmianyWlasciciela(s: StanZmianyWlasciciela, teraz = Date.now()): string[] {
  const { usluga: u, nowy } = s;
  const odmowy: string[] = [];
  if (!nowy) return ['Nie ma klienta z tym adresem e-mail.'];
  if (nowy.id === u.userId) return ['To ten sam klient — usługa już należy do tego konta.'];
  if (u.user.role !== 'USER') odmowy.push('Przenosimy tylko usługi kont klientów — ta należy do konta zespołu.');
  if (nowy.role !== 'USER' || nowy.customerOwnerId) {
    odmowy.push('Nowym właścicielem może być tylko główne konto klienta (nie subkonto i nie konto zespołu).');
  }
  if (nowy.anonymizedAt || nowy.deletionRequestedAt) odmowy.push('Konto nowego właściciela jest usunięte albo w trakcie usuwania.');
  if (nowy.loginBlocked) odmowy.push('Konto nowego właściciela jest zablokowane.');
  if (!nowy.emailVerifiedAt) odmowy.push('Konto nowego właściciela nie jest aktywne — adres e-mail nie został potwierdzony.');

  const stanUslugi: Partial<Record<SubscriptionStatus, string>> = {
    PENDING_PAYMENT: 'Usługa czeka na pierwszą płatność — nie ma czego przenosić.',
    PROVISIONING: 'Usługa jest w trakcie zakładania — przeniesiesz ją, gdy konto będzie gotowe.',
    PAST_DUE: 'Usługa ma zaległą płatność — najpierw rozlicz ją u obecnego właściciela (zaległość nie przechodzi na nowego).',
    SUSPENDED: 'Usługa jest zawieszona — najpierw wyjaśnij zawieszenie u obecnego właściciela.',
    CANCELED: 'Usługa jest zakończona.',
    EXPIRED: 'Usługa jest zakończona.',
  };
  if (u.status !== SubscriptionStatus.ACTIVE) odmowy.push(stanUslugi[u.status] ?? 'Przenosimy tylko aktywną usługę.');
  else if (u.account?.status !== 'ACTIVE') odmowy.push('Konto hostingowe usługi nie jest aktywne (zakładanie, zawieszenie albo usuwanie).');
  if (u.plan.productKind === 'EMAIL_MARKETING') {
    odmowy.push('Zmiana właściciela dotyczy hostingu i poczty — usługa e-mail marketingu ma listy odbiorców poprzedniego właściciela.');
  }
  if (u.isTrial) odmowy.push('To okres próbny — przysługuje klientowi, nie usłudze. Przeniesiesz usługę po zamianie na płatną.');
  if (kartowa(u)) {
    odmowy.push('Usługa jest opłacana cyklicznie kartą obecnego właściciela — najpierw zakończ płatność kartą, inaczej jego karta dalej byłaby obciążana.');
  }
  if (u.user.billingOutside !== nowy.billingOutside) {
    odmowy.push('Rozliczenie poza Verris ma tylko jeden z klientów — najpierw ujednolić warunki rozliczenia na kartach klientów.');
  }
  if ((u.resellerMarkupPct ?? 0) > 0 && u.user.resellerOwnerId !== nowy.resellerOwnerId) {
    odmowy.push('Cena usługi zawiera narzut partnera obecnego właściciela — nowy właściciel nie jest klientem tego partnera.');
  }
  if (u.status === SubscriptionStatus.ACTIVE && u.paymentSource !== 'MANUAL' && u.currentPeriodEnd && u.currentPeriodEnd.getTime() - teraz < OKNO_ODNOWIENIA_MS) {
    odmowy.push('Do odnowienia została mniej niż doba — trwa automatyczne odnowienie. Przenieś usługę po nim.');
  }
  if (s.wToku.migracje > 0) odmowy.push('Trwa przenoszenie strony do tej usługi — poczekaj na koniec migracji albo ją anuluj.');
  if (s.wToku.przeniesieniaKonta > 0) odmowy.push('Czeka zlecenie przeniesienia konta — poczekaj, aż zostanie przyjęte.');
  if (s.wToku.odtworzenia > 0) odmowy.push('Trwa odtwarzanie kopii konta — poczekaj na koniec.');
  if (s.wToku.ssl > 0) odmowy.push('Zamówienie certyfikatu SSL jest w toku — poczekaj na jego instalację albo niepowodzenie.');
  if (s.wToku.wnioski > 0) odmowy.push('Na tę usługę czeka wniosek operatora — najpierw go rozstrzygnij.');
  // Przegląd 12.10 — wpłata do proformy idzie do portfela tego, komu ją wystawiono (poprzedniego właściciela), a odnowienie
  // obciąża portfel nowego: poprzedni zapłaciłby za nic, nowy dostałby zaległość.
  if (s.wToku.proformy > 0) {
    odmowy.push('Usługa ma otwartą proformę na odnowienie albo opłaconą, jeszcze niewykorzystaną — anuluj ją, poczekaj na odnowienie albo rozlicz wpłatę z poprzednim właścicielem.');
  }
  return odmowy;
}

const normalizujEmail = (e: string) => (e ?? '').trim().toLowerCase();

export interface ZlecenieZmianyWlasciciela {
  subscriptionId: string;
  operator: { userId: string; role: string };
  email: string;
  powod: string;
  /** Adres nowego właściciela wpisany ponownie przez administratora. */
  potwierdzenie: string;
}

/**
 * K2 (PB-53.5) — zmiana właściciela usługi hostingu przez administratora (wariant minimalny, decyzja 12.10).
 *
 * Przechodzi za usługą (jedna transakcja — wszystko albo nic):
 *  - Subscription.userId i Account.userId (portfel do odnowień, autoskalowania i płatnego monitoringu czyta właściciela
 *    usługi albo konta: renewal.scheduler.ts, autoscaling-billing.service.ts, site-monitor.service.ts);
 *  - SslOrder.userId certyfikatów usługi (panel i instalacja szukają po userId + subscriptionId), AnalyticsSite.userId;
 *  - przez subscriptionId same idą: harmonogram kopii, monitoring, kontrole domen, metryki, zdarzenia usługi (klient widzi
 *    tylko te od OWNER_CHANGED — zdarzenia-klienta.ts; wcześniejsze, np. dane starego hostingu z migracji, widzi obsługa).
 * Zostaje u poprzedniego właściciela: faktury, transakcje portfela, dodatki (zakupy), kredyty SLA, punkty EKO, zgłoszenia
 * (odpięte od usługi),
 * zlecenia migracji (dane jego starego hostingu — sekrety kasujemy, żeby nowy właściciel nie mógł ich użyć do
 * dogrania), domeny u rejestratora (Domain nie ma związku z usługą), dziennik i powiadomienia.
 * Dostęp poprzedniego właściciela znika: subkonta, członkostwa i zaproszenia ograniczone do tej usługi tracą ją (gdy
 * była jedyna — wyłączone, a nie „całe konto”), webhooki wdrożeń (tajny adres znany poprzedniemu) są usuwane.
 * Węzła nie ruszamy: login konta się nie zmienia, a adres konta w panelu serwera to alias węzła, nie e-mail klienta
 * (provisioning.service.ts emailKontaDa) — nic per klient tam nie ma. Hasła na koncie (FTP, poczta, bazy, klucze SSH)
 * zostają — nowy właściciel dostaje w mailu prośbę o ich zmianę.
 */
@Injectable()
export class ZmianaWlascicielaService {
  private readonly logger = new Logger(ZmianaWlascicielaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  private async wczytaj(db: Db, subscriptionId: string, email: string): Promise<StanZmianyWlasciciela> {
    const usluga = await db.subscription.findUnique({
      where: { id: subscriptionId },
      select: {
        id: true,
        userId: true,
        status: true,
        isTrial: true,
        paymentSource: true,
        stripeSubscriptionId: true,
        resellerMarkupPct: true,
        currentPeriodStart: true,
        currentPeriodEnd: true,
        cancelAt: true,
        individualPrice: true,
        autoscalingEnabled: true,
        serviceTag: true,
        plan: { select: { productKind: true } },
        account: { select: { id: true, domain: true, status: true } },
        siteMonitor: { select: { paidTier: true } },
        user: { select: POLA_KLIENTA },
      },
    });
    if (!usluga) throw new NotFoundException('Usługa nie istnieje.');
    const adres = normalizujEmail(email);
    const nowy = adres ? await db.user.findFirst({ where: { email: { equals: adres, mode: 'insensitive' } }, select: POLA_KLIENTA }) : null;
    // Po kolei, nie Promise.all: w transakcji jedno połączenie — równoległe zapytania sterownik pg odradza.
    const migracje = await db.migrationRequest.count({ where: { subscriptionId, status: { in: MIGRACJA_W_TOKU } } });
    // Zlecenie przeniesienia konta (MIGRATION_*_REQUESTED) jeszcze nieprzyjęte — ta sama reguła co kolejka
    // migration-worker.scheduler.ts: brak zdarzenia QUEUED/FAILED z details.requestId tego zlecenia.
    const [oczekujace] = await db.$queryRaw<Array<{ n: bigint }>>`
      SELECT COUNT(*) AS n FROM "SubscriptionEvent" r
      WHERE r."subscriptionId" = ${subscriptionId}
        AND r.type IN ('MIGRATION_EXTERNAL_REQUESTED', 'MIGRATION_INTERNAL_REQUESTED')
        AND NOT EXISTS (
          SELECT 1 FROM "SubscriptionEvent" p
          WHERE p."subscriptionId" = r."subscriptionId"
            AND p.type IN ('MIGRATION_EXTERNAL_QUEUED', 'MIGRATION_EXTERNAL_FAILED', 'MIGRATION_INTERNAL_QUEUED', 'MIGRATION_INTERNAL_FAILED')
            AND p.details->>'requestId' = r.id
        )`;
    const przeniesieniaKonta = Number(oczekujace?.n ?? 0);
    const odtworzenia = await db.hostingRestoreJob.count({ where: { subscriptionId, status: { in: ODTWORZENIE_W_TOKU } } });
    const ssl = await db.sslOrder.count({ where: { subscriptionId, status: { in: SSL_W_TOKU } } });
    const wnioski = await db.operatorRequest.count({ where: { subscriptionId, status: 'PENDING' } });
    // Przegląd 15.10: także proforma OPŁACONA w bieżącym okresie — pieniądze czekają w portfelu poprzedniego właściciela
    // na odnowienie, które po przeniesieniu obciążyłoby portfel nowego.
    const proformy = await db.proforma.count({
      where: {
        subscriptionId,
        OR: [{ status: 'WYSTAWIONA' }, { status: 'OPLACONA', paidAt: { gte: usluga.currentPeriodStart ?? new Date(0) } }],
      },
    });
    return { usluga, nowy, wToku: { migracje, przeniesieniaKonta, odtworzenia, ssl, wnioski, proformy } };
  }

  /** Podgląd dla karty usługi: kogo znaleziono, czy wolno, co przejdzie — bez zmian w bazie. */
  async podglad(subscriptionId: string, email: string) {
    const s = await this.wczytaj(this.prisma, subscriptionId, email);
    const u = s.usluga;
    const uwagi: string[] = [];
    if (u.individualPrice) uwagi.push(`Indywidualna cena usługi (${u.individualPrice.toFixed(2)} zł) zostaje przy usłudze — zmienisz ją w warunkach usługi.`);
    if (u.cancelAt) uwagi.push('Usługa jest anulowana na koniec okresu — po przeniesieniu nadal się nie odnowi.');
    const platne = this.platneDodatki(u);
    if (platne.length) uwagi.push(`Płatne dodatki (${platne.join(', ')}) od przeniesienia obciążają portfel nowego właściciela.`);
    return {
      usluga: { id: u.id, domena: u.account?.domain ?? u.serviceTag ?? u.id, obecnyWlasciciel: u.user.email },
      nowyWlasciciel: s.nowy ? { id: s.nowy.id, email: s.nowy.email, imie: s.nowy.firstName } : null,
      odmowy: odmowyZmianyWlasciciela(s),
      uwagi,
    };
  }

  private platneDodatki(u: StanZmianyWlasciciela['usluga']): string[] {
    return [...(u.autoscalingEnabled ? ['autoskalowanie'] : []), ...(u.siteMonitor?.paidTier ? ['płatny monitoring strony'] : [])];
  }

  async przenies(z: ZlecenieZmianyWlasciciela) {
    // Kontroler wpuszcza tylko ADMIN-a; serwis pilnuje tego sam (operacja wrażliwa jak zmiana e-maila klienta).
    if (z.operator.role !== 'ADMIN') throw new ForbiddenException('Zmianę właściciela usługi wykonuje tylko administrator.');
    const powod = (z.powod ?? '').trim();
    if (powod.length < MIN_POWOD_ZMIANY_WLASCICIELA) {
      throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD_ZMIANY_WLASCICIELA} znaków) — zapisze się w dzienniku.`);
    }
    if (!normalizujEmail(z.email) || normalizujEmail(z.potwierdzenie) !== normalizujEmail(z.email)) {
      throw new BadRequestException('Wpisany adres nie zgadza się z adresem nowego właściciela — nic nie zmieniono.');
    }

    // Odmowa bez otwierania transakcji; pod blokadą sprawdzamy jeszcze raz (stan mógł się zmienić).
    const przed = odmowyZmianyWlasciciela(await this.wczytaj(this.prisma, z.subscriptionId, z.email));
    if (przed.length) throw new BadRequestException(przed.join(' '));

    const wynik = await this.prisma.$transaction(async (tx) => {
      // Blokada wiersza usługi: dwie zmiany właściciela naraz (albo zmiana z odnowieniem) idą po kolei, a reguły
      // sprawdzamy już pod blokadą — stan sprzed transakcji mógł się zmienić.
      await tx.$queryRaw`SELECT id FROM "Subscription" WHERE id = ${z.subscriptionId} FOR UPDATE`;
      const s = await this.wczytaj(tx, z.subscriptionId, z.email);
      const odmowy = odmowyZmianyWlasciciela(s);
      if (odmowy.length) throw new BadRequestException(odmowy.join(' '));
      const u = s.usluga;
      const stary = u.user;
      const nowy = s.nowy!;
      const teraz = new Date();

      const { count } = await tx.subscription.updateMany({
        where: { id: u.id, userId: stary.id, status: SubscriptionStatus.ACTIVE },
        data: { userId: nowy.id },
      });
      if (count !== 1) throw new ConflictException('Stan usługi zmienił się w międzyczasie — odśwież kartę.');
      await tx.account.update({ where: { id: u.account!.id }, data: { userId: nowy.id } });
      const ssl = await tx.sslOrder.updateMany({ where: { subscriptionId: u.id }, data: { userId: nowy.id } });
      const analityka = await tx.analyticsSite.updateMany({ where: { subscriptionId: u.id }, data: { userId: nowy.id } });
      const webhooki = await tx.gitWebhook.deleteMany({ where: { accountId: u.account!.id } });
      // Zlecenia migracji zostają u poprzedniego właściciela (to dane jego starego hostingu), ale ich historię widać na
      // karcie usługi, a dogranie (delta-sync) użyłoby jego haseł — kasujemy je jak retencja (purgeExpiredSecrets).
      const sekrety = await tx.migrationRequest.updateMany({
        where: { subscriptionId: u.id, secretsPurgedAt: null },
        data: { sourceBundleEnc: '', secretsPurgedAt: teraz },
      });
      const iam = await this.odbierzDostep(tx, stary.id, u.id, teraz);
      // Zgłoszenia zostają u poprzedniego właściciela, ale bez powiązania z usługą, której już nie ma: inaczej jego
      // panel dalej pokazuje przy nich domenę i plan usługi, a obsługa uruchamia z nich diagnostykę cudzej usługi.
      const zgloszenia = await tx.ticket.updateMany({ where: { subscriptionId: u.id, userId: stary.id }, data: { subscriptionId: null } });

      // „Co się działo” — widzi to tylko obecny właściciel: bez adresów, powodu i operatora (D3).
      await tx.subscriptionEvent.create({ data: { subscriptionId: u.id, type: 'OWNER_CHANGED', details: { source: 'OPERATOR' } } });
      const domena = u.account!.domain;
      const zespol = {
        subscriptionId: u.id,
        domain: domena,
        akcja: 'zmiana-wlasciciela',
        powod,
        poprzedniWlasciciel: { id: stary.id, email: stary.email },
        nowyWlasciciel: { id: nowy.id, email: nowy.email },
        przeniesione: { certyfikatySsl: ssl.count, analityka: analityka.count },
        usuniete: { webhookiWdrozen: webhooki.count, sekretyMigracji: sekrety.count, powiazaniaZgloszen: zgloszenia.count },
        dostepPoprzedniego: iam,
        wynik: 'ok',
      };
      await tx.auditLog.createMany({
        data: [
          { action: CyklZyciaUslugiActions.SUBSCRIPTION_OWNER_CHANGED, userId: stary.id, actorUserId: z.operator.userId, details: { subscriptionId: u.id, domain: domena, kierunek: 'oddana' } },
          { action: CyklZyciaUslugiActions.SUBSCRIPTION_OWNER_CHANGED, userId: nowy.id, actorUserId: z.operator.userId, details: { subscriptionId: u.id, domain: domena, kierunek: 'przyjeta' } },
          { action: SupportActions.OPERATOR_ACCOUNT_CHANGED, userId: stary.id, actorUserId: z.operator.userId, details: zespol },
          { action: SupportActions.OPERATOR_ACCOUNT_CHANGED, userId: nowy.id, actorUserId: z.operator.userId, details: zespol },
        ],
      });
      return { u, stary, nowy, domena, iam };
    });

    await this.powiadom(wynik.u, wynik.stary, wynik.nowy, wynik.domena);
    return {
      komunikat: `Usługa ${wynik.domena} należy teraz do ${wynik.nowy.email}.`,
      nowyWlasciciel: { id: wynik.nowy.id, email: wynik.nowy.email },
      dostepPoprzedniego: wynik.iam,
    };
  }

  /**
   * Subkonta, członkostwa (PB-20) i oczekujące zaproszenia poprzedniego właściciela ograniczone do wybranych usług
   * tracą tę usługę. Pusta lista znaczy „całe konto” (customer-permissions.guard.ts), więc ostatniej usługi z listy nie
   * usuwamy — dostęp wyłączamy (zaproszenie odwołujemy). Dostęp „do całego konta” znika sam: usługa nie należy już do
   * jego właściciela (każde żądanie sprawdza Subscription.userId).
   */
  private async odbierzDostep(tx: Prisma.TransactionClient, ownerId: string, subscriptionId: string, teraz: Date) {
    const wynik = { subkontaZawezone: 0, subkontaWylaczone: 0, czlonkostwaZawezone: 0, czlonkostwaWylaczone: 0, zaproszeniaZawezone: 0, zaproszeniaOdwolane: 0 };
    const subkonta = await tx.user.findMany({ where: { customerOwnerId: ownerId, subaccountServiceIds: { has: subscriptionId } }, select: { id: true, subaccountServiceIds: true } });
    for (const s of subkonta) {
      const reszta = s.subaccountServiceIds.filter((id) => id !== subscriptionId);
      if (reszta.length) {
        await tx.user.update({ where: { id: s.id }, data: { subaccountServiceIds: reszta } });
        wynik.subkontaZawezone += 1;
      } else {
        await tx.user.update({ where: { id: s.id }, data: { subaccountDisabledAt: teraz } });
        wynik.subkontaWylaczone += 1;
      }
    }
    const czlonkostwa = await tx.customerMembership.findMany({ where: { ownerUserId: ownerId, serviceIds: { has: subscriptionId } }, select: { id: true, serviceIds: true } });
    for (const m of czlonkostwa) {
      const reszta = m.serviceIds.filter((id) => id !== subscriptionId);
      if (reszta.length) {
        await tx.customerMembership.update({ where: { id: m.id }, data: { serviceIds: reszta } });
        wynik.czlonkostwaZawezone += 1;
      } else {
        await tx.customerMembership.update({ where: { id: m.id }, data: { disabledAt: teraz } });
        wynik.czlonkostwaWylaczone += 1;
      }
    }
    const zaproszenia = await tx.customerSubaccountInvite.findMany({
      where: { ownerUserId: ownerId, status: CustomerSubaccountInviteStatus.PENDING, serviceIds: { has: subscriptionId } },
      select: { id: true, serviceIds: true },
    });
    for (const i of zaproszenia) {
      const reszta = i.serviceIds.filter((id) => id !== subscriptionId);
      if (reszta.length) {
        await tx.customerSubaccountInvite.update({ where: { id: i.id }, data: { serviceIds: reszta } });
        wynik.zaproszeniaZawezone += 1;
      } else {
        await tx.customerSubaccountInvite.update({ where: { id: i.id }, data: { status: CustomerSubaccountInviteStatus.REVOKED, revokedAt: teraz } });
        wynik.zaproszeniaOdwolane += 1;
      }
    }
    return wynik;
  }

  /** Maile po zatwierdzeniu transakcji — błąd wysyłki nie cofa przeniesienia (jak potwierdzenie zmiany planu). */
  private async powiadom(u: StanZmianyWlasciciela['usluga'], stary: KlientZmiany, nowy: KlientZmiany, domena: string) {
    const panelUrl = this.config.get<string>('CLIENT_PANEL_URL') ?? 'https://panel.verris.pl';
    const wiadomosci = [
      uslugaPrzekazanaTemplate({ to: stary.email, userId: stary.id, firstName: stary.firstName, usluga: domena, panelUrl }),
      uslugaPrzyjetaTemplate({
        to: nowy.email,
        userId: nowy.id,
        firstName: nowy.firstName,
        usluga: domena,
        panelUrl,
        subscriptionId: u.id,
        odnowienie: u.currentPeriodEnd?.toISOString() ?? null,
        anulowanaDo: u.cancelAt?.toISOString() ?? null,
        platneDodatki: this.platneDodatki(u),
      }),
    ];
    for (const m of wiadomosci) {
      try {
        await this.mailer.send(m);
      } catch (err) {
        this.logger.warn(`Mail o zmianie właściciela usługi ${u.id} nie wyszedł (${m.tag}): ${(err as Error).message}`);
      }
    }
  }
}

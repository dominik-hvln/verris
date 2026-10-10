import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions, SupportActions } from '../common/audit/audit.actions.js';
import { FRAZA_KOLEJKI, ID_WIADOMOSCI_EXIMA, stanKolejki } from '../servers/kolejka-poczty.js';
import { LIMIT_WYSYLKI_MAX, limitZLogu, stanZadan } from '../servers/poczta-wezla.js';
import { HOSTING_MAIL_DAILY_SEND_LIMIT } from '@verris/contracts';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { OutboundAbuseGuard } from '../deliverability/outbound-abuse.guard.js';
import { AkcjeKontaOperatoraService, type ZlecenieOperatora } from './akcje-konta-operatora.service.js';

/** Tryby zadania MAIL_QUEUE, które należą do kolejki (tryb `limit` — limit wysyłki, osobno). */
const TRYBY_KOLEJKI = ['list', 'remove', 'flush'] as const;

/** Usuwać można tylko wiadomości z podglądu nie starszego niż godzina (operator widział, co usuwa). */
export const WAZNOSC_PODGLADU_MS = 60 * 60 * 1000;
const MAX_DO_USUNIECIA = 500;

/** Początek powodu kordonu nałożonego razem z blokadą obsługi — zwolnienie zdejmuje tylko taki kordon. */
export const KORDON_Z_BLOKADY = 'Blokada wysyłki konta przez obsługę';

/**
 * F3.1 (D4, 10.10) — poczta konta w panelu operatora: blokada i zwolnienie wysyłki.
 *
 * Blokada działa na węźle: konto trafia na listę `blacklist_usernames` exima DirectAdmina (directadmin.service.ts
 * ustawBlokadeWysylki → SDK setEmailSendBlocked, dokumentacja DA w komentarzu SDK) — exim odrzuca wtedy wysyłkę
 * SMTP z logowaniem i z PHP (mail()), a wiadomość nie trafia do kolejki. Limit dobowy konta nie jest zmieniany,
 * więc zwolnienie przywraca dokładnie poprzedni stan. Do tego kordon w Redis (outbound-abuse.guard.ts), który
 * zatrzymuje wysyłkę z modułu marketingu tego klienta.
 *
 * Reguły D2/D3 z paska akcji konta (AkcjeKontaOperatoraService.wykonaj): powód obowiązkowy, zgłoszenie klienta
 * opcjonalne, STAFF tylko na kontach klientów, dziennik zespołu z wynikiem (także błąd węzła), a klient widzi wpis
 * „obsługa Verris (zgłoszenie #…)”. Stan blokady (kto, kiedy, powód) w Account.mailBlocked*.
 *
 * Kolejka konta: zadanie węzła MAIL_QUEUE (ops/scripts/node-mail-queue.sh, podpisany skrypt agenta) — tylko nagłówki
 * (id, nadawca, odbiorcy, temat, rozmiar, wiek, zamrożona), nigdy treść. Wiadomość należy do konta, gdy wysłał ją
 * użytkownik DA (mail() z PHP), skrzynka konta (SMTP) albo adres w domenach konta — sprawdza to węzeł. Usunięcie
 * (nieodwracalne): tylko identyfikatory z ostatniego podglądu, węzeł ponownie sprawdza przynależność do konta,
 * a liczbę usuniętych zapisuje NodeTasksService po zakończeniu zadania (MAIL_QUEUE_MESSAGES_REMOVED).
 *
 * Limit wysyłki konta (F3.1 reszta): dobowy limit użytkownika DA = plik /etc/virtual/limit_<login> (dokumentacja DA
 * w ops/scripts/node-mail-queue.sh, tryb `limit`). Odczyt — L2 (MAIL_QUEUE_VIEW), zmiana — L3 (MAIL_SEND_BLOCK) przez
 * wspólny przebieg akcji (powód, zgłoszenie, dziennik, wpis klienta). Account.mailSendLimit zapisuje NodeTasksService
 * dopiero, gdy węzeł potwierdzi wartość — panel klienta pokazuje limit, który naprawdę działa.
 */
@Injectable()
export class PocztaKontaOperatoraService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directAdmin: DirectAdminService,
    private readonly akcje: AkcjeKontaOperatoraService,
    private readonly kordon: OutboundAbuseGuard,
    private readonly audit: AuditService,
  ) {}

  /**
   * Stan blokady: z bazy (kto, kiedy, powód) i z węzła. Rozjazd (np. węzeł odtworzony z kopii) widać od razu —
   * ponowne „Zablokuj” go naprawia. Błąd odczytu z węzła nie ukrywa stanu z bazy.
   */
  async stan(subscriptionId: string) {
    const a = await this.prisma.account.findUnique({
      where: { subscriptionId },
      select: { daUsername: true, serverId: true, mailBlockedAt: true, mailBlockedById: true, mailBlockedReason: true },
    });
    if (!a) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    let naWezle: boolean | null = null;
    let obslugiwana: boolean | null = null;
    let bladWezla: string | null = null;
    try {
      const w = await this.directAdmin.blokadaWysylkiNaWezle(a.serverId, a.daUsername);
      naWezle = w.zablokowana;
      obslugiwana = w.obslugiwana;
    } catch (err) {
      bladWezla = (err instanceof Error ? err.message : String(err)).slice(0, 300);
    }
    const przez = a.mailBlockedById
      ? await this.prisma.user.findUnique({ where: { id: a.mailBlockedById }, select: { email: true } })
      : null;
    return {
      zablokowana: a.mailBlockedAt !== null,
      od: a.mailBlockedAt?.toISOString() ?? null,
      przez: przez?.email ?? null,
      powod: a.mailBlockedReason,
      naWezle,
      obslugiwana,
      bladWezla,
    };
  }

  /** Idempotentne: konto już zablokowane zostaje z pierwotnym „kto, kiedy, powód”, węzeł jest wyrównany. */
  async zablokuj(z: ZlecenieOperatora) {
    return this.akcje.wykonaj(
      z,
      'blokada-wysylki',
      {},
      async (w) => {
        const { zmieniono } = await this.directAdmin.ustawBlokadeWysylki(w.konto.serverId, w.konto.daUsername, true);
        const juz = await this.prisma.account.updateMany({
          where: { id: w.konto.id, mailBlockedAt: null },
          data: { mailBlockedAt: new Date(), mailBlockedById: z.operatorUserId, mailBlockedReason: z.powod.trim().slice(0, 500) },
        });
        // Przegląd F3.1 — kordon już nałożony (np. automatyczny po skoku wysyłki) zostaje ze swoim powodem: cordon()
        // nadpisuje powód, a „Zwolnij” zdjęłoby wtedy kordon, którego obsługa nie nakładała.
        if (!(await this.kordon.isCordoned(w.userId))) {
          await this.kordon.cordon(w.userId, `${KORDON_Z_BLOKADY}: ${z.powod.trim()}`.slice(0, 300), {
            subscriptionId: z.subscriptionId,
            source: 'operator',
          });
        }
        return { ok: true as const, zablokowana: true, juzByla: juz.count === 0, zmienionoNaWezle: zmieniono };
      },
      { action: HostingResourceActions.HOSTING_MAIL_SENDING_BLOCKED, details: {} },
    );
  }

  /**
   * Zdejmuje blokadę na węźle i w bazie. Kordon marketingu zdejmuje tylko, gdy pochodził z blokady obsługi
   * i żadne inne konto klienta nie jest zablokowane — kordon nałożony automatycznie (skok wysyłki) zostaje.
   */
  async zwolnij(z: ZlecenieOperatora) {
    return this.akcje.wykonaj(
      z,
      'zwolnienie-wysylki',
      {},
      async (w) => {
        const { zmieniono } = await this.directAdmin.ustawBlokadeWysylki(w.konto.serverId, w.konto.daUsername, false);
        await this.prisma.account.update({
          where: { id: w.konto.id },
          data: { mailBlockedAt: null, mailBlockedById: null, mailBlockedReason: null },
        });
        const inne = await this.prisma.account.count({ where: { userId: w.userId, id: { not: w.konto.id }, mailBlockedAt: { not: null } } });
        const powod = await this.kordon.powodKordonu(w.userId);
        const kordonZdjety = inne === 0 && !!powod?.startsWith(KORDON_Z_BLOKADY);
        if (kordonZdjety) await this.kordon.release(w.userId, z.operatorUserId);
        return { ok: true as const, zablokowana: false, zmienionoNaWezle: zmieniono, kordonZdjety };
      },
      { action: HostingResourceActions.HOSTING_MAIL_SENDING_UNBLOCKED, details: {} },
    );
  }

  private async konto(subscriptionId: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id: subscriptionId },
      select: { userId: true, account: { select: { id: true, serverId: true, daUsername: true, domain: true, status: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    if (!sub.account) throw new NotFoundException('Usługa nie ma konta hostingowego.');
    return { userId: sub.userId, account: sub.account };
  }

  /** Zadania kolejki konta (bez zadań limitu — te mają własne okno, inaczej wypychałyby podgląd z ostatnich 10). */
  private zadania(accountId: string) {
    return this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.MAIL_QUEUE, OR: TRYBY_KOLEJKI.map((t) => ({ payload: { path: ['mode'], equals: t } })) },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
  }

  private zadaniaLimitu(accountId: string) {
    return this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.MAIL_QUEUE, payload: { path: ['mode'], equals: 'limit' } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
  }

  /** Limit z bazy (potwierdzony przez węzeł) i ostatni odczyt z węzła; `obowiazuje` — to, co widzi klient. */
  async limit(subscriptionId: string) {
    const { account } = await this.konto(subscriptionId);
    const a = await this.prisma.account.findUnique({ where: { id: account.id }, select: { mailSendLimit: true } });
    const stan = stanZadan(await this.zadaniaLimitu(account.id), limitZLogu);
    return {
      limitKonta: a?.mailSendLimit ?? null,
      domyslny: HOSTING_MAIL_DAILY_SEND_LIMIT,
      obowiazuje: a?.mailSendLimit ?? HOSTING_MAIL_DAILY_SEND_LIMIT,
      max: LIMIT_WYSYLKI_MAX,
      ...stan,
    };
  }

  private async zlecLimit(account: { id: string; serverId: string; daUsername: string; status: string }, operatorUserId: string, wartosc?: number | null) {
    if (account.status === 'DELETED' || account.status === 'PROVISIONING') throw new BadRequestException('Konto hostingowe nie działa na serwerze.');
    const zadania = await this.zadaniaLimitu(account.id);
    if (zadania.some((t) => t.status === NodeTaskStatus.QUEUED || t.status === NodeTaskStatus.RUNNING)) {
      throw new ConflictException('Poprzednia operacja na limicie jeszcze trwa — chwila.');
    }
    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.MAIL_QUEUE,
        status: NodeTaskStatus.QUEUED,
        requestedById: operatorUserId,
        payload: {
          mode: 'limit',
          daUser: account.daUsername,
          ...(wartosc === undefined ? {} : { limit: wartosc === null ? 'domyslny' : String(wartosc) }),
        },
      },
    });
  }

  /** Odczyt limitu z węzła (np. po ręcznej zmianie na serwerze); wynik nadpisuje stan w bazie. */
  async wczytajLimit(subscriptionId: string, operatorUserId: string) {
    const { userId, account } = await this.konto(subscriptionId);
    await this.zlecLimit(account, operatorUserId);
    await this.audit.record({ action: SupportActions.OPERATOR_ACCOUNT_VIEWED, userId, actorUserId: operatorUserId, details: { subscriptionId, sekcja: 'limit-wysylki' } });
    return this.limit(subscriptionId);
  }

  /**
   * Ustawia dobowy limit wysyłki konta (1–LIMIT_WYSYLKI_MAX) albo przywraca domyślny serwera (`null`). Odwracalne —
   * bezpośrednio z powodem (D2); klient widzi „obsługa Verris (zgłoszenie #…)” i nową wartość po potwierdzeniu węzła.
   */
  async ustawLimit(z: ZlecenieOperatora, wartosc: number | null) {
    if (wartosc !== null && (!Number.isInteger(wartosc) || wartosc < 1 || wartosc > LIMIT_WYSYLKI_MAX)) {
      throw new BadRequestException(`Limit: liczba od 1 do ${LIMIT_WYSYLKI_MAX} albo domyślny serwera.`);
    }
    const { account } = await this.konto(z.subscriptionId);
    return this.akcje.wykonaj(
      z,
      'limit-wysylki',
      { limit: wartosc ?? 'domyslny' },
      async (w) => {
        const t = await this.zlecLimit({ ...account, id: w.konto.id, serverId: w.konto.serverId, daUsername: w.konto.daUsername }, z.operatorUserId, wartosc);
        return { ok: true as const, zadanieId: t.id, limit: wartosc };
      },
      { action: HostingResourceActions.HOSTING_MAIL_SEND_LIMIT_CHANGED, details: { limit: wartosc ?? HOSTING_MAIL_DAILY_SEND_LIMIT, domyslny: wartosc === null } },
    );
  }

  /**
   * Ostatni podgląd kolejki konta (i stan usuwania). Wpis w dzienniku, gdy operator dostaje nagłówki — nie przy
   * każdym odpytaniu w trakcie wczytywania.
   */
  async kolejka(subscriptionId: string, operatorUserId: string) {
    const { userId, account } = await this.konto(subscriptionId);
    const stan = stanKolejki(await this.zadania(account.id));
    if (!stan.wToku && stan.wiadomosci.length) {
      await this.audit.record({
        action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
        userId,
        actorUserId: operatorUserId,
        details: { subscriptionId, sekcja: 'kolejka-poczty', wiadomosci: stan.wiadomosci.length },
      });
    }
    return stan;
  }

  /** Zleca węzłowi świeży odczyt kolejki konta (nagłówki); domeny konta podaje API, nie operator. */
  async wczytajKolejke(subscriptionId: string, operatorUserId: string, szukaj?: string) {
    const { userId, account } = await this.konto(subscriptionId);
    if (account.status === 'DELETED' || account.status === 'PROVISIONING') throw new BadRequestException('Konto hostingowe nie działa na serwerze.');
    const fraza = (szukaj ?? '').trim();
    if (fraza && !FRAZA_KOLEJKI.test(fraza)) throw new BadRequestException('Fraza: do 100 znaków, bez znaków sterujących.');
    const zadania = await this.zadania(account.id);
    if (stanKolejki(zadania).wToku) throw new ConflictException('Kolejka już się wczytuje — chwila.');
    const domeny = await this.domenyKonta(subscriptionId, userId, account.domain);
    await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.MAIL_QUEUE,
        status: NodeTaskStatus.QUEUED,
        requestedById: operatorUserId,
        payload: { mode: 'list', daUser: account.daUsername, domains: domeny.join(','), ...(fraza ? { szukaj: fraza } : {}) },
      },
    });
    await this.audit.record({
      action: SupportActions.OPERATOR_ACCOUNT_VIEWED,
      userId,
      actorUserId: operatorUserId,
      details: { subscriptionId, sekcja: 'kolejka-poczty', ...(fraza ? { szukaj: fraza } : {}) },
    });
    return stanKolejki(await this.zadania(account.id));
  }

  private async domenyKonta(subscriptionId: string, userId: string, glowna: string): Promise<string[]> {
    const { domains } = await this.directAdmin.listHostingDomainsForSubscription(subscriptionId, userId);
    return [...new Set([glowna, ...domains.map((d) => d.name)].map((d) => d.toLowerCase()))].slice(0, 200);
  }

  /**
   * „Usuń wiadomości konta z kolejki” — nieodwracalne, więc tylko identyfikatory z ostatniego podglądu (≤ 1 h),
   * z powodem (D2) i wpisem dla klienta (D3). Węzeł usuwa wyłącznie wiadomości tego konta.
   */
  async usunZKolejki(z: ZlecenieOperatora, ids: string[]) {
    const lista = [...new Set(ids.map((i) => i.trim()))];
    if (!lista.length || lista.length > MAX_DO_USUNIECIA) throw new BadRequestException(`Wybierz od 1 do ${MAX_DO_USUNIECIA} wiadomości.`);
    if (lista.some((i) => !ID_WIADOMOSCI_EXIMA.test(i))) throw new BadRequestException('Nieprawidłowy identyfikator wiadomości.');
    return this.akcje.wykonaj(
      z,
      'kolejka-usun',
      { wiadomosci: lista.length },
      async (w) => {
        const zadania = await this.zadania(w.konto.id);
        const stan = stanKolejki(zadania);
        if (stan.usuwanie?.wToku) throw new ConflictException('Poprzednie usuwanie jeszcze trwa — chwila.');
        const podglad = zadania.find((t) => (t.payload as { mode?: string } | null)?.mode === 'list' && t.status === NodeTaskStatus.COMPLETED);
        const widziane = new Set(stan.wiadomosci.map((m) => m.id));
        if (!podglad || Date.now() - (podglad.completedAt ?? podglad.createdAt).getTime() > WAZNOSC_PODGLADU_MS || lista.some((i) => !widziane.has(i))) {
          throw new BadRequestException('Odśwież podgląd kolejki — usunąć można tylko wiadomości z podglądu sprzed najwyżej godziny.');
        }
        const domeny = (podglad.payload as { domains?: string } | null)?.domains ?? '';
        const t = await this.prisma.nodeTask.create({
          data: {
            serverId: w.konto.serverId,
            accountId: w.konto.id,
            kind: NodeTaskKind.MAIL_QUEUE,
            status: NodeTaskStatus.QUEUED,
            requestedById: z.operatorUserId,
            payload: { mode: 'remove', daUser: w.konto.daUsername, domains: domeny, ids: lista.join(','), subscriptionId: z.subscriptionId },
          },
        });
        return { ok: true as const, zlecono: lista.length, zadanieId: t.id };
      },
      { action: HostingResourceActions.HOSTING_MAIL_QUEUE_PURGE_QUEUED, details: { wiadomosci: lista.length } },
    );
  }
}

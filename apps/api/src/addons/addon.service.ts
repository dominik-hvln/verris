import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, WalletTxType } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { WalletLedgerService } from '../billing/wallet-ledger.service.js';
import { TicketsService } from '../tickets/tickets.service.js';
import { CyklZyciaUslugiActions, SupportActions } from '../common/audit/audit.actions.js';
import { wymagajProsbyKlienta, zgloszenieKlienta } from '../tickets/zgloszenie-klienta.js';

type AddonMode = 'flag' | 'workorder';

interface AddonDef {
  slug: string;
  name: string;
  description: string;
  price: number;
  mode: AddonMode;
}

const CATALOG: Record<string, AddonDef> = {
  priority_support_30d: {
    slug: 'priority_support_30d',
    name: 'Priorytetowe wsparcie (30 dni)',
    description: 'Twoje zgłoszenia obsługujemy poza kolejnością przez 30 dni.',
    price: 49,
    mode: 'flag',
  },
  manual_setup: {
    slug: 'manual_setup',
    name: 'Konfiguracja przez specjalistę',
    description: 'Nasz zespół skonfiguruje dla Ciebie stronę / pocztę / DNS — jednorazowo.',
    price: 99,
    mode: 'workorder',
  },
  dedicated_ip: {
    slug: 'dedicated_ip',
    name: 'Dedykowane IP',
    description: 'Przydzielimy dedykowany adres IP do Twojego konta hostingowego.',
    price: 25,
    mode: 'workorder',
  },
};

const PRIORITY_DAYS = 30;

/** F3.5 — dodatki z katalogu (walidacja wniosku i formularza operatora). */
export const SLUGI_DODATKOW = Object.keys(CATALOG);

/** F3.5 — dodatek dodany przez obsługę: z portfela klienta (na jego prośbę) albo gratis (koszt Verris). */
export type PlatnoscDodatku = 'PORTFEL' | 'GRATIS';
export const PLATNOSCI_DODATKU: readonly PlatnoscDodatku[] = ['PORTFEL', 'GRATIS'];
const MIN_POWOD = 10;

/** Kto dodał dodatek (operator) — zakup klienta tego nie ma. */
interface ZakupOperatora {
  userId: string;
  gratis: boolean;
  zgloszenieId: string | null;
}

/**
 * Z-06 — okno, w którym powtórzony zakup tego samego dodatku dla tej samej
 * usługi uznajemy za DUPLIKAT, a nie za drugi świadomy zakup.
 *
 * Pięć minut to kompromis: podwójne kliknięcie, retry po zerwanej sieci
 * i cofnięcie formularza mieszczą się w sekundach, a klient, który naprawdę
 * chce kupić drugie dedykowane IP, zrobi to później niż po pięciu minutach.
 *
 * To jest ZAPASOWA ścieżka. Gdy panel poda własny klucz idempotencji, okno
 * w ogóle nie wchodzi w grę — i to jest wariant mocniejszy, bo nie ma granicy
 * przedziału, na której dwa kliknięcia mogłyby wpaść do dwóch różnych okien.
 */
const OKNO_IDEMPOTENCJI_MS = 5 * 60 * 1000;

/**
 * P-8 — one-time add-on store, paid from the wallet. Two fulfilment modes:
 *  - 'flag'     → instant account flag (e.g. priority support window),
 *  - 'workorder'→ auto-creates a staff ticket for manual fulfilment.
 */
@Injectable()
export class AddonService {
  private readonly logger = new Logger(AddonService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly wallet: WalletLedgerService,
    private readonly tickets: TicketsService,
  ) {}

  catalog() {
    return Object.values(CATALOG).map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
      price: a.price.toFixed(2),
      currency: 'PLN',
    }));
  }

  async overview(userId: string) {
    const [purchased, user] = await Promise.all([
      this.prisma.purchasedAddon.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { prioritySupport: true, prioritySupportUntil: true },
      }),
    ]);
    const priorityActive =
      !!user?.prioritySupport &&
      !!user.prioritySupportUntil &&
      user.prioritySupportUntil.getTime() > Date.now();
    return {
      catalog: this.catalog(),
      prioritySupport: { active: priorityActive, until: user?.prioritySupportUntil?.toISOString() ?? null },
      purchased: purchased.map((p) => ({
        id: p.id,
        slug: p.slug,
        name: p.name,
        amount: p.amount.toString(),
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Z-06 — klucz identyfikujący JEDNĄ decyzję zakupu.
   *
   * Poprzednia wersja brzmiała `addon-${userId}-${slug}-${Date.now()}`. Znacznik
   * czasu sprawiał, że każde kliknięcie dawało inny klucz, więc mechanizm
   * idempotencji w księdze portfela nie miał czego porównywać: dziesięć kliknięć
   * to było dziesięć obciążeń.
   *
   * Samo usunięcie `Date.now()` nie wystarcza — klucz stały na zawsze
   * zablokowałby drugi, świadomy zakup tego samego dodatku (a dedykowane IP czy
   * konfigurację przez specjalistę można kupić więcej niż raz). Stąd dwie drogi:
   * klucz od klienta (mocniejsza) albo okno czasu (zapasowa).
   */
  private kluczIdempotencji(
    userId: string,
    slug: string,
    subscriptionId: string | undefined,
    klientKey: string | undefined,
    teraz: number,
  ): string {
    if (klientKey) return `addon:v1:${userId}:${klientKey}`;
    const okno = Math.floor(teraz / OKNO_IDEMPOTENCJI_MS);
    return `addon:v1:${userId}:${slug}:${subscriptionId ?? '-'}:${okno}`;
  }

  /** Odpowiedź dla zakupu, który już istnieje — bez ponownego obciążenia. */
  private odpowiedzZRekordu(rekord: {
    id: string;
    name: string;
    status: string;
    ticketId: string | null;
    slug: string;
  }) {
    const def = CATALOG[rekord.slug];
    return {
      ok: true as const,
      id: rekord.id,
      name: rekord.name,
      status: rekord.status,
      ticketId: rekord.ticketId,
      duplikat: true as const,
      note:
        def?.mode === 'workorder'
          ? 'Ten dodatek jest już wykupiony — zlecenie dla zespołu czeka w zgłoszeniu. Nie pobraliśmy opłaty drugi raz.'
          : 'Ten dodatek jest już aktywny. Nie pobraliśmy opłaty drugi raz.',
    };
  }

  async purchase(
    userId: string,
    slug: string,
    subscriptionId?: string,
    klientKey?: string,
  ) {
    const def = CATALOG[slug];
    if (!def) throw new BadRequestException('Nieznany dodatek.');

    // Z-10: usługa z ciała żądania musi należeć do kupującego — inaczej zlecenie dla zespołu i wpis
    // w portfelu/fakturze wskazywałyby cudzą usługę.
    let domenaUslugi: string | null = null;
    if (subscriptionId) {
      const wlasna = await this.prisma.subscription.findFirst({
        where: { id: subscriptionId, userId },
        select: { id: true, account: { select: { domain: true } } },
      });
      if (!wlasna) throw new NotFoundException('Usługa nie istnieje.');
      domenaUslugi = wlasna.account?.domain ?? null;
    }

    const klucz = this.kluczIdempotencji(userId, slug, subscriptionId, klientKey, Date.now());
    return this.zrealizuj({ userId, def, subscriptionId, domenaUslugi, klucz });
  }

  /**
   * F3.5 — dodatek dodany przez obsługę na karcie usługi (albo z wniosku ADDON_ADD). Ta sama realizacja co zakup
   * klienta (rekord zakupu, obciążenie z tym samym opisem, zlecenie dla zespołu, zwrot przy błędzie) — rozliczenie
   * i dokumenty bez zmian (D7). „Z portfela klienta” tylko z numerem jego zgłoszenia (dowód zamówienia); „gratis”
   * bez obciążenia (koszt Verris). Powód obowiązkowy, STAFF tylko na usługach kont USER, wpis klienta
   * „obsługa Verris (zgłoszenie #…)” i OPERATOR_ACCOUNT_CHANGED z powodem.
   */
  async dodajPrzezOperatora(i: {
    subscriptionId: string;
    slug: string;
    platnosc: PlatnoscDodatku;
    operator: { userId: string; role: string };
    powod: string;
    zgloszenie?: string | null;
    /** Klucz jednej decyzji: id wniosku albo klucz z formularza; bez niego — okno 5 min jak u klienta. */
    klucz?: string | null;
  }) {
    const def = CATALOG[i.slug];
    if (!def) throw new BadRequestException('Nieznany dodatek.');
    if (!PLATNOSCI_DODATKU.includes(i.platnosc)) throw new BadRequestException('Wybierz: z portfela klienta albo gratis.');
    const sub = await this.prisma.subscription.findUnique({
      where: { id: i.subscriptionId },
      select: { id: true, userId: true, status: true, user: { select: { role: true } }, account: { select: { domain: true } } },
    });
    if (!sub) throw new NotFoundException('Usługa nie istnieje.');
    // Przegląd F3.5 — ta sama reguła co przy złożeniu wniosku ADDON_ADD, ale w API (trasa bezpośrednia L4/ADMIN):
    // zakończona usługa nie dostaje dodatku ani obciążenia portfela.
    if (sub.status === 'CANCELED' || sub.status === 'EXPIRED') {
      throw new BadRequestException('Usługa jest zakończona — dodatku nie dodasz.');
    }
    if (i.operator.role !== 'ADMIN' && sub.user.role !== 'USER') {
      throw new ForbiddenException('Personel może zmieniać wyłącznie usługi klientów — usługę konta zespołu zmienia administrator.');
    }
    const powod = (i.powod ?? '').trim();
    if (powod.length < MIN_POWOD) throw new BadRequestException(`Podaj powód (min. ${MIN_POWOD} znaków) — zapisze się w dzienniku.`);
    const zgloszenieId = await zgloszenieKlienta(this.prisma, sub.userId, i.zgloszenie);
    if (i.platnosc === 'PORTFEL' && !zgloszenieId) {
      throw new BadRequestException('Obciążenie portfela klienta tylko na jego zamówienie — podaj numer jego zgłoszenia albo dodaj gratis.');
    }
    // Audyt Fali 3 — zamówienie to wiadomość klienta z panelu, nie zgłoszenie założone przez obsługę ani mail.
    if (i.platnosc === 'PORTFEL') await wymagajProsbyKlienta(this.prisma, zgloszenieId!, 'Obciążenie portfela klienta');
    // Audyt Fali 3 — zawieszona usługa nie działa: obciążenie portfela za dodatek do niej (także z wniosku złożonego,
    // gdy była aktywna) to płatność za nic. Wariant zachowawczy — gratis można, z portfela po odwieszeniu.
    if (i.platnosc === 'PORTFEL' && sub.status === 'SUSPENDED') {
      throw new BadRequestException('Usługa jest zawieszona — dodatek z portfela klienta dodasz po odwieszeniu (gratis można teraz).');
    }
    const gratis = i.platnosc === 'GRATIS';
    const klucz = i.klucz
      ? `addon:v1:${sub.userId}:op:${i.klucz}`
      : `addon:v1:${sub.userId}:op:${def.slug}:${sub.id}:${Math.floor(Date.now() / OKNO_IDEMPOTENCJI_MS)}`;
    const wynik = await this.zrealizuj({
      userId: sub.userId,
      def,
      subscriptionId: sub.id,
      domenaUslugi: sub.account?.domain ?? null,
      klucz,
      operator: { userId: i.operator.userId, gratis, zgloszenieId },
    });
    if (!('duplikat' in wynik)) {
      await this.audit.record({
        action: SupportActions.OPERATOR_ACCOUNT_CHANGED,
        userId: sub.userId,
        actorUserId: i.operator.userId,
        details: {
          subscriptionId: sub.id,
          akcja: 'dodatek',
          slug: def.slug,
          platnosc: i.platnosc,
          powod,
          ...(zgloszenieId ? { zgloszenieId } : {}),
          wynik: 'ok',
        },
      });
    }
    return wynik;
  }

  private async zrealizuj(z: {
    userId: string;
    def: AddonDef;
    subscriptionId?: string;
    domenaUslugi: string | null;
    klucz: string;
    operator?: ZakupOperatora;
  }) {
    const { userId, def, subscriptionId, domenaUslugi, klucz } = z;
    const slug = def.slug;
    const gratis = !!z.operator?.gratis;
    const amount = new Prisma.Decimal(gratis ? 0 : def.price);
    // Najpierw zajęcie zakupu unikalnym kluczem, dopiero potem pieniądze i skutki. Wcześniej rekord
    // powstawał na końcu: dwa równoległe kliknięcia obciążały portfel raz, ale zakładały DWA zgłoszenia
    // dla zespołu; a gdy założenie zgłoszenia padło, opłata zostawała bez zakupu i bez zwrotu.
    let rekord;
    try {
      rekord = await this.prisma.purchasedAddon.create({
        data: { userId, slug: def.slug, name: def.name, amount, subscriptionId: subscriptionId ?? null, status: 'PENDING', idempotencyKey: klucz },
      });
    } catch (e) {
      if ((e as { code?: string })?.code !== 'P2002') throw e;
      const istniejacy = await this.prisma.purchasedAddon.findUnique({ where: { idempotencyKey: klucz } });
      if (!istniejacy) throw e;
      this.logger.log(`Powtórzony zakup dodatku (klucz=${klucz}, id=${istniejacy.id}) — bez opłaty`);
      return this.odpowiedzZRekordu(istniejacy);
    }

    // Klucz w księdze = klucz zakupu + ta próba. Nieudana próba zwalnia klucz zakupu (rekord znika),
    // więc ponowienie tym samym kluczem z panelu płaci od nowa, zamiast trafić w zwrócone obciążenie.
    const kluczKsiegi = `${klucz}:${rekord.id}`;
    // F3.5 — gratis od obsługi: bez obciążenia (księga odrzuca kwotę 0), więc i bez zwrotu przy błędzie.
    if (!gratis) try {
      await this.wallet.debit({
        userId,
        type: WalletTxType.CHARGE_USAGE,
        amount,
        description: `Dodatek: ${def.name}`,
        idempotencyKey: kluczKsiegi,
        subscriptionId: subscriptionId ?? undefined,
      });
    } catch (e) {
      await this.prisma.purchasedAddon.delete({ where: { id: rekord.id } });
      throw e;
    }

    let status = 'APPLIED';
    let ticketId: string | null = null;
    try {
      if (def.mode === 'flag' && slug === 'priority_support_30d') {
        // Dokupienie w trakcie aktywnego okresu przedłuża go — wcześniej liczyło 30 dni od dziś,
        // a klient tracił opłacone, niewykorzystane dni.
        const obecny = await this.prisma.user.findUnique({ where: { id: userId }, select: { prioritySupportUntil: true } });
        const od = Math.max(Date.now(), obecny?.prioritySupportUntil?.getTime() ?? 0);
        const until = new Date(od + PRIORITY_DAYS * 24 * 60 * 60 * 1000);
        await this.prisma.user.update({
          where: { id: userId },
          data: { prioritySupport: true, prioritySupportUntil: until },
        });
      } else if (def.mode === 'workorder') {
        const ticket = await this.tickets.create(userId, {
          subject: `Dodatek: ${def.name}`,
          // Klient widzi to zgłoszenie jako swoje — wiadomość automatyczna, bez identyfikatorów wewnętrznych.
          message: `${z.operator ? `Obsługa Verris dodała do Twojej usługi dodatek „${def.name}"${gratis ? ' (bez opłaty)' : ''}.` : `Przyjęliśmy zamówienie dodatku „${def.name}".`} ${def.description}${
            domenaUslugi ? `\n\nUsługa: ${domenaUslugi}.` : ''
          }\n\nVerris założył to zgłoszenie automatycznie${z.operator ? '' : ' po zakupie'}. Nic nie musisz robić — zespół zajmie się realizacją i napisze tu, gdy skończy.`,
          department: 'TECHNICAL',
          topic: 'OTHER',
          priority: 'HIGH',
          // PB-43 — zgłoszenie od razu przy usłudze, której dotyczy dodatek (obsługa widzi kartę i diagnostykę).
          subscriptionId: subscriptionId ?? undefined,
        });
        ticketId = (ticket as { id?: string } | null)?.id ?? null;
        status = 'QUEUED';
      }
    } catch (e) {
      this.logger.error(`Dodatek ${def.slug} opłacony, realizacja padła — zwrot: ${(e as Error).message}`);
      if (!gratis) await this.wallet.credit({
        userId,
        type: WalletTxType.REFUND,
        amount,
        description: `Zwrot: dodatek ${def.name} (nie udało się uruchomić)`,
        idempotencyKey: `${kluczKsiegi}:zwrot`,
        subscriptionId: subscriptionId ?? undefined,
      });
      await this.prisma.purchasedAddon.delete({ where: { id: rekord.id } });
      throw e;
    }

    const record = await this.prisma.purchasedAddon.update({ where: { id: rekord.id }, data: { status, ticketId } });

    // Klient widzi wpis w „Aktywności konta” (nazwa dodatku); dodany przez obsługę — „obsługa Verris (zgłoszenie #…)”.
    await this.audit.record({
      action: CyklZyciaUslugiActions.ADDON_PURCHASED,
      userId,
      actorUserId: z.operator?.userId ?? userId,
      details: {
        slug: def.slug,
        name: def.name,
        amount: gratis ? 0 : def.price,
        status,
        ticketId,
        ...(subscriptionId ? { subscriptionId } : {}),
        ...(z.operator ? { gratis, ...(z.operator.zgloszenieId ? { zgloszenieId: z.operator.zgloszenieId } : {}) } : {}),
      },
    });

    return {
      ok: true as const,
      id: record.id,
      name: def.name,
      status,
      ticketId,
      note:
        def.mode === 'workorder'
          ? 'Utworzyliśmy zlecenie dla naszego zespołu — odezwiemy się przez zgłoszenie.'
          : 'Dodatek aktywny od teraz.',
    };
  }
}

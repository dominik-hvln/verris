import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaZgloszenieStatus, Prisma, type BetaZgloszenie as BetaZgloszenieWiersz } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import type { MailMessage } from '../mail/mailer.interface.js';
import { AuditService } from '../common/audit/audit.service.js';
import { BetaService, KREDYT_TESTOW } from './beta.service.js';
import type { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';
import {
  odmowaZgloszeniaBetaTemplate,
  potwierdzenieZgloszeniaBetaTemplate,
  stanZaproszeniaBetaTemplate,
  zaproszenieDoTestowTemplate,
  tylkoPocztaWZakresie,
  zgloszenieBetaNotifyTemplate,
  zmianaZgloszeniaBetaTemplate,
} from './beta.templates.js';

/**
 * Otwarta beta — zgłoszenia z formularza verris.pl/beta.
 * Przebieg: formularz → mail z linkiem (double opt-in) → NOWE → decyzja właściciela w panelu admina:
 * „Zaproś” (imienny kod z BetaService.zapros) albo „Odrzuć” (opcjonalnie uprzejmy mail).
 * Odpowiedź publiczna jest zawsze ta sama — z formularza nie da się sprawdzić, czy adres już jest na liście.
 */
export const DOBA_MS = 24 * 60 * 60 * 1000;
/** Retencja: niepotwierdzone 7 dni, nowe i odrzucone 90 dni od utworzenia (projekt DO_ZATWIERDZENIA_beta-zgloszenia.md). */
export const RETENCJA_NIEPOTWIERDZONYCH_DNI = 7;
export const RETENCJA_ZGLOSZEN_DNI = 90;

const AKTYWNE: BetaZgloszenieStatus[] = [BetaZgloszenieStatus.NIEPOTWIERDZONE, BetaZgloszenieStatus.NOWE];

type Meta = { ip?: string; userAgent?: string };

const KONTAKT = 'kontakt@verris.pl';

/** Stan linku z maila (strona GET z przyciskiem — A1-06). */
export type StanLinkuBety = 'DO_POTWIERDZENIA' | 'ZMIANA_DO_POTWIERDZENIA' | 'JUZ_POTWIERDZONE' | 'NIEAKTUALNY';
/** Wynik kliknięcia przycisku (POST). */
export type WynikPotwierdzeniaBety = 'POTWIERDZONE' | 'ZMIANA_ZAPISANA' | 'JUZ_POTWIERDZONE' | 'NIEAKTUALNY';

function utmBezPustych(utm: ZgloszenieBetaDto['utm']): Prisma.InputJsonValue | undefined {
  if (!utm) return undefined;
  const wpisy = Object.entries(utm).filter(([, v]) => typeof v === 'string' && v.trim());
  return wpisy.length ? Object.fromEntries(wpisy.map(([k, v]) => [k, (v as string).trim()])) : undefined;
}

const puste = (v?: string | null) => v?.trim() || null;

@Injectable()
export class BetaZgloszeniaService {
  private readonly logger = new Logger(BetaZgloszeniaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly beta: BetaService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') || 'https://panel.verris.pl').replace(/\/$/, '');
  }

  private notifyEmail(): string {
    return this.config.get<string>('leadsNotifyEmail') || process.env.LEADS_NOTIFY_EMAIL || 'kontakt@verris.pl';
  }

  private confirmUrl(token: string): string {
    const base = (this.config.get<string>('publicApiUrl') || process.env.PUBLIC_API_URL || 'https://api.verris.pl').replace(/\/$/, '');
    return `${base}/public/beta/zgloszenia/potwierdz?token=${encodeURIComponent(token)}`;
  }

  async zglos(dto: ZgloszenieBetaDto, meta: Meta, teraz = new Date()): Promise<{ status: 'pending' }> {
    // Pułapka na boty: wygląda jak sukces, ale nic nie zapisujemy i nic nie wysyłamy.
    if (dto.pulapka?.trim()) return { status: 'pending' };

    const email = dto.email.trim().toLowerCase();
    // Ma już zaproszenie (albo jest testerem) — bez duplikatu; P2-11: właściciel skrzynki dostaje mail zgodny ze stanem.
    const invite = await this.prisma.betaInvite.findFirst({
      where: { email },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        przypomnienieAt: true,
        promoCode: { select: { code: true, active: true, validTo: true, redemptionCount: true } },
        zgloszenia: { select: { zakres: true }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (invite) {
      await this.przypomnijZaproszenie(email, invite, teraz);
      return { status: 'pending' };
    }

    const dane = {
      imie: dto.imie.trim().slice(0, 100),
      zakres: dto.zakres,
      strona: puste(dto.strona),
      obecnyHosting: puste(dto.obecnyHosting),
      uwagi: puste(dto.uwagi),
      utm: utmBezPustych(dto.utm) ?? Prisma.DbNull,
      page: puste(dto.page),
      zgodaTekst: dto.zgodaTekst,
      zgodaAt: teraz,
      ip: meta.ip || null,
      userAgent: meta.userAgent || null,
    };

    const aktywne = await this.prisma.betaZgloszenie.findFirst({
      where: { email, status: { in: AKTYWNE } },
      orderBy: { createdAt: 'desc' },
    });

    if (aktywne?.status === BetaZgloszenieStatus.NOWE) {
      // A1-01 — potwierdzonego zgłoszenia nie nadpisujemy z formularza: kto zna adres, podmieniłby dane, zakres
      // i dowód zgody bez dostępu do skrzynki. Zmiana czeka na kliknięcie nowego linku z maila.
      await this.zaproponujZmiane(aktywne, dane, teraz);
      await this.audit
        .record({ action: 'BETA_ZGLOSZENIE_PRZYJETE', details: { zgloszenieId: aktywne.id, ponowne: true, zmianaDoPotwierdzenia: true, page: dane.page } })
        .catch(() => undefined);
      return { status: 'pending' };
    }

    let zgloszenie: { id: string; status: BetaZgloszenieStatus; confirmToken: string | null };
    if (aktywne) {
      // Niepotwierdzone — ponowne wysłanie aktualizuje to samo zgłoszenie (bez drugiego wiersza na liście).
      zgloszenie = await this.prisma.betaZgloszenie.update({
        where: { id: aktywne.id },
        data: { ...dane, ...(!aktywne.confirmToken ? { confirmToken: randomUUID() } : {}) },
      });
    } else {
      zgloszenie = await this.prisma.betaZgloszenie.create({
        data: { ...dane, email, status: BetaZgloszenieStatus.NIEPOTWIERDZONE, confirmToken: randomUUID() },
      });
    }

    await this.audit
      .record({ action: 'BETA_ZGLOSZENIE_PRZYJETE', details: { zgloszenieId: zgloszenie.id, ponowne: Boolean(aktywne), page: dane.page } })
      .catch(() => undefined);

    if (zgloszenie.status === BetaZgloszenieStatus.NIEPOTWIERDZONE && zgloszenie.confirmToken) {
      if (await this.moznaWyslac(email, zgloszenie.id, teraz)) {
        await this.wyslij(
          potwierdzenieZgloszeniaBetaTemplate({ to: email, imie: dane.imie, confirmUrl: this.confirmUrl(zgloszenie.confirmToken), panelUrl: this.panelUrl() }),
          zgloszenie.id,
        );
      }
    }
    return { status: 'pending' };
  }

  /**
   * Najwyżej jeden mail do nadawcy na adres na dobę — formularzem nie da się zasypać cudzej skrzynki.
   * Rezerwuje okno (mailAt) na wskazanym zgłoszeniu.
   */
  private async moznaWyslac(email: string, zgloszenieId: string, teraz: Date): Promise<boolean> {
    const ostatniMail = await this.prisma.betaZgloszenie.findFirst({
      where: { email, mailAt: { gte: new Date(teraz.getTime() - DOBA_MS) } },
      select: { id: true },
    });
    if (ostatniMail) return false;
    await this.prisma.betaZgloszenie.update({ where: { id: zgloszenieId }, data: { mailAt: teraz } });
    return true;
  }

  private async wyslij(mail: Omit<MailMessage, 'fromAddress'>, id: string) {
    try {
      await this.mailer.send({ ...mail, category: 'TRANSACTIONAL', fromRole: 'SUPPORT' });
    } catch (err) {
      this.logger.warn(`Zgłoszenie beta ${id}: mail do nadawcy nie wyszedł: ${(err as Error).message}`);
    }
  }

  /** A1-01 — nowe dane jako oczekująca zmiana + link. Oczekującej zmiany nie podmieniamy, dopóki trwa doba od maila. */
  private async zaproponujZmiane(aktywne: { id: string; email: string; zmianaToken: string | null }, dane: Record<string, unknown>, teraz: Date) {
    if (!(await this.moznaWyslac(aktywne.email, aktywne.id, teraz))) return;
    const zmianaToken = randomUUID();
    await this.prisma.betaZgloszenie.update({
      where: { id: aktywne.id },
      data: { zmiana: JSON.parse(JSON.stringify({ ...dane, utm: dane.utm === Prisma.DbNull ? null : dane.utm, zgodaAt: (dane.zgodaAt as Date).toISOString() })), zmianaToken },
    });
    await this.wyslij(zmianaZgloszeniaBetaTemplate({ to: aktywne.email, confirmUrl: this.confirmUrl(zmianaToken), panelUrl: this.panelUrl() }), aktywne.id);
  }

  /**
   * P2-11 — adres ma już zaproszenie. Ważny, niewykorzystany kod: wysyłamy zaproszenie jeszcze raz (zgubiony mail);
   * kod zrealizowany: „jesteś już w testach”; wygasły/wycofany: „napisz do nas”. Najwyżej raz na dobę.
   */
  private async przypomnijZaproszenie(
    email: string,
    invite: {
      id: string;
      name: string | null;
      przypomnienieAt: Date | null;
      promoCode: { code: string; active: boolean; validTo: Date | null; redemptionCount: number };
      zgloszenia?: { zakres: string[] }[];
    },
    teraz: Date,
  ) {
    if (invite.przypomnienieAt && invite.przypomnienieAt.getTime() > teraz.getTime() - DOBA_MS) return;
    const { count } = await this.prisma.betaInvite.updateMany({
      where: { id: invite.id, OR: [{ przypomnienieAt: null }, { przypomnienieAt: { lte: new Date(teraz.getTime() - DOBA_MS) } }] },
      data: { przypomnienieAt: teraz },
    });
    if (!count) return;
    const kod = invite.promoCode;
    const mail =
      kod.redemptionCount > 0
        ? stanZaproszeniaBetaTemplate({ to: email, stan: 'TESTER', panelUrl: this.panelUrl(), kontakt: KONTAKT })
        : kod.active && kod.validTo && kod.validTo > teraz
          ? zaproszenieDoTestowTemplate({
              to: email,
              name: invite.name,
              code: kod.code,
              credit: KREDYT_TESTOW,
              validTo: kod.validTo,
              panelUrl: this.panelUrl(),
              tylkoPoczta: tylkoPocztaWZakresie(invite.zgloszenia?.[0]?.zakres),
            })
          : stanZaproszeniaBetaTemplate({ to: email, stan: 'NIEAKTYWNE', panelUrl: this.panelUrl(), kontakt: KONTAKT });
    await this.wyslij(mail, invite.id);
  }

  /**
   * P5-09 / A1-06 — co pokazać pod linkiem z maila, bez wykonywania akcji (GET otwierają też skanery linków w poczcie).
   * Token potwierdzenia zostaje po potwierdzeniu, żeby drugie kliknięcie mówiło „już potwierdzone”, a nie „nieaktualny”.
   */
  async stanLinku(token?: string): Promise<StanLinkuBety> {
    if (!token) return 'NIEAKTUALNY';
    const z = await this.prisma.betaZgloszenie.findFirst({
      where: { OR: [{ confirmToken: token }, { zmianaToken: token }] },
      select: { status: true, confirmToken: true, zmianaToken: true, zmiana: true },
    });
    if (!z) return 'NIEAKTUALNY';
    if (z.zmianaToken === token) return z.status === BetaZgloszenieStatus.NOWE && z.zmiana ? 'ZMIANA_DO_POTWIERDZENIA' : 'NIEAKTUALNY';
    if (z.status === BetaZgloszenieStatus.NIEPOTWIERDZONE) return 'DO_POTWIERDZENIA';
    if (z.status === BetaZgloszenieStatus.NOWE || z.status === BetaZgloszenieStatus.ZAPROSZONE) return 'JUZ_POTWIERDZONE';
    return 'NIEAKTUALNY';
  }

  /** Double opt-in (POST z przycisku na stronie linku): potwierdzenie zgłoszenia albo zmiany jego danych. */
  async potwierdz(token?: string, teraz = new Date()): Promise<{ stan: WynikPotwierdzeniaBety }> {
    if (!token) return { stan: 'NIEAKTUALNY' };
    const zmiana = await this.prisma.betaZgloszenie.findUnique({ where: { zmianaToken: token } });
    if (zmiana) return { stan: await this.zapiszZmiane(zmiana, teraz) };

    const z = await this.prisma.betaZgloszenie.findUnique({ where: { confirmToken: token } });
    if (!z) return { stan: 'NIEAKTUALNY' };
    if (z.status === BetaZgloszenieStatus.NOWE || z.status === BetaZgloszenieStatus.ZAPROSZONE) return { stan: 'JUZ_POTWIERDZONE' };
    if (z.status !== BetaZgloszenieStatus.NIEPOTWIERDZONE) return { stan: 'NIEAKTUALNY' };
    const { count } = await this.prisma.betaZgloszenie.updateMany({
      where: { id: z.id, status: BetaZgloszenieStatus.NIEPOTWIERDZONE },
      data: { status: BetaZgloszenieStatus.NOWE, potwierdzoneAt: teraz },
    });
    // Wyścig dwóch kart: druga widzi już NOWE — to też „potwierdzone”, nie błąd.
    if (!count) return { stan: 'JUZ_POTWIERDZONE' };
    await this.audit.record({ action: 'BETA_ZGLOSZENIE_POTWIERDZONE', details: { zgloszenieId: z.id } }).catch(() => undefined);
    const utm = (z.utm ?? null) as Record<string, string> | null;
    void this.mailer
      .send({
        ...zgloszenieBetaNotifyTemplate({
          to: this.notifyEmail(),
          imie: z.imie,
          email: z.email,
          zakres: z.zakres,
          strona: z.strona,
          obecnyHosting: z.obecnyHosting,
          uwagi: z.uwagi,
          zrodlo: [utm?.source, utm?.campaign, utm?.content].filter(Boolean).join(' / ') || null,
          panelUrl: this.panelUrl(),
        }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((e) => this.logger.warn(`Zgłoszenie beta ${z.id}: powiadomienie zespołu nie wyszło: ${e?.message ?? e}`));
    return { stan: 'POTWIERDZONE' };
  }

  /**
   * A1-01 — potwierdzona zmiana danych. Poprzedni dowód zgody (treść, chwila, IP) zostaje w dzienniku — zapis
   * w zgłoszeniu dostaje nową zgodę, ale stara nie znika.
   */
  private async zapiszZmiane(z: BetaZgloszenieWiersz, teraz: Date): Promise<WynikPotwierdzeniaBety> {
    const nowe = z.zmiana as Record<string, unknown> | null;
    if (z.status !== BetaZgloszenieStatus.NOWE || !nowe) {
      await this.prisma.betaZgloszenie.updateMany({ where: { id: z.id, zmianaToken: z.zmianaToken }, data: { zmiana: Prisma.DbNull, zmianaToken: null } });
      return 'NIEAKTUALNY';
    }
    const { count } = await this.prisma.betaZgloszenie.updateMany({
      where: { id: z.id, zmianaToken: z.zmianaToken, status: BetaZgloszenieStatus.NOWE },
      data: {
        imie: String(nowe.imie ?? z.imie),
        zakres: Array.isArray(nowe.zakres) ? (nowe.zakres as string[]) : z.zakres,
        strona: (nowe.strona as string | null) ?? null,
        obecnyHosting: (nowe.obecnyHosting as string | null) ?? null,
        uwagi: (nowe.uwagi as string | null) ?? null,
        utm: (nowe.utm as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
        page: (nowe.page as string | null) ?? null,
        zgodaTekst: String(nowe.zgodaTekst ?? z.zgodaTekst),
        zgodaAt: nowe.zgodaAt ? new Date(String(nowe.zgodaAt)) : z.zgodaAt,
        ip: (nowe.ip as string | null) ?? null,
        userAgent: (nowe.userAgent as string | null) ?? null,
        zmiana: Prisma.DbNull,
        zmianaToken: null,
      },
    });
    if (!count) return 'NIEAKTUALNY';
    await this.audit
      .record({
        action: 'BETA_ZGLOSZENIE_ZMIANA_POTWIERDZONA',
        details: {
          zgloszenieId: z.id,
          potwierdzonoAt: teraz.toISOString(),
          poprzedniaZgoda: { tekst: z.zgodaTekst, at: z.zgodaAt.toISOString(), ip: z.ip, userAgent: z.userAgent },
        },
      })
      .catch(() => undefined);
    return 'ZMIANA_ZAPISANA';
  }

  /** Panel admina → Testy (beta) → Zgłoszenia. */
  async lista(status?: BetaZgloszenieStatus) {
    const [wiersze, grupy] = await Promise.all([
      this.prisma.betaZgloszenie.findMany({
        where: status ? { status } : {},
        orderBy: { createdAt: 'desc' },
        take: 500,
        include: { betaInvite: { select: { id: true, promoCode: { select: { code: true } } } } },
      }),
      this.prisma.betaZgloszenie.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const liczby: Record<BetaZgloszenieStatus, number> = { NIEPOTWIERDZONE: 0, NOWE: 0, ZAPROSZONE: 0, ODRZUCONE: 0 };
    for (const g of grupy) liczby[g.status] = g._count._all;
    return {
      liczby,
      zgloszenia: wiersze.map((z) => {
        const utm = (z.utm ?? null) as Record<string, string> | null;
        return {
          id: z.id,
          imie: z.imie,
          email: z.email,
          zakres: z.zakres,
          strona: z.strona,
          obecnyHosting: z.obecnyHosting,
          uwagi: z.uwagi,
          // content = kreacja i zestaw reklamy (marketing/meta-leadgen-hosting-202611.md §3) — porównanie kosztu zgłoszenia.
          zrodlo: utm ? { source: utm.source ?? null, campaign: utm.campaign ?? null, content: utm.content ?? null } : null,
          status: z.status,
          utworzone: z.createdAt.toISOString(),
          potwierdzone: z.potwierdzoneAt?.toISOString() ?? null,
          decyzjaAt: z.decyzjaAt?.toISOString() ?? null,
          kod: z.betaInvite?.promoCode.code ?? null,
        };
      }),
    };
  }

  /** „Zaproś”: imienny kod z BetaService.zapros (150 K, 14 dni, mail) i powiązanie ze zgłoszeniem. */
  async zapros(id: string, actorUserId: string) {
    const z = await this.prisma.betaZgloszenie.findUnique({ where: { id } });
    if (!z) throw new NotFoundException('Nie ma takiego zgłoszenia.');
    if (z.status === BetaZgloszenieStatus.NIEPOTWIERDZONE)
      throw new ConflictException('Adres nie jest jeszcze potwierdzony — zaproszenie dopiero po kliknięciu linku z maila.');
    if (z.status === BetaZgloszenieStatus.ZAPROSZONE) throw new ConflictException('Ta osoba ma już zaproszenie z tego zgłoszenia.');

    const invite = await this.beta.zapros({ email: z.email, name: z.imie, tylkoPoczta: tylkoPocztaWZakresie(z.zakres) }, actorUserId);
    await this.prisma.betaZgloszenie.update({
      where: { id },
      data: { status: BetaZgloszenieStatus.ZAPROSZONE, betaInviteId: invite.id, decyzjaAt: new Date(), decyzjaPrzezId: actorUserId, zmiana: Prisma.DbNull, zmianaToken: null },
    });
    await this.audit.record({ action: 'BETA_ZGLOSZENIE_ZAPROSZONE', actorUserId, details: { zgloszenieId: id, inviteId: invite.id } });
    return invite;
  }

  /** „Odrzuć”: bez kodu; uprzejmy mail tylko na adres potwierdzony (niepotwierdzonego nie zasypujemy pocztą). */
  async odrzuc(id: string, powiadom: boolean, actorUserId: string) {
    const z = await this.prisma.betaZgloszenie.findUnique({ where: { id } });
    if (!z) throw new NotFoundException('Nie ma takiego zgłoszenia.');
    if (z.status === BetaZgloszenieStatus.ZAPROSZONE)
      throw new ConflictException('Zaproszenie już wyszło — żeby je cofnąć, wyłącz kod na liście zaproszeń.');
    if (z.status === BetaZgloszenieStatus.ODRZUCONE) return { ok: true as const, mailWyslany: false };

    await this.prisma.betaZgloszenie.update({
      where: { id },
      data: { status: BetaZgloszenieStatus.ODRZUCONE, decyzjaAt: new Date(), decyzjaPrzezId: actorUserId, confirmToken: null, zmiana: Prisma.DbNull, zmianaToken: null },
    });
    let mailWyslany = false;
    if (powiadom && z.potwierdzoneAt) {
      try {
        const r = await this.mailer.send({
          ...odmowaZgloszeniaBetaTemplate({ to: z.email, imie: z.imie, panelUrl: this.panelUrl() }),
          category: 'TRANSACTIONAL',
          fromRole: 'SUPPORT',
        });
        mailWyslany = r.delivered;
      } catch (err) {
        this.logger.warn(`Zgłoszenie beta ${id}: mail z odmową nie wyszedł: ${(err as Error).message}`);
      }
    }
    await this.audit.record({ action: 'BETA_ZGLOSZENIE_ODRZUCONE', actorUserId, details: { zgloszenieId: id, powiadom, mailWyslany } });
    return { ok: true as const, mailWyslany };
  }

  /** Retencja (RODO — minimalizacja): niepotwierdzone po 7 dniach, nowe i odrzucone po 90; zaproszone zostają. */
  async usunStare(teraz = new Date()): Promise<number> {
    const [a, b] = await Promise.all([
      this.prisma.betaZgloszenie.deleteMany({
        where: { status: BetaZgloszenieStatus.NIEPOTWIERDZONE, createdAt: { lt: new Date(teraz.getTime() - RETENCJA_NIEPOTWIERDZONYCH_DNI * DOBA_MS) } },
      }),
      this.prisma.betaZgloszenie.deleteMany({
        where: {
          status: { in: [BetaZgloszenieStatus.NOWE, BetaZgloszenieStatus.ODRZUCONE] },
          createdAt: { lt: new Date(teraz.getTime() - RETENCJA_ZGLOSZEN_DNI * DOBA_MS) },
        },
      }),
    ]);
    return a.count + b.count;
  }
}

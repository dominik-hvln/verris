import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { BetaZgloszenieStatus, Prisma } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { BetaService } from './beta.service.js';
import type { ZgloszenieBetaDto } from './dto/zgloszenie-beta.dto.js';
import {
  odmowaZgloszeniaBetaTemplate,
  potwierdzenieZgloszeniaBetaTemplate,
  zgloszenieBetaNotifyTemplate,
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
    if (dto.firma?.trim()) return { status: 'pending' };

    const email = dto.email.trim().toLowerCase();
    // Ma już zaproszenie (albo jest testerem) — bez duplikatu i bez maila.
    if (await this.prisma.betaInvite.findFirst({ where: { email }, select: { id: true } })) return { status: 'pending' };

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

    let zgloszenie: { id: string; status: BetaZgloszenieStatus; confirmToken: string | null };
    if (aktywne) {
      // Ponowne wysłanie formularza aktualizuje to samo zgłoszenie (bez drugiego wiersza na liście).
      zgloszenie = await this.prisma.betaZgloszenie.update({
        where: { id: aktywne.id },
        data: {
          ...dane,
          ...(aktywne.status === BetaZgloszenieStatus.NIEPOTWIERDZONE && !aktywne.confirmToken ? { confirmToken: randomUUID() } : {}),
        },
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
      // Najwyżej jeden mail do nadawcy na adres na dobę — formularzem nie da się zasypać cudzej skrzynki.
      const ostatniMail = await this.prisma.betaZgloszenie.findFirst({
        where: { email, mailAt: { gte: new Date(teraz.getTime() - DOBA_MS) } },
        select: { id: true },
      });
      if (!ostatniMail) {
        await this.prisma.betaZgloszenie.update({ where: { id: zgloszenie.id }, data: { mailAt: teraz } });
        try {
          await this.mailer.send({
            ...potwierdzenieZgloszeniaBetaTemplate({ to: email, imie: dane.imie, confirmUrl: this.confirmUrl(zgloszenie.confirmToken), panelUrl: this.panelUrl() }),
            category: 'TRANSACTIONAL',
            fromRole: 'SUPPORT',
          });
        } catch (err) {
          this.logger.warn(`Zgłoszenie beta ${zgloszenie.id}: mail potwierdzający nie wyszedł: ${(err as Error).message}`);
        }
      }
    }
    return { status: 'pending' };
  }

  /** Double opt-in: link z maila. Token jednorazowy — drugie kliknięcie pokazuje „link nieaktualny”. */
  async potwierdz(token?: string, teraz = new Date()): Promise<{ ok: boolean }> {
    if (!token) return { ok: false };
    const z = await this.prisma.betaZgloszenie.findUnique({ where: { confirmToken: token } });
    if (!z || z.status !== BetaZgloszenieStatus.NIEPOTWIERDZONE) return { ok: false };
    const { count } = await this.prisma.betaZgloszenie.updateMany({
      where: { id: z.id, status: BetaZgloszenieStatus.NIEPOTWIERDZONE },
      data: { status: BetaZgloszenieStatus.NOWE, potwierdzoneAt: teraz, confirmToken: null },
    });
    if (!count) return { ok: false };
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
    return { ok: true };
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

    const invite = await this.beta.zapros({ email: z.email, name: z.imie }, actorUserId);
    await this.prisma.betaZgloszenie.update({
      where: { id },
      data: { status: BetaZgloszenieStatus.ZAPROSZONE, betaInviteId: invite.id, decyzjaAt: new Date(), decyzjaPrzezId: actorUserId },
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
      data: { status: BetaZgloszenieStatus.ODRZUCONE, decyzjaAt: new Date(), decyzjaPrzezId: actorUserId, confirmToken: null },
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

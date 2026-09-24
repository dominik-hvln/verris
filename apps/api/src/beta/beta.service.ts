import { randomInt } from 'node:crypto';
import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, PromoKind } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { MailerService } from '../mail/mailer.service';
import { AuditService } from '../common/audit/audit.service';
import { zaproszenieDoTestowTemplate } from './beta.templates';

/**
 * PB-26 — otwarte testy przed startem (docs/ops/BETA_TESTY.md).
 * Zaproszenie = imienny kod FIXED_CREDIT (150 K, 1 użycie, 14 dni) + mail. Tester = kto zrealizował
 * kod z zaproszeniem; widzi temat zgłoszeń „Testy (beta)”, a panel admina — jego postęp.
 */
export const KREDYT_TESTOW = 150;
export const WAZNOSC_DNI = 14;
const ALFABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bez 0/O i 1/I — kod przepisywany z maila
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,}$/;

export function kodTestera(): string {
  return `BETA-${Array.from({ length: 6 }, () => ALFABET[randomInt(ALFABET.length)]).join('')}`;
}

@Injectable()
export class BetaService {
  private readonly logger = new Logger(BetaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  async zapros(input: { email: string; name?: string }, actorUserId: string, teraz = new Date()) {
    const email = (input.email ?? '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) throw new BadRequestException('Nieprawidłowy adres e-mail.');
    const name = input.name?.trim().slice(0, 80) || null;
    const aktywne = await this.prisma.betaInvite.findFirst({
      where: { email, promoCode: { active: true, redemptionCount: 0, validTo: { gt: teraz } } },
    });
    if (aktywne) throw new BadRequestException('Ta osoba ma już ważne, niewykorzystane zaproszenie.');

    const validTo = new Date(teraz.getTime() + WAZNOSC_DNI * 86_400_000);
    let invite: { id: string; promoCode: { code: string } } | null = null;
    for (let proba = 0; proba < 3 && !invite; proba++) {
      try {
        invite = await this.prisma.betaInvite.create({
          data: {
            email,
            name,
            invitedById: actorUserId,
            promoCode: {
              create: {
                code: kodTestera(),
                kind: PromoKind.FIXED_CREDIT,
                value: new Prisma.Decimal(KREDYT_TESTOW),
                currency: 'PLN',
                description: 'Testy przed startem (beta)',
                maxRedemptions: 1,
                validFrom: teraz,
                validTo,
              },
            },
          },
          include: { promoCode: { select: { code: true } } },
        });
      } catch (err) {
        // kolizja losowego kodu — losujemy jeszcze raz
        if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002')) throw err;
      }
    }
    if (!invite) throw new BadRequestException('Nie udało się wylosować kodu — spróbuj ponownie.');

    const panelUrl = (this.config.get<string>('clientPanelUrl') || 'https://panel.verris.pl').replace(/\/$/, '');
    // Mail best-effort: przy awarii kod i tak jest ważny — admin widzi „niewysłane” i przekazuje go sam.
    let wyslane = false;
    try {
      const wynik = await this.mailer.send({
        ...zaproszenieDoTestowTemplate({ to: email, name, code: invite.promoCode.code, credit: KREDYT_TESTOW, validTo, panelUrl }),
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      });
      wyslane = wynik.delivered;
    } catch (err) {
      this.logger.warn(`Zaproszenie beta ${invite.id}: mail nie wyszedł: ${(err as Error).message}`);
    }
    if (wyslane) await this.prisma.betaInvite.update({ where: { id: invite.id }, data: { sentAt: new Date() } });

    await this.audit.record({
      action: 'BETA_INVITE_CREATED',
      actorUserId,
      details: { inviteId: invite.id, code: invite.promoCode.code, mailWyslany: wyslane },
    });
    return { id: invite.id, email, code: invite.promoCode.code, validTo: validTo.toISOString(), mailWyslany: wyslane };
  }

  async wycofaj(id: string, actorUserId: string) {
    const invite = await this.prisma.betaInvite.findUnique({ where: { id } });
    if (!invite) throw new NotFoundException('Nie ma takiego zaproszenia.');
    await this.prisma.promoCode.update({ where: { id: invite.promoCodeId }, data: { active: false } });
    await this.audit.record({ action: 'BETA_INVITE_REVOKED', actorUserId, details: { inviteId: id } });
    return { ok: true as const };
  }

  /** Testerzy: kod, czy użyty, przez kogo, aktywne usługi, zgłoszenia z tematem BETA. */
  async lista(teraz = new Date()) {
    const zaproszenia = await this.prisma.betaInvite.findMany({
      orderBy: { createdAt: 'desc' },
      take: 500,
      include: {
        promoCode: {
          select: {
            code: true, active: true, validTo: true,
            redemptions: { take: 1, select: { createdAt: true, user: { select: { id: true, email: true } } } },
          },
        },
      },
    });
    const userIds = zaproszenia.flatMap((z) => z.promoCode.redemptions.map((r) => r.user.id));
    const [uslugi, zgloszenia] = userIds.length
      ? await Promise.all([
          this.prisma.subscription.groupBy({ by: ['userId'], where: { userId: { in: userIds }, status: 'ACTIVE' }, _count: { _all: true } }),
          this.prisma.ticket.findMany({ where: { userId: { in: userIds }, topic: 'BETA' }, select: { userId: true, status: true } }),
        ])
      : [[], []];
    const ileUslug = new Map(uslugi.map((u) => [u.userId, u._count._all]));
    return zaproszenia.map((z) => {
      const r = z.promoCode.redemptions[0] ?? null;
      const uid = r?.user.id;
      const moje = zgloszenia.filter((t) => t.userId === uid);
      return {
        id: z.id,
        email: z.email,
        name: z.name,
        code: z.promoCode.code,
        wyslane: z.sentAt?.toISOString() ?? null,
        stan: r ? 'UZYTY' : !z.promoCode.active ? 'WYCOFANY' : z.promoCode.validTo && z.promoCode.validTo <= teraz ? 'WYGASL' : 'CZEKA',
        waznyDo: z.promoCode.validTo?.toISOString() ?? null,
        konto: r ? { email: r.user.email, od: r.createdAt.toISOString() } : null,
        aktywneUslugi: uid ? (ileUslug.get(uid) ?? 0) : 0,
        zgloszenia: moje.length,
        zgloszeniaOtwarte: moje.filter((t) => t.status !== 'CLOSED').length,
      };
    });
  }

  /** Czy zalogowany użytkownik jest testerem (zrealizował kod z zaproszenia). */
  async czyTester(userId: string): Promise<boolean> {
    const n = await this.prisma.promoRedemption.count({ where: { userId, promoCode: { betaInvite: { isNot: null } } } });
    return n > 0;
  }
}

import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ConfigService } from '@nestjs/config';
import { AccountStatus, SubscriptionStatus } from '@verris/database';
import { nodeErrorKind, type DaMessage, type DirectAdminClient } from '@verris/directadmin-sdk';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { AdminNodeActions } from '../common/audit/audit.actions.js';
import { MailerService } from '../mail/mailer.service.js';
import { NotificationsService, type NotificationCategory } from '../notifications/notifications.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import {
  komunikatKonta,
  komunikatKontaTemplate,
  type KomunikatKontaRodzaj,
} from '../mail/templates/hosting-notifications.js';

/** Wpis audytu (tylko operator — bez userId, więc nie trafia do dziennika ani eksportu klienta). */
const AKCJA = AdminNodeActions.NODE_SYSTEM_MESSAGE;
const DEDUP_MS = 24 * 60 * 60 * 1000; // ten sam rodzaj dla tej samej domeny maks. raz na dobę
const PAGE = 200;

export type Rodzaj = KomunikatKontaRodzaj | 'nic';

/** Co idzie do klienta: mail + panel, sam panel; reszta („nic”) — tylko log operatora. */
const MAIL: ReadonlySet<Rodzaj> = new Set(['ssl-blad', 'limit-dysku', 'limit-transferu', 'kopia-blad']);
const KATEGORIA: Record<KomunikatKontaRodzaj, NotificationCategory> = {
  'ssl-blad': 'SSL',
  'ssl-ok': 'SSL',
  'limit-dysku': 'SYSTEM',
  'limit-transferu': 'SYSTEM',
  'kopia-blad': 'SYSTEM',
};

const BLAD = /bł[aąeę]d|nie powiod|niepowodz|nieudan|nie udał|error|fail/;

/**
 * Klasyfikacja po temacie wiadomości węzła (język węzła = pl, angielski na wszelki wypadek).
 * ponytail: dopasowanie słów kluczowych — nowy, nieznany temat ląduje w „nic” (log operatora), nie u klienta.
 */
export function klasyfikujWiadomosc(temat: string): Rodzaj {
  const t = temat.toLowerCase();
  // Klucze logowania i Hash URL mają w temacie dowolną nazwę nadaną przez użytkownika — odcinamy je pierwsze.
  if (/klucz logowania|login key|hash url/.test(t)) return 'nic';
  if (/let'?s ?encrypt/.test(t)) {
    if (BLAD.test(t)) return 'ssl-blad';
    if (/sukces|success|pomyśln/.test(t)) return 'ssl-ok';
    return 'nic';
  }
  if (/kopi|backup/.test(t)) return BLAD.test(t) ? 'kopia-blad' : 'nic';
  if (/przekrocz|zbliża|osiągn|limit|exceed|approach/.test(t)) {
    if (/transfer|bandwidth|przepustow/.test(t)) return 'limit-transferu';
    if (/dysk|miejsc|quota|disk|przydział/.test(t)) return 'limit-dysku';
  }
  return 'nic';
}

/**
 * Pierwsza domena konta wymieniona w tekście (dłuższe najpierw — sklep.firma.pl przed firma.pl).
 * Poddomena spoza listy (np. www.firma.pl) wskazuje domenę nadrzędną; „mojafirma.pl” nie pasuje do firma.pl.
 */
export function domenaWTekscie(tekst: string, domeny: string[]): string | null {
  const t = tekst.toLowerCase();
  const esc = (d: string) => d.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (
    [...domeny]
      .map((d) => d.toLowerCase())
      .sort((a, b) => b.length - a.length)
      .find((d) => new RegExp(`(^|[^a-z0-9-])${esc(d)}($|[^a-z0-9-])`).test(t)) ?? null
  );
}

type Konto = {
  id: string;
  userId: string;
  domain: string;
  serverId: string;
  subscriptionId: string;
  daMessageSeen: number | null;
  user: { email: string; firstName: string | null } | null;
};

/**
 * Wiadomości systemowe węzła (decyzja 29.09.2026 „Mail Verris + panel”). Węzeł kieruje swoje maile
 * do aliasu bez doręczenia, więc ważne zdarzenia (błąd SSL, limity, błąd kopii) przekazujemy klientowi
 * sami: własnym mailem i powiadomieniem w panelu. Co 15 min czytamy listę wiadomości konta i bierzemy
 * tylko nowsze niż zapamiętany numer (Account.daMessageSeen).
 */
@Injectable()
export class WiadomosciWezlaScheduler {
  private readonly logger = new Logger(WiadomosciWezlaScheduler.name);
  private busy = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly da: DirectAdminService,
    private readonly mailer: MailerService,
    private readonly notifications: NotificationsService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('clientPanelUrl') ?? process.env.CLIENT_PANEL_URL ?? 'https://panel.verris.pl').replace(/\/$/, '');
  }

  @Cron('*/15 * * * *', { name: 'node-system-messages' })
  async run(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    // Martwy węzeł: pierwszy błąd sieci wyłącza resztę jego kont w tym przebiegu, a w logu jest
    // jedna linia podsumowania na przebieg — nie po jednej na konto co 15 min.
    const martweWezly = new Set<string>();
    const bledy: string[] = [];
    try {
      for (let cursor: string | undefined; ; ) {
        const page: Konto[] = await this.prisma.account.findMany({
          where: {
            status: AccountStatus.ACTIVE,
            daPasswordEnc: { not: null },
            subscription: { status: SubscriptionStatus.ACTIVE },
          },
          select: {
            id: true,
            userId: true,
            domain: true,
            serverId: true,
            subscriptionId: true,
            daMessageSeen: true,
            user: { select: { email: true, firstName: true } },
          },
          orderBy: { id: 'asc' },
          take: PAGE,
          ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
        });
        for (const konto of page) {
          if (martweWezly.has(konto.serverId)) continue;
          try {
            await this.konto(konto);
          } catch (err) {
            const e = err as Error & { code?: string };
            if (nodeErrorKind(err) || e.code === 'ETIMEDOUT_CIRCUIT') martweWezly.add(konto.serverId);
            bledy.push(`${konto.id}: ${e.message?.slice(0, 120)}`);
          }
        }
        if (page.length < PAGE) break;
        cursor = page[page.length - 1].id;
      }
    } catch (err) {
      this.logger.error(`wiadomości węzła — przebieg przerwany: ${(err as Error).message}`);
    } finally {
      this.busy = false;
    }
    if (bledy.length) {
      this.logger.warn(
        `wiadomości węzła: ${bledy.length} kont bez odczytu` +
          (martweWezly.size ? `, niedostępne węzły: ${[...martweWezly].join(', ')}` : '') +
          ` (pierwsze: ${bledy[0]})`,
      );
    }
  }

  private async konto(k: Konto): Promise<void> {
    const client = await this.da.getClientForHostingAccount(k.id, k.userId);
    const lista = await client.listMessages();
    const najnowszy = lista.reduce((m, w) => Math.max(m, w.number), 0);
    // Pierwszy przebieg albo numeracja od nowa (konto przeniesione na inny węzeł): tylko zapamiętaj.
    const widziany = k.daMessageSeen;
    if (widziany == null || najnowszy < widziany) {
      await this.prisma.account.update({ where: { id: k.id }, data: { daMessageSeen: najnowszy } });
      return;
    }
    const nowe = lista.filter((w) => w.number > widziany).sort((a, b) => a.number - b.number);
    if (!nowe.length) return;
    let domeny: string[] | null = null;
    for (const w of nowe) {
      await this.wiadomosc(k, w, client, async () => (domeny ??= await client.getDomains().catch(() => [k.domain])));
    }
    await this.prisma.account.update({ where: { id: k.id }, data: { daMessageSeen: najnowszy } });
  }

  private async wiadomosc(k: Konto, w: DaMessage, client: DirectAdminClient, domenyKonta: () => Promise<string[]>): Promise<void> {
    const rodzaj = klasyfikujWiadomosc(w.subject);
    const slad = { subscriptionId: k.subscriptionId, accountId: k.id, numer: w.id, temat: w.subject.slice(0, 200), rodzaj };
    if (rodzaj === 'nic') {
      await this.audit.record({ action: AKCJA, details: slad });
      return;
    }
    const tresc = await client.getMessage(w.id).then((m) => m.body, () => '');
    const domena = domenaWTekscie(`${w.subject}\n${tresc}`, await domenyKonta()) ?? k.domain;
    const klucz = `${k.subscriptionId}|${rodzaj}|${domena}`;
    const byl = await this.prisma.auditLog.findFirst({
      where: { action: AKCJA, createdAt: { gte: new Date(Date.now() - DEDUP_MS) }, details: { path: ['klucz'], equals: klucz } },
      select: { id: true },
    });
    if (byl) {
      await this.audit.record({ action: AKCJA, details: { ...slad, domena, pominieto: 'dedup-24h' } });
      return;
    }
    await this.audit.record({ action: AKCJA, details: { ...slad, domena, klucz } });

    const k2 = komunikatKonta(rodzaj, domena);
    await this.notifications.create({
      userId: k.userId,
      category: KATEGORIA[rodzaj],
      severity: rodzaj === 'ssl-ok' ? 'info' : 'warning',
      title: k2.tytul,
      body: [k2.tresc, ...k2.rady].join(' '),
      link: `/dashboard/services/${k.subscriptionId}?tab=${k2.tab}`,
      subscriptionId: k.subscriptionId,
    });
    if (!MAIL.has(rodzaj) || !k.user?.email) return;
    await this.mailer
      .send({
        ...komunikatKontaTemplate({
          to: k.user.email,
          firstName: k.user.firstName,
          rodzaj,
          domena,
          panelUrl: this.panelUrl(),
          ctaUrl: `${this.panelUrl()}/dashboard/services/${k.subscriptionId}?tab=${k2.tab}`,
        }),
        userId: k.userId,
        category: 'TRANSACTIONAL',
        fromRole: 'SUPPORT',
      })
      .catch((err) => this.logger.warn(`komunikat ${rodzaj} — mail nie wyszedł (konto ${k.id}): ${(err as Error).message}`));
  }
}

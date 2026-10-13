import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Role } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailerService } from '../mail/mailer.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { alarmOpsTemplate } from '../mail/templates/ops-notifications.js';

export type WagaAlarmu = 'krytyczny' | 'ostrzezenie' | 'info';

export interface Alarm {
  /** Klucz deduplikacji, np. `straznik:<serverId>:lve`. Ten sam klucz w oknie `cooldownMin` — bez ponownej wysyłki. */
  klucz: string;
  tytul: string;
  tresc: string;
  /** Ścieżka w panelu admina (np. `/nodes/<id>`). */
  link: string;
  waga: WagaAlarmu;
  cooldownMin?: number;
}

/** Akcja dziennika, po której liczymy okno deduplikacji (bez osobnej tabeli). */
export const AKCJA_ALARMU = 'ALARM_OPS';

/**
 * 13.10 (decyzja właściciela po awarii t1): alarm operacyjny dochodzi od razu — powiadomienie w panelu admina,
 * e-mail do administratorów i push na telefon (ntfy, gdy skonfigurowany: ALERT_PUSH_URL = adres tematu ntfy,
 * opcjonalnie ALERT_PUSH_TOKEN). Wcześniej awaria węzła dawała tylko e-mail z Grafany (usługi) albo nic (LVE).
 * Publikacja ntfy jako JSON (UTF-8 w tytule bez kodowania nagłówków): https://docs.ntfy.sh/publish/#publish-as-json
 */
@Injectable()
export class AlarmyService {
  private readonly logger = new Logger(AlarmyService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
  ) {}

  private panelUrl(): string {
    return (this.config.get<string>('adminPanelUrl') ?? process.env.ADMIN_PANEL_URL ?? 'https://admin.verris.pl').replace(/\/$/, '');
  }

  /** @returns false, gdy alarm z tym kluczem poszedł w oknie deduplikacji. Błąd kanału nie przerywa pozostałych. */
  async wyslij(a: Alarm): Promise<boolean> {
    const cooldownMs = (a.cooldownMin ?? 60) * 60_000;
    const niedawno = await this.prisma.auditLog.findFirst({
      where: { action: AKCJA_ALARMU, createdAt: { gte: new Date(Date.now() - cooldownMs) }, details: { path: ['klucz'], equals: a.klucz } },
      select: { id: true },
    });
    if (niedawno) return false;
    await this.audit.record({ action: AKCJA_ALARMU, details: { klucz: a.klucz, tytul: a.tytul, waga: a.waga } });

    const admini = await this.prisma.user.findMany({
      where: { role: Role.ADMIN, anonymizedAt: null, loginBlocked: false },
      select: { id: true, email: true, firstName: true },
    });
    const url = `${this.panelUrl()}${a.link}`;
    await this.prisma.notification
      .createMany({
        data: admini.map((u) => ({
          userId: u.id,
          category: 'SYSTEM',
          severity: a.waga === 'krytyczny' ? 'critical' : a.waga === 'ostrzezenie' ? 'warning' : 'info',
          title: a.tytul.slice(0, 200),
          body: a.tresc.slice(0, 2000),
          link: a.link,
        })),
      })
      .catch((e: Error) => this.logger.error(`alarm ${a.klucz}: powiadomienia w panelu: ${e.message}`));
    await Promise.all(
      admini.map((u) =>
        this.mailer
          .send({
            ...alarmOpsTemplate({ to: u.email, firstName: u.firstName, tytul: a.tytul, tresc: a.tresc, url, waga: a.waga, panelUrl: this.panelUrl() }),
            userId: u.id,
            category: 'TRANSACTIONAL',
            fromRole: 'SECURITY',
          })
          .catch((e: Error) => this.logger.warn(`alarm ${a.klucz}: e-mail do ${u.email}: ${e.message}`)),
      ),
    );
    await this.push(a, url).catch((e: Error) => this.logger.warn(`alarm ${a.klucz}: push: ${e.message}`));
    return true;
  }

  private async push(a: Alarm, url: string): Promise<void> {
    const cel = this.config.get<string>('alertPushUrl') ?? process.env.ALERT_PUSH_URL;
    if (!cel) return;
    const u = new URL(cel);
    const temat = u.pathname.replace(/^\/+|\/+$/g, '');
    if (!temat) throw new Error('ALERT_PUSH_URL bez tematu (np. https://ntfy.sh/verris-alarmy-xyz)');
    const token = this.config.get<string>('alertPushToken') ?? process.env.ALERT_PUSH_TOKEN;
    const odp = await fetch(`${u.origin}/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      body: JSON.stringify({
        topic: temat,
        title: a.tytul.slice(0, 200),
        message: a.tresc.slice(0, 3500),
        // ntfy: 5 = max/urgent (dźwięk mimo trybu cichego, jeśli ustawiony w aplikacji), 4 = high, 3 = default.
        priority: a.waga === 'krytyczny' ? 5 : a.waga === 'ostrzezenie' ? 4 : 3,
        tags: [a.waga === 'krytyczny' ? 'rotating_light' : a.waga === 'ostrzezenie' ? 'warning' : 'white_check_mark'],
        click: url,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!odp.ok) throw new Error(`ntfy HTTP ${odp.status}`);
  }
}

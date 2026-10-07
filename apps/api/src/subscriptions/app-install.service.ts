import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { bladZadaniaDlaKlienta } from './blad-zadania.js';

interface AppCatalogEntry {
  slug: string;
  name: string;
  description: string;
  /** Needs a DB + admin user (full CLI install). */
  needsDb: boolean;
  adminPath: string;
}

export const CATALOG: Record<string, AppCatalogEntry> = {
  nextcloud: {
    slug: 'nextcloud',
    name: 'Nextcloud',
    description: 'Prywatna chmura na pliki, kalendarz i kontakty.',
    needsDb: true,
    adminPath: '/',
  },
  prestashop: {
    slug: 'prestashop',
    name: 'PrestaShop',
    description: 'Sklep internetowy (e-commerce).',
    needsDb: true,
    adminPath: '/admin', // nadpisywane przez katalogPaneluPrestaShop()
  },
  joomla: {
    slug: 'joomla',
    name: 'Joomla',
    description: 'System zarządzania treścią — strony firmowe, portale, blogi.',
    needsDb: true,
    adminPath: '/administrator',
  },
  mediawiki: {
    slug: 'mediawiki',
    name: 'MediaWiki',
    description: 'Wiki jak Wikipedia — baza wiedzy, dokumentacja, intranet.',
    needsDb: true,
    adminPath: '/',
  },
};

/**
 * PrestaShop nie wpuszcza do panelu pod „/admin” — skrypt węzła zmienia nazwę katalogu na tę samą wartość
 * (admin + 10 znaków sha256("<baza>:<hasło admina>")), więc adres pokazany klientowi się zgadza (t1 01.10).
 */
export function katalogPaneluPrestaShop(baza: string, haslo: string): string {
  return `/admin${createHash('sha256').update(`${baza}:${haslo}`).digest('hex').slice(0, 10)}`;
}

/**
 * P-3 — 1-click app marketplace (beyond WordPress/A4). Mirrors the WP installer:
 * create a DA-tracked DB + admin credentials → queue an APP_INSTALL NodeTask
 * whose payload tells the on-node agent which app to install. Admin password is
 * returned to the customer ONCE.
 */
@Injectable()
export class AppInstallService {
  private readonly logger = new Logger(AppInstallService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly da: DirectAdminService,
  ) {}

  catalog() {
    return Object.values(CATALOG).map((a) => ({
      slug: a.slug,
      name: a.name,
      description: a.description,
    }));
  }

  async statusForSubscription(subscriptionId: string, userId: string) {
    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const tasks = await this.prisma.nodeTask.findMany({
      where: { accountId: sub.account!.id, kind: NodeTaskKind.APP_INSTALL },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    // Domeny usługi do wyboru w instalatorze; serwer niedostępny → tylko główna.
    const lista = await this.da.listHostingDomainsForSubscription(subscriptionId, userId).catch(() => null);
    const domains = lista?.domains.length ? lista.domains.map((d) => d.name) : [sub.account!.domain];
    return {
      domain: sub.account!.domain,
      domains,
      catalog: this.catalog(),
      installs: tasks.map((t) => ({
        id: t.id,
        app: (t.payload as { app?: string } | null)?.app ?? null,
        status: t.status,
        errorMessage: bladZadaniaDlaKlienta(t.errorMessage, t.outputLog),
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async install(
    subscriptionId: string,
    userId: string,
    input: { app: string; adminUser: string; adminEmail: string; adminPassword?: string; domain?: string },
  ) {
    const app = CATALOG[input.app];
    if (!app) throw new BadRequestException('Nieobsługiwana aplikacja.');

    const sub = await this.requireOwnedSub(subscriptionId, userId);
    const account = sub.account!;

    const inflight = await this.prisma.nodeTask.findFirst({
      where: {
        accountId: account.id,
        kind: NodeTaskKind.APP_INSTALL,
        status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] },
      },
    });
    if (inflight) throw new ConflictException('Instalacja aplikacji jest już w toku dla tej usługi.');

    const adminUser = (input.adminUser || '').trim();
    const adminEmail = (input.adminEmail || '').trim();
    if (!/^[a-zA-Z0-9_.@-]{3,60}$/.test(adminUser)) {
      throw new BadRequestException('Nieprawidłowy login administratora.');
    }
    // MediaWiki nie dopuszcza @ w nazwie użytkownika ($wgInvalidUsernameCharacters).
    if (app.slug === 'mediawiki' && adminUser.includes('@')) {
      throw new BadRequestException('Login administratora MediaWiki nie może zawierać znaku @.');
    }
    // Wartości trafiają do poleceń instalatora na węźle (w cudzysłowach powłoki) — bez ', ", \, $, `
    // i spacji. Sprawdzamy PRZED założeniem bazy, żeby odrzucone żądanie nie zostawiało śmieci.
    if (!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(adminEmail) || adminEmail.length > 120) {
      throw new BadRequestException('Nieprawidłowy e-mail administratora.');
    }
    const podaneHaslo = (input.adminPassword || '').trim();
    if (podaneHaslo && !/^[A-Za-z0-9!#%+,.:;=?@^_~*()[\]{}-]{12,72}$/.test(podaneHaslo)) {
      throw new BadRequestException(
        'Hasło administratora: 12–72 znaki — litery, cyfry i ! # % + , . : ; = ? @ ^ _ ~ * ( ) [ ] { } - (bez spacji, cudzysłowów, \\, $ i `).',
      );
    }

    // Domena spoza głównej — tylko przypisana do tej usługi (instalator pisze do domains/<domena>/public_html).
    const domena = input.domain?.trim()
      ? await this.da.assertDomainOwnedBySubscription(subscriptionId, userId, input.domain)
      : account.domain;

    // Create a DA-tracked DB + user for the app.
    const dbShort = `${app.slug.slice(0, 4)}${randomToken(4)}`;
    const dbPass = strongPassword();
    let db: { database: string; username: string };
    try {
      const client = await this.da.getClientForHostingAccount(account.id, userId);
      await this.usunBazyPrzerwanych(account, client);
      db = await client.createMysqlDatabase({ name: dbShort, user: dbShort, password: dbPass });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`App install: DB create failed sub=${subscriptionId}: ${msg}`);
      throw new BadRequestException(`Nie udało się utworzyć bazy danych: ${msg}`);
    }

    const adminPass = podaneHaslo || strongPassword();
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.APP_INSTALL,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: {
          app: app.slug,
          daUser: account.daUsername,
          domain: domena,
          dbName: db.database,
          dbUser: db.username,
          dbPass,
          adminUser,
          adminPass,
          adminEmail,
        },
      },
    });

    await this.audit.record({
      action: 'APP_INSTALL_QUEUED',
      userId,
      actorUserId: userId,
      details: { subscriptionId, app: app.slug, domain: domena, taskId: task.id },
    });

    return {
      ok: true as const,
      taskId: task.id,
      app: app.slug,
      domain: domena,
      adminUrl: `https://${domena}${app.slug === 'prestashop' ? katalogPaneluPrestaShop(db.database, adminPass) : app.adminPath}`,
      adminUser,
      adminPassword: adminPass,
      note: 'Zapisz hasło administratora — nie pokażemy go ponownie. Instalacja potrwa 1-3 min.',
    };
  }

  /**
   * Bazy po instalacjach przerwanych, zanim skrypt węzła cokolwiek zmienił (znacznik
   * `[VERRIS_APP] bez_zmian=1` w logu) — test D3 29.09: po przerwanej Joomli klient zostawał z pustą
   * bazą „…_jooma7c0” na liście. Tylko nazwy w formacie instalatora (<login>_<4 litery><4 hex>), bo
   * bazy z instalacji, które coś zapisały, mogą już trzymać dane klienta. Błąd usunięcia → spróbujemy
   * przy następnej instalacji.
   */
  private async usunBazyPrzerwanych(
    account: { id: string; daUsername: string | null },
    client: { deleteMysqlDatabase(name: string): Promise<void> },
  ) {
    if (!account.daUsername) return;
    const wzor = new RegExp(`^${account.daUsername}_[a-z]{1,4}[0-9a-f]{4}$`);
    const przerwane = await this.prisma.nodeTask.findMany({
      where: {
        accountId: account.id,
        kind: NodeTaskKind.APP_INSTALL,
        status: NodeTaskStatus.FAILED,
        outputLog: { contains: '[VERRIS_APP] bez_zmian=1' },
      },
      select: { id: true, payload: true },
      take: 20,
    });
    for (const t of przerwane) {
      const p = (t.payload ?? {}) as Record<string, unknown>;
      const baza = typeof p.dbName === 'string' ? p.dbName : '';
      if (p.bazaUsunieta === true || !wzor.test(baza)) continue;
      try {
        await client.deleteMysqlDatabase(baza);
        await this.prisma.nodeTask.update({ where: { id: t.id }, data: { payload: { ...p, bazaUsunieta: true } as never } });
      } catch (err) {
        this.logger.warn(`App install: nie usunięto bazy ${baza} po przerwanej instalacji: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return sub;
  }
}

function randomToken(len: number): string {
  return randomBytes(len).toString('hex').slice(0, len);
}

function strongPassword(): string {
  return randomBytes(18).toString('base64url');
}

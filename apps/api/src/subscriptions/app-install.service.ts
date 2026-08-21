import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { DirectAdminService } from '../servers/directadmin.service';

interface AppCatalogEntry {
  slug: string;
  name: string;
  description: string;
  /** Needs a DB + admin user (full CLI install). */
  needsDb: boolean;
  adminPath: string;
}

const CATALOG: Record<string, AppCatalogEntry> = {
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
    adminPath: '/admin',
  },
};

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
    return {
      domain: sub.account!.domain,
      catalog: this.catalog(),
      installs: tasks.map((t) => ({
        id: t.id,
        app: (t.payload as { app?: string } | null)?.app ?? null,
        status: t.status,
        errorMessage: t.errorMessage,
        createdAt: t.createdAt.toISOString(),
        completedAt: t.completedAt?.toISOString() ?? null,
      })),
    };
  }

  async install(
    subscriptionId: string,
    userId: string,
    input: { app: string; adminUser: string; adminEmail: string; adminPassword?: string },
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
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
      throw new BadRequestException('Nieprawidłowy e-mail administratora.');
    }

    // Create a DA-tracked DB + user for the app.
    const dbShort = `${app.slug.slice(0, 4)}${randomToken(4)}`;
    const dbPass = strongPassword();
    let db: { database: string; username: string };
    try {
      const client = await this.da.getClientForHostingAccount(account.id, userId);
      db = await client.createMysqlDatabase({ name: dbShort, user: dbShort, password: dbPass });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`App install: DB create failed sub=${subscriptionId}: ${msg}`);
      throw new BadRequestException(`Nie udało się utworzyć bazy danych: ${msg}`);
    }

    const adminPass = (input.adminPassword || '').trim() || strongPassword();
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
          domain: account.domain,
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
      details: { subscriptionId, app: app.slug, domain: account.domain, taskId: task.id },
    });

    return {
      ok: true as const,
      taskId: task.id,
      app: app.slug,
      domain: account.domain,
      adminUrl: `https://${account.domain}${app.adminPath}`,
      adminUser,
      adminPassword: adminPass,
      note: 'Zapisz hasło administratora — nie pokażemy go ponownie. Instalacja potrwa 1-3 min.',
    };
  }

  private async requireOwnedSub(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({
      where: { id: subscriptionId, userId },
      include: { account: true },
    });
    if (!sub) throw new NotFoundException('Service not found');
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

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';

/**
 * D-14 — bazy PostgreSQL konta (`ops/scripts/node-pgsql.sh`, zadanie PGSQL). Baza i jej użytkownik mają
 * tę samą nazwę `<login>_<sufiks>` (jak bazy MySQL w DirectAdminie). Hasło generuje API i pokazuje raz;
 * z payloadu zadania znika po jego zakończeniu (NodeTasksService.completeTaskFromNode → bezSekretow).
 * ponytail: jeden limit baz dla wszystkich planów i bez limitu rozmiaru (rozmiar widać w panelu) —
 * per plan, gdy pojawi się drugi plan hostingu.
 */
export const LIMIT_BAZ_PGSQL = 5;
export const PGSQL_HOST = '127.0.0.1';
export const PGSQL_PORT = 5432;
const SUFIKS = /^[a-z0-9]{1,16}$/;

type Tryb = 'list' | 'create' | 'delete' | 'password';

@Injectable()
export class PgsqlService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const { account } = await this.konto(subscriptionId, userId);
    return this.opis(account);
  }

  odswiez(subscriptionId: string, userId: string) {
    return this.zlec(subscriptionId, userId, 'list');
  }

  async utworz(subscriptionId: string, userId: string, sufiks: string) {
    const haslo = noweHaslo();
    const { nazwa, stan } = await this.zlec(subscriptionId, userId, 'create', sufiks, haslo);
    return { ...stan, nowa: { nazwa, uzytkownik: nazwa, haslo, host: PGSQL_HOST, port: PGSQL_PORT } };
  }

  async usun(subscriptionId: string, userId: string, sufiks: string) {
    return (await this.zlec(subscriptionId, userId, 'delete', sufiks)).stan;
  }

  async zmienHaslo(subscriptionId: string, userId: string, sufiks: string) {
    const haslo = noweHaslo();
    const { nazwa, stan } = await this.zlec(subscriptionId, userId, 'password', sufiks, haslo);
    return { ...stan, nowa: { nazwa, uzytkownik: nazwa, haslo, host: PGSQL_HOST, port: PGSQL_PORT } };
  }

  private async zlec(subscriptionId: string, userId: string, tryb: Tryb, sufiks = '', haslo = '') {
    const { sub, account } = await this.konto(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    if (tryb !== 'list' && !SUFIKS.test(sufiks)) {
      throw new BadRequestException('Nazwa bazy: 1–16 znaków, małe litery i cyfry.');
    }
    const nazwa = tryb === 'list' ? '' : `${account.daUsername}_${sufiks}`;
    if (tryb === 'create' || tryb === 'delete' || tryb === 'password') {
      const bazy = (await this.opis(account)).bazy;
      const jest = bazy.some((b) => b.nazwa === nazwa);
      if (tryb === 'create' && jest) throw new ConflictException(`Baza ${nazwa} już istnieje.`);
      if (tryb === 'create' && bazy.length >= LIMIT_BAZ_PGSQL) {
        throw new BadRequestException(`Limit baz PostgreSQL na konto: ${LIMIT_BAZ_PGSQL}.`);
      }
      if (tryb !== 'create' && !jest) throw new NotFoundException(`Baza ${nazwa} nie istnieje.`);
    }
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.PGSQL, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Zmiana baz PostgreSQL jest już w toku — poczekaj na wynik.');
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.PGSQL,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: {
          mode: tryb,
          daUser: account.daUsername,
          db: sufiks,
          max: String(LIMIT_BAZ_PGSQL),
          ...(haslo ? { pass: haslo } : {}),
        },
      },
    });
    const akcja = {
      create: HostingResourceActions.HOSTING_PGSQL_CREATE_QUEUED,
      delete: HostingResourceActions.HOSTING_PGSQL_DELETE_QUEUED,
      password: HostingResourceActions.HOSTING_PGSQL_PASSWORD_QUEUED,
      list: null,
    }[tryb];
    if (akcja) {
      await this.audit.record({
        action: akcja,
        userId: sub.userId,
        actorUserId: userId,
        details: { subscriptionId, taskId: task.id, baza: nazwa },
      });
    }
    return { nazwa, stan: await this.opis(account) };
  }

  private async opis(account: { id: string; daUsername: string }) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId: account.id, kind: NodeTaskKind.PGSQL },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && /^\[pgsql\] Gotowe\.\s*$/m.test(z.outputLog ?? ''));
    const ostatnie = zadania[0] ?? null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      odczytano: udane ? (udane.completedAt ?? udane.createdAt).toISOString() : null,
      login: account.daUsername,
      bazy: udane ? bazyZLogu(udane.outputLog) : [],
      host: PGSQL_HOST,
      port: PGSQL_PORT,
      limit: LIMIT_BAZ_PGSQL,
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
    };
  }

  private async konto(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

export function bazyZLogu(log: string | null): { nazwa: string; rozmiar: number }[] {
  return [...(log ?? '').matchAll(/^VERRIS_PGSQL_DB=([a-z][a-z0-9]{0,15}_[a-z0-9]{1,16}) (\d+)\s*$/gm)].map((m) => ({
    nazwa: m[1],
    rozmiar: Number(m[2]),
  }));
}

function bladZLogu(log: string | null): string {
  const p = '[pgsql] BŁĄD: ';
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith(p));
  return l ? l.slice(p.length).slice(0, 300) : 'Zmiana nie powiodła się. Napisz do nas — sprawdzimy to.';
}

function noweHaslo(): string {
  return randomBytes(18).toString('base64url');
}

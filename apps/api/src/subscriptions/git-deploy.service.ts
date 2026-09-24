import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * C-25 / C-26 — repozytorium Git strony: klucz wdrożeniowy konta, klonowanie do katalogu strony,
 * „pobierz zmiany teraz”. Węzeł (zadanie GIT_DEPLOY, `ops/scripts/node-git-deploy.sh`) jako klient.
 * Harmonogram `git pull` (cron) zostaje w DirectAdminService.createDeployJob.
 */
const URL_RE = /^(https:\/\/[A-Za-z0-9.-]+(:[0-9]{2,5})?\/[A-Za-z0-9._/~-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$/;
const GALAZ_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]{0,99}$/;
const KATALOG_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

@Injectable()
export class GitDeployService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
    private readonly config: ConfigService,
  ) {}

  /** C-27 — tajny adres webhooka dla domeny (+ podkatalogu). Poprzedni dla tej pary przestaje działać. */
  async utworzWebhook(subscriptionId: string, userId: string, input: { domain: string; dir?: string }) {
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const dir = sprawdzKatalog(input.dir);
    const token = randomBytes(24).toString('base64url');
    await this.prisma.gitWebhook.upsert({
      where: { accountId_domain_dir: { accountId: account.id, domain: domena, dir } },
      create: { accountId: account.id, domain: domena, dir, tokenHash: skrot(token) },
      update: { tokenHash: skrot(token), lastUsedAt: null },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_GIT_WEBHOOK_CREATED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, domain: domena, dir },
    });
    const base = (this.config.get<string>('publicApiUrl') || 'https://api.verris.pl').replace(/\/$/, '');
    return { url: `${base}/hooks/git/${token}`, ...(await this.opis(account.id, domena)) };
  }

  async usunWebhook(subscriptionId: string, userId: string, input: { domain: string; dir?: string }) {
    const { account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    await this.prisma.gitWebhook.deleteMany({ where: { accountId: account.id, domain: domena, dir: sprawdzKatalog(input.dir) } });
    return this.opis(account.id, domena);
  }

  /** Wywołanie webhooka z GitHuba/GitLaba: kolejkuje git pull. Nieznany token → false (404 w kontrolerze). */
  async wyzwolWebhook(token: string): Promise<boolean> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token ?? '')) return false;
    const hook = await this.prisma.gitWebhook.findUnique({ where: { tokenHash: skrot(token) }, include: { account: true } });
    if (!hook || hook.account.status !== 'ACTIVE') return false;
    await this.prisma.gitWebhook.update({ where: { id: hook.id }, data: { lastUsedAt: new Date() } });
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: hook.accountId, kind: NodeTaskKind.GIT_DEPLOY, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    // ponytail: push w trakcie trwającego pull — pomijamy; następny push pobierze wszystko.
    if (wToku) return true;
    await this.prisma.nodeTask.create({
      data: {
        serverId: hook.account.serverId,
        accountId: hook.accountId,
        kind: NodeTaskKind.GIT_DEPLOY,
        status: NodeTaskStatus.QUEUED,
        requestedById: null,
        payload: { mode: 'pull', daUser: hook.account.daUsername, domain: hook.domain, dir: hook.dir, url: '', branch: '', webhook: true },
      },
    });
    return true;
  }

  async status(subscriptionId: string, userId: string, domain: string) {
    const { account, domena } = await this.wymagajDomeny(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async zlec(
    subscriptionId: string,
    userId: string,
    tryb: 'key' | 'clone' | 'pull',
    input: { domain: string; dir?: string; url?: string; branch?: string },
  ) {
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const dir = sprawdzKatalog(input.dir);
    const url = (input.url ?? '').trim();
    const branch = (input.branch ?? '').trim();
    if (tryb === 'clone' && !URL_RE.test(url)) throw new BadRequestException('Adres repozytorium: https://… albo git@host:ścieżka.');
    if (branch && (!GALAZ_RE.test(branch) || branch.includes('..'))) throw new BadRequestException('Nieprawidłowa nazwa gałęzi.');
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.GIT_DEPLOY, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Operacja na repozytorium jest już w toku.');
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.GIT_DEPLOY,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { mode: tryb, daUser: account.daUsername, domain: domena, dir, url: tryb === 'clone' ? url : '', branch: tryb === 'clone' ? branch : '' },
      },
    });
    if (tryb !== 'key') {
      await this.audit.record({
        action: tryb === 'clone' ? HostingResourceActions.HOSTING_GIT_CLONE_QUEUED : HostingResourceActions.HOSTING_GIT_PULL_QUEUED,
        userId: sub.userId, actorUserId: userId,
        details: { subscriptionId, domain: domena, dir, url: tryb === 'clone' ? url : undefined, taskId: task.id },
      });
    }
    return this.opis(account.id, domena);
  }

  private async opis(accountId: string, domena: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.GIT_DEPLOY },
      orderBy: { createdAt: 'desc' },
      take: 15,
    });
    const p = (z: (typeof zadania)[number]) => (z.payload ?? {}) as { mode?: string; domain?: string; dir?: string; url?: string };
    const klucz = zadania
      .filter((z) => z.status === NodeTaskStatus.COMPLETED && p(z).mode === 'key')
      .map((z) => /^VERRIS_GIT_KLUCZ=(ssh-ed25519 [A-Za-z0-9+/=]+ [^\s|]{1,300})\s*$/m.exec(z.outputLog ?? '')?.[1] ?? null)
      .find(Boolean) ?? null;
    const operacje = zadania
      .filter((z) => p(z).mode !== 'key' && p(z).domain === domena)
      .slice(0, 5)
      .map((z) => ({
        id: z.id,
        tryb: p(z).mode ?? null,
        katalog: p(z).dir ?? '',
        adres: p(z).url || null,
        status: z.status,
        utworzone: z.createdAt.toISOString(),
        webhook: (z.payload as { webhook?: boolean } | null)?.webhook === true,
        head: /^VERRIS_GIT_HEAD=(.{1,200})$/m.exec(z.outputLog ?? '')?.[1]?.trim() ?? null,
        kopia: /^VERRIS_GIT_KOPIA=(domains\/[^\s|]{1,300})\s*$/m.exec(z.outputLog ?? '')?.[1] ?? null,
        blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : null,
      }));
    const webhooki = await this.prisma.gitWebhook.findMany({ where: { accountId, domain: domena }, orderBy: { createdAt: 'asc' } });
    return {
      domena,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      klucz,
      webhooki: webhooki.map((w) => ({ katalog: w.dir, utworzony: w.createdAt.toISOString(), ostatnio: w.lastUsedAt?.toISOString() ?? null })),
      operacje,
    };
  }

  private async wymagajDomeny(subscriptionId: string, userId: string, domain: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return { sub, account: sub.account, domena };
  }
}

const skrot = (token: string) => createHash('sha256').update(token).digest('hex');

function sprawdzKatalog(raw?: string): string {
  const dir = (raw ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (dir && (!KATALOG_RE.test(dir) || dir.split('/').includes('..'))) throw new BadRequestException('Nieprawidłowy katalog.');
  return dir;
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[git-deploy] BŁĄD: '));
  return l ? l.slice('[git-deploy] BŁĄD: '.length).slice(0, 300) : 'Operacja nie powiodła się. Spróbuj ponownie albo napisz do nas.';
}

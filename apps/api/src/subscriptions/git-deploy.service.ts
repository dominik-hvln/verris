import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditService } from '../common/audit/audit.service.js';
import { HostingResourceActions } from '../common/audit/audit.actions.js';
import { DirectAdminService } from '../servers/directadmin.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';

/**
 * C-25 / C-26 — repozytorium Git strony: klucz wdrożeniowy konta, klonowanie do katalogu strony,
 * „pobierz zmiany teraz”. Węzeł (zadanie GIT_DEPLOY, `ops/scripts/node-git-deploy.sh`) jako klient.
 * Harmonogram `git pull` (cron) zostaje w DirectAdminService.createDeployJob.
 */
const URL_RE = /^(https:\/\/[A-Za-z0-9.-]+(:[0-9]{2,5})?\/[A-Za-z0-9._/~-]+|git@[A-Za-z0-9.-]+:[A-Za-z0-9._/~-]+)$/;
const GALAZ_RE = /^[A-Za-z0-9._][A-Za-z0-9._/-]{0,99}$/;
const KATALOG_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/;

/** 21.10 — budowanie po pobraniu kodu (ops/scripts/node-git-deploy.sh: zbuduj) i zmienne środowiskowe (.env). */
export const PRESETY_BUDOWANIA = ['', 'npm-build', 'npm-ci', 'composer'] as const;
export type PresetBudowania = (typeof PRESETY_BUDOWANIA)[number];
const NAZWA_ZMIENNEJ_RE = /^[A-Z_][A-Z0-9_]{0,63}$/;
export const MAKS_ZMIENNYCH = 50;
export const MAKS_DLUGOSC_WARTOSCI = 4096;
const LOG_OGON = 4000;

@Injectable()
export class GitDeployService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  /** Budowanie i zmienne dla domeny (+ katalogu). Wartości zmiennych nigdy nie wracają z API — tylko nazwy. */
  async ustawKonfiguracje(
    subscriptionId: string,
    userId: string,
    input: { domain: string; dir?: string; budowanie?: string; zmienne?: { ustaw?: Record<string, string>; usun?: string[] } },
  ) {
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const dir = sprawdzKatalog(input.dir);
    const budowanie = (input.budowanie ?? '') as PresetBudowania;
    if (!PRESETY_BUDOWANIA.includes(budowanie)) throw new BadRequestException('Nieznany sposób budowania.');
    const obecna = await this.prisma.gitKonfiguracja.findUnique({ where: { accountId_domain_dir: { accountId: account.id, domain: domena, dir } } });
    const zmienne = obecna?.zmienneEnc ? this.odszyfruj(obecna.zmienneEnc) : {};
    for (const nazwa of input.zmienne?.usun ?? []) delete zmienne[nazwa];
    for (const [nazwa, wartosc] of Object.entries(input.zmienne?.ustaw ?? {})) {
      if (!NAZWA_ZMIENNEJ_RE.test(nazwa)) throw new BadRequestException(`Nazwa zmiennej „${nazwa.slice(0, 64)}”: wielkie litery, cyfry i _ (np. API_KEY).`);
      if (typeof wartosc !== 'string' || wartosc.length > MAKS_DLUGOSC_WARTOSCI) throw new BadRequestException(`Wartość ${nazwa}: najwyżej ${MAKS_DLUGOSC_WARTOSCI} znaków.`);
      if (/[\r\n\0]/.test(wartosc)) throw new BadRequestException(`Wartość ${nazwa} nie może mieć znaku nowej linii.`);
      zmienne[nazwa] = wartosc;
    }
    if (Object.keys(zmienne).length > MAKS_ZMIENNYCH) throw new BadRequestException(`Najwyżej ${MAKS_ZMIENNYCH} zmiennych.`);
    const zmienneEnc = Object.keys(zmienne).length ? this.crypto.encrypt(JSON.stringify(zmienne)) : null;
    await this.prisma.gitKonfiguracja.upsert({
      where: { accountId_domain_dir: { accountId: account.id, domain: domena, dir } },
      create: { accountId: account.id, domain: domena, dir, budowanie, zmienneEnc },
      update: { budowanie, zmienneEnc },
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_GIT_CONFIG_UPDATED,
      userId: sub.userId, actorUserId: userId,
      // same nazwy — wartości (klucze API, hasła) nie trafiają do dziennika
      details: { subscriptionId, domain: domena, dir, budowanie, zmienne: Object.keys(zmienne).sort() },
    });
    return this.opis(account.id, domena);
  }

  /** Dla zadania clone/pull: sposób budowania i zmienne jako base64 linii .env (payload.envSecret znika po zadaniu). */
  private async dodatkiWdrozenia(
    accountId: string,
    domain: string,
    dir: string,
  ): Promise<{ build: string; envMode?: 'panel'; envSecret?: string }> {
    const k = await this.prisma.gitKonfiguracja.findUnique({ where: { accountId_domain_dir: { accountId, domain, dir } } });
    if (!k) return { build: '' };
    const zmienne = k.zmienneEnc ? this.odszyfruj(k.zmienneEnc) : {};
    const plik = plikEnv(zmienne);
    // envMode=panel: .env tej konfiguracji należy do panelu — pusta lista usuwa plik z nagłówkiem panelu (nie własny .env klienta)
    return { build: k.budowanie, envMode: 'panel', ...(plik ? { envSecret: Buffer.from(plik, 'utf8').toString('base64') } : {}) };
  }

  private odszyfruj(enc: string): Record<string, string> {
    const j = JSON.parse(this.crypto.decrypt(enc)) as unknown;
    return j && typeof j === 'object' && !Array.isArray(j) ? (j as Record<string, string>) : {};
  }

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
        payload: {
          mode: 'pull', daUser: hook.account.daUsername, domain: hook.domain, dir: hook.dir, url: '', branch: '', webhook: true,
          ...(await this.dodatkiWdrozenia(hook.accountId, hook.domain, hook.dir)),
        },
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
        payload: {
          mode: tryb, daUser: account.daUsername, domain: domena, dir, url: tryb === 'clone' ? url : '', branch: tryb === 'clone' ? branch : '',
          ...(tryb === 'key' ? {} : await this.dodatkiWdrozenia(account.id, domena, dir)),
        },
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
    const p = (z: (typeof zadania)[number]) => (z.payload ?? {}) as { mode?: string; domain?: string; dir?: string; url?: string; build?: string };
    const klucz = zadania
      .filter((z) => z.status === NodeTaskStatus.COMPLETED && p(z).mode === 'key')
      .map((z) => /^VERRIS_GIT_KLUCZ=(ssh-ed25519 [A-Za-z0-9+/=]+ [^\s|]{1,300})\s*$/m.exec(z.outputLog ?? '')?.[1] ?? null)
      .find(Boolean) ?? null;
    const operacje = zadania
      .filter((z) => p(z).mode !== 'key' && p(z).domain === domena)
      .slice(0, 5)
      .map((z) => ({ z, w: wynikWdrozenia(z.status, p(z).build ?? '', z.outputLog) }))
      .map(({ z, w }) => ({
        id: z.id,
        tryb: p(z).mode ?? null,
        katalog: p(z).dir ?? '',
        adres: p(z).url || null,
        status: z.status,
        utworzone: z.createdAt.toISOString(),
        webhook: (z.payload as { webhook?: boolean } | null)?.webhook === true,
        head: /^VERRIS_GIT_HEAD=(.{1,200})$/m.exec(z.outputLog ?? '')?.[1]?.trim() ?? null,
        kopia: /^VERRIS_GIT_KOPIA=(domains\/[^\s|]{1,300})\s*$/m.exec(z.outputLog ?? '')?.[1] ?? null,
        blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : w.uwaga,
        budowanie: w.budowanie,
        zmienne: w.zmienne,
        trwaloS: z.startedAt && z.completedAt ? Math.max(0, Math.round((z.completedAt.getTime() - z.startedAt.getTime()) / 1000)) : null,
        log: z.outputLog ? z.outputLog.slice(-LOG_OGON) : null,
      }));
    const konfiguracje = await this.prisma.gitKonfiguracja.findMany({ where: { accountId, domain: domena }, orderBy: { dir: 'asc' } });
    const webhooki = await this.prisma.gitWebhook.findMany({ where: { accountId, domain: domena }, orderBy: { createdAt: 'asc' } });
    return {
      domena,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      klucz,
      webhooki: webhooki.map((w) => ({ katalog: w.dir, utworzony: w.createdAt.toISOString(), ostatnio: w.lastUsedAt?.toISOString() ?? null })),
      konfiguracje: konfiguracje.map((k) => ({
        katalog: k.dir,
        budowanie: k.budowanie as PresetBudowania,
        zmienne: k.zmienneEnc ? Object.keys(this.odszyfruj(k.zmienneEnc)).sort() : [],
        zmieniono: k.updatedAt.toISOString(),
      })),
      operacje,
    };
  }

  private async wymagajDomeny(subscriptionId: string, userId: string, domain: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Nie znaleziono usługi.');
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

/**
 * Linie .env. Wartość bez znaków specjalnych — wprost; inaczej w apostrofach (dosłownie, bez rozwijania ${…} w
 * dotenv dla PHP i Node); z apostrofem w środku — w cudzysłowie z escapowaniem \ i ".
 */
export function plikEnv(zmienne: Record<string, string>): string {
  return Object.keys(zmienne)
    .sort()
    .map((k) => {
      const v = zmienne[k];
      if (/^[A-Za-z0-9_./:@+,-]*$/.test(v)) return `${k}=${v}`;
      if (!v.includes("'")) return `${k}='${v}'`;
      return `${k}="${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
    })
    .join('\n');
}

/** Wynik budowania i liczba zmiennych z logu skryptu (VERRIS_GIT_BUILD / VERRIS_GIT_ENV). */
export function wynikWdrozenia(status: NodeTaskStatus, build: string, log: string | null) {
  const l = log ?? '';
  const znacznik = /^VERRIS_GIT_BUILD=(ok|blad|brak)\s*$/m.exec(l)?.[1] as 'ok' | 'blad' | 'brak' | undefined;
  const env = /^VERRIS_GIT_ENV=(\d+|brak)\s*$/m.exec(l)?.[1];
  const zmienne = env && env !== 'brak' ? Number(env) : null;
  // Zlecone budowanie, a skrypt sprzed 21.10 go nie zna: zadanie „udane”, ale nic się nie zbudowało — mówimy to wprost.
  if (build && status === NodeTaskStatus.COMPLETED && !znacznik) {
    return { budowanie: 'blad' as const, zmienne, uwaga: 'Serwer nie obsługuje jeszcze budowania ani zmiennych — napisz do nas, zaktualizujemy go.' };
  }
  return { budowanie: znacznik ?? (status === NodeTaskStatus.COMPLETED ? ('brak' as const) : null), zmienne, uwaga: null };
}

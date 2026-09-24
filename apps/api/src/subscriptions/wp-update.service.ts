import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * I-04 / I-05 — aktualizacje WordPressa w katalogu głównym domeny.
 * Robi to węzeł (zadanie WP_UPDATE, `ops/scripts/node-wp-update.sh`) jako KLIENT:
 *
 *   check  → wersja rdzenia, dostępne aktualizacje, wtyczki i motywy
 *   update → kopia plików i bazy w ~/backups, aktualizacja wp-cli, kontrola strony;
 *            gdy strona po aktualizacji zwraca 5xx — przywrócenie kopii
 *
 * Automatyczne aktualizacje (I-04): ustawienia w `WpAutoUpdate`, zlecane raz na dobę
 * przez WpAutoUpdateScheduler (`zlecAutomatyczne`).
 */
export const ZAKRESY_RDZENIA = ['none', 'minor', 'all'] as const;
export type ZakresRdzenia = (typeof ZAKRESY_RDZENIA)[number];

const SLUG_RE = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const MAKS_POZYCJI = 200;
/** Automat nie zleca ponownie wcześniej niż po tylu godzinach (odporne na restart planisty). */
const ODSTEP_AUTOMATU_H = 20;

export type PozycjaWp = {
  name: string;
  title: string;
  status: string;
  version: string;
  update: string;
  update_version: string;
};
export type StanWp = {
  version: string;
  core: Array<{ version: string; update_type: string }>;
  plugins: PozycjaWp[];
  themes: PozycjaWp[];
};

type Wybor = '*' | string[];
type ZadanieCache = 'on' | 'off' | 'purge' | 'redis-on' | 'redis-off';

const OPERACJE_ZABEZPIECZEN = ['file-edit', 'debug-off', 'maintenance-on', 'maintenance-off'] as const;
type OperacjaZabezpieczen = (typeof OPERACJE_ZABEZPIECZEN)[number];

@Injectable()
export class WpUpdateService {
  private readonly logger = new Logger(WpUpdateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string) {
    const { account, domena } = await this.wymagajDomeny(subscriptionId, userId, domain);
    return this.opis(account.id, domena);
  }

  async sprawdz(subscriptionId: string, userId: string, domain: string) {
    const { account, domena } = await this.wymagajDomeny(subscriptionId, userId, domain);
    await this.zlec(account, userId, { mode: 'check', domain: domena, core: 'none', plugins: '', themes: '', auto: false });
    return this.opis(account.id, domena);
  }

  async aktualizuj(
    subscriptionId: string,
    userId: string,
    input: { domain: string; core: string; plugins: Wybor; themes: Wybor },
  ) {
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const core = sprawdzZakres(input.core);
    const plugins = sprawdzWybor(input.plugins, 'wtyczek');
    const themes = sprawdzWybor(input.themes, 'motywów');
    if (core === 'none' && !plugins && !themes) throw new BadRequestException('Wybierz, co zaktualizować.');
    const task = await this.zlec(account, userId, { mode: 'update', domain: domena, core, plugins, themes, auto: false });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_WP_UPDATE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, domain: domena, core, plugins, themes, taskId: task.id },
    });
    return this.opis(account.id, domena);
  }

  /** J-02 — wtyczka LiteSpeed Cache: włącz (z kontrolą strony), wyłącz, wyczyść cache. */
  async cache(subscriptionId: string, userId: string, input: { domain: string; action: string }) {
    if (!['on', 'off', 'purge', 'redis-on', 'redis-off'].includes(input.action)) throw new BadRequestException('Nieprawidłowa operacja.');
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const task = await this.zlec(account, userId, {
      mode: 'cache', domain: domena, core: 'none', plugins: '', themes: '', auto: false, cache: input.action as ZadanieCache,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_WP_CACHE_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, domain: domena, cache: input.action, taskId: task.id },
    });
    return this.opis(account.id, domena);
  }

  /** I-08 — poprawki zabezpieczeń w wp-config.php (edytor plików w kokpicie, WP_DEBUG). */
  async zabezpiecz(subscriptionId: string, userId: string, input: { domain: string; action: string }) {
    if (!OPERACJE_ZABEZPIECZEN.includes(input.action as OperacjaZabezpieczen)) throw new BadRequestException('Nieprawidłowa operacja.');
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const task = await this.zlec(account, userId, {
      mode: 'harden', domain: domena, core: 'none', plugins: '', themes: '', auto: false, harden: input.action as OperacjaZabezpieczen,
    });
    await this.audit.record({
      action: HostingResourceActions.HOSTING_WP_HARDEN_QUEUED,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, domain: domena, harden: input.action, taskId: task.id },
    });
    return this.opis(account.id, domena);
  }

  async ustawAutomat(
    subscriptionId: string,
    userId: string,
    input: { domain: string; core: string; plugins: boolean; themes: boolean },
  ) {
    const { sub, account, domena } = await this.wymagajDomeny(subscriptionId, userId, input.domain);
    const core = sprawdzZakres(input.core);
    const klucz = { accountId_domain: { accountId: account.id, domain: domena } };
    if (core === 'none' && !input.plugins && !input.themes) {
      await this.prisma.wpAutoUpdate.deleteMany({ where: { accountId: account.id, domain: domena } });
    } else {
      await this.prisma.wpAutoUpdate.upsert({
        where: klucz,
        create: { accountId: account.id, domain: domena, core, plugins: input.plugins, themes: input.themes },
        update: { core, plugins: input.plugins, themes: input.themes },
      });
    }
    await this.audit.record({
      action: HostingResourceActions.HOSTING_WP_AUTO_UPDATE_SET,
      userId: sub.userId, actorUserId: userId,
      details: { subscriptionId, domain: domena, core, plugins: input.plugins, themes: input.themes },
    });
    return this.opis(account.id, domena);
  }

  /** Planista: zleca zaległe automatyczne aktualizacje. Zwraca liczbę zleconych zadań. */
  async zlecAutomatyczne(teraz = new Date()): Promise<number> {
    const granica = new Date(teraz.getTime() - ODSTEP_AUTOMATU_H * 3600_000);
    const ustawienia = await this.prisma.wpAutoUpdate.findMany({
      where: { OR: [{ lastRunAt: null }, { lastRunAt: { lt: granica } }], account: { status: 'ACTIVE' } },
      include: { account: true },
      take: 500,
    });
    let zlecone = 0;
    for (const u of ustawienia) {
      const core = (ZAKRESY_RDZENIA as readonly string[]).includes(u.core) ? (u.core as ZakresRdzenia) : 'none';
      if (core === 'none' && !u.plugins && !u.themes) continue;
      try {
        await this.zlec(u.account, null, {
          mode: 'update', domain: u.domain, core, plugins: u.plugins ? '*' : '', themes: u.themes ? '*' : '', auto: true,
        });
        zlecone += 1;
      } catch (err) {
        // zajęte konto (inne zadanie w toku) — spróbujemy przy następnym przebiegu
        if (!(err instanceof ConflictException)) this.logger.warn(`WP auto-update ${u.domain}: ${(err as Error).message}`);
        continue;
      }
      await this.prisma.wpAutoUpdate.update({ where: { id: u.id }, data: { lastRunAt: teraz } });
    }
    return zlecone;
  }

  private async zlec(
    account: { id: string; serverId: string; status: string; daUsername: string | null },
    actorUserId: string | null,
    payload: {
      mode: 'check' | 'update' | 'cache' | 'harden';
      domain: string;
      core: ZakresRdzenia;
      plugins: string;
      themes: string;
      auto: boolean;
      cache?: ZadanieCache;
      harden?: OperacjaZabezpieczen;
    },
  ) {
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.WP_UPDATE, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Operacja na WordPressie jest już w toku — poczekaj na wynik.');
    return this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.WP_UPDATE,
        status: NodeTaskStatus.QUEUED,
        requestedById: actorUserId,
        payload: { ...payload, daUser: account.daUsername },
      },
    });
  }

  private async opis(accountId: string, domena: string) {
    const [zadania, automat] = await Promise.all([
      this.prisma.nodeTask.findMany({
        where: { accountId, kind: NodeTaskKind.WP_UPDATE, payload: { path: ['domain'], equals: domena } },
        orderBy: { createdAt: 'desc' },
        take: 15,
      }),
      this.prisma.wpAutoUpdate.findUnique({ where: { accountId_domain: { accountId, domain: domena } } }),
    ]);
    const p = (z: (typeof zadania)[number]) =>
      (z.payload ?? {}) as { mode?: string; core?: string; plugins?: string; themes?: string; auto?: boolean; cache?: string };
    // Najświeższy znany stan: z ostatniego zakończonego zadania, które go zgłosiło.
    let stan: StanWp | null = null;
    let sprawdzono: string | null = null;
    let brak = false;
    for (const z of zadania) {
      if (z.status !== NodeTaskStatus.COMPLETED && z.status !== NodeTaskStatus.FAILED) continue;
      if (z.status === NodeTaskStatus.COMPLETED && /^VERRIS_WP_BRAK=1\s*$/m.test(z.outputLog ?? '')) {
        brak = true;
        sprawdzono = (z.completedAt ?? z.createdAt).toISOString();
        break;
      }
      const s = stanZLogu(z.outputLog, 'PO') ?? stanZLogu(z.outputLog, 'PRZED');
      if (s) {
        stan = s;
        sprawdzono = (z.completedAt ?? z.createdAt).toISOString();
        break;
      }
    }
    const zabezpieczenia =
      zadania.map((z) => (z.status === NodeTaskStatus.COMPLETED ? zabezpieczeniaZLogu(z.outputLog) : null)).find(Boolean) ?? null;
    return {
      domena,
      zabezpieczenia,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      brakWordpressa: brak,
      stan,
      sprawdzono,
      automat: automat
        ? { core: automat.core, plugins: automat.plugins, themes: automat.themes, ostatnio: automat.lastRunAt?.toISOString() ?? null }
        : null,
      cache: zadania
        .filter((z) => p(z).mode === 'cache')
        .slice(0, 3)
        .map((z) => ({
          id: z.id,
          akcja: p(z).cache ?? null,
          status: z.status,
          utworzone: z.createdAt.toISOString(),
          wycofano: /^VERRIS_WPU_WYCOFANO=1\s*$/m.test(z.outputLog ?? ''),
          blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : null,
        })),
      aktualizacje: zadania
        .filter((z) => p(z).mode === 'update')
        .slice(0, 5)
        .map((z) => ({
          id: z.id,
          status: z.status,
          automatyczna: p(z).auto === true,
          utworzone: z.createdAt.toISOString(),
          zakres: { core: p(z).core ?? 'none', plugins: p(z).plugins ?? '', themes: p(z).themes ?? '' },
          zmiany: z.status === NodeTaskStatus.COMPLETED ? zmiany(stanZLogu(z.outputLog, 'PRZED'), stanZLogu(z.outputLog, 'PO')) : [],
          kopia: kopiaZLogu(z.outputLog),
          wycofano: /^VERRIS_WPU_WYCOFANO=1\s*$/m.test(z.outputLog ?? ''),
          blad: z.status === NodeTaskStatus.FAILED ? bladZLogu(z.outputLog) : null,
        })),
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

function sprawdzZakres(core: string): ZakresRdzenia {
  if (!(ZAKRESY_RDZENIA as readonly string[]).includes(core)) throw new BadRequestException('Nieprawidłowy zakres aktualizacji rdzenia.');
  return core as ZakresRdzenia;
}

/** '*' = wszystkie z dostępną aktualizacją; lista slugów → „a,b,c”; pusta → brak. */
export function sprawdzWybor(w: Wybor, co: string): string {
  if (w === '*') return '*';
  if (!Array.isArray(w)) throw new BadRequestException(`Nieprawidłowa lista ${co}.`);
  const lista = [...new Set(w.map((s) => String(s).trim()))].filter(Boolean);
  if (lista.length > MAKS_POZYCJI || lista.some((s) => !SLUG_RE.test(s))) throw new BadRequestException(`Nieprawidłowa lista ${co}.`);
  return lista.join(',');
}

const tekst = (v: unknown, maks = 200) => (typeof v === 'string' ? v.slice(0, maks) : '');

function pozycje(v: unknown): PozycjaWp[] {
  if (!Array.isArray(v)) return [];
  return v.slice(0, 500).map((x: Record<string, unknown>) => ({
    name: tekst(x?.name, 100),
    title: tekst(x?.title),
    status: tekst(x?.status, 40),
    version: tekst(x?.version, 40),
    update: tekst(x?.update, 40),
    update_version: tekst(x?.update_version, 40),
  }));
}

export function stanZLogu(log: string | null, ktory: 'PRZED' | 'PO'): StanWp | null {
  const m = new RegExp(`^VERRIS_WP_${ktory}=([A-Za-z0-9+/=]+)\\s*$`, 'm').exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as Record<string, unknown>;
    return {
      version: tekst(j.version, 40),
      core: Array.isArray(j.core)
        ? j.core.slice(0, 10).map((c: Record<string, unknown>) => ({ version: tekst(c?.version, 40), update_type: tekst(c?.update_type, 20) }))
        : [],
      plugins: pozycje(j.plugins),
      themes: pozycje(j.themes),
    };
  } catch {
    return null;
  }
}

/** Co się zmieniło: rdzeń, wtyczki i motywy z inną wersją po aktualizacji. */
export function zmiany(przed: StanWp | null, po: StanWp | null): Array<{ typ: 'core' | 'plugin' | 'theme'; nazwa: string; z: string; na: string }> {
  if (!przed || !po) return [];
  const out: Array<{ typ: 'core' | 'plugin' | 'theme'; nazwa: string; z: string; na: string }> = [];
  if (przed.version !== po.version) out.push({ typ: 'core', nazwa: 'WordPress', z: przed.version, na: po.version });
  for (const [typ, a, b] of [['plugin', przed.plugins, po.plugins], ['theme', przed.themes, po.themes]] as const) {
    const stare = new Map(a.map((x) => [x.name, x]));
    for (const x of b) {
      const s = stare.get(x.name);
      if (s && s.version !== x.version) out.push({ typ, nazwa: x.title || x.name, z: s.version, na: x.version });
    }
  }
  return out;
}

export type ZabezpieczeniaWp = {
  edytorPlikow: boolean;
  debug: boolean;
  uzytkownikAdmin: boolean;
  uprawnieniaConfig: string;
  sumyRdzenia: 'ok' | 'zmienione';
  konserwacja: boolean;
};

export function zabezpieczeniaZLogu(log: string | null): ZabezpieczeniaWp | null {
  const m = /^VERRIS_WP_ZABEZPIECZENIA=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as Record<string, unknown>;
    return {
      edytorPlikow: j.edytorPlikow === true,
      debug: j.debug === true,
      uzytkownikAdmin: j.uzytkownikAdmin === true,
      uprawnieniaConfig: typeof j.uprawnieniaConfig === 'string' && /^[0-7]{3,4}$/.test(j.uprawnieniaConfig) ? j.uprawnieniaConfig : '',
      sumyRdzenia: j.sumyRdzenia === 'ok' ? 'ok' : 'zmienione',
      konserwacja: j.konserwacja === true,
    };
  } catch {
    return null;
  }
}

function kopiaZLogu(log: string | null): string | null {
  const m = /^VERRIS_WPU_KOPIA=(verris-wp-[A-Za-z0-9.-]+\.tar\.gz)\s*$/m.exec(log ?? '');
  return m?.[1] ?? null;
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[wp-update] BŁĄD: '));
  return l ? l.slice('[wp-update] BŁĄD: '.length).slice(0, 500) : 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * B-08 / B-09 — aplikacje Node.js i Python konta przez CloudLinux Selector (`ops/scripts/node-app-selector.sh`,
 * zadanie APP_SELECTOR). Panel tworzy aplikację (katalog poza public_html, domena + ścieżka, wersja, plik
 * startowy, zmienne środowiskowe), zmienia ją, uruchamia/zatrzymuje/restartuje, instaluje zależności
 * (npm install / pip -r requirements.txt) i usuwa. Reguły wejścia są te same w API i w skrypcie.
 */
export type Interpreter = 'nodejs' | 'python';
export type AkcjaAplikacji = 'start' | 'stop' | 'restart' | 'destroy' | 'install';
export type AplikacjaKonta = {
  interpreter: Interpreter;
  root: string;
  version: string;
  domain: string;
  uri: string;
  startup: string;
  entry: string;
  status: 'started' | 'stopped';
  env: Record<string, string>;
};
export type DaneAplikacji = {
  interpreter: Interpreter;
  root: string;
  domain: string;
  uri: string;
  version: string;
  startup: string;
  entry?: string;
  env?: Record<string, string>;
};

const SEG = '[A-Za-z0-9][A-Za-z0-9._-]{0,63}';
const SCIEZKA_RE = new RegExp(`^${SEG}(/${SEG}){0,3}$`);
const WERSJA_RE = /^[0-9]{1,2}(\.[0-9]{1,2}){0,2}$/;
const ENTRY_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ZMIENNA_RE = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
const ZAKAZANE = /^(domains|public_html|mail|imap)(\/|$)|^\./;

export function sprawdzKatalog(root: string): string {
  const v = root.trim().replace(/^\/+|\/+$/g, '');
  if (!SCIEZKA_RE.test(v) || v.includes('..') || ZAKAZANE.test(v)) {
    throw new BadRequestException(
      'Katalog aplikacji to ścieżka w katalogu domowym poza public_html i domains/, np. apps/sklep-api (litery, cyfry, . _ -).',
    );
  }
  return v;
}

export function sprawdzDane(d: DaneAplikacji): Required<DaneAplikacji> {
  if (d.interpreter !== 'nodejs' && d.interpreter !== 'python') throw new BadRequestException('Wybierz Node.js albo Python.');
  const uri = (d.uri ?? '').trim().replace(/^\/+|\/+$/g, '');
  if (uri && (!SCIEZKA_RE.test(uri) || uri.includes('..'))) {
    throw new BadRequestException('Ścieżka pod domeną: puste = cała domena, albo np. api lub app/v1.');
  }
  if (!WERSJA_RE.test(d.version)) throw new BadRequestException('Wybierz wersję z listy.');
  const startup = d.startup.trim();
  if (!SCIEZKA_RE.test(startup) || startup.includes('..')) throw new BadRequestException('Plik startowy, np. app.js albo passenger_wsgi.py.');
  const entry = (d.entry ?? '').trim();
  if (entry && !ENTRY_RE.test(entry)) throw new BadRequestException('Obiekt aplikacji to nazwa w Pythonie, np. application.');
  const env = d.env ?? {};
  const wpisy = Object.entries(env);
  if (wpisy.length > 30) throw new BadRequestException('Najwyżej 30 zmiennych środowiskowych.');
  for (const [k, v] of wpisy) {
    if (!ZMIENNA_RE.test(k) || typeof v !== 'string' || v.length > 1000 || /[\x00-\x1f\x7f]/.test(v)) {
      throw new BadRequestException('Zmienna: nazwa z liter, cyfr i _ (np. DB_HOST), wartość do 1000 znaków w jednej linii.');
    }
  }
  return { interpreter: d.interpreter, root: sprawdzKatalog(d.root), domain: d.domain, uri, version: d.version, startup, entry, env };
}

@Injectable()
export class AppSelectorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string) {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    return this.opis(account.id);
  }

  async odswiez(subscriptionId: string, userId: string) {
    return this.zlec(subscriptionId, userId, { mode: 'list' });
  }

  async utworz(subscriptionId: string, userId: string, d: DaneAplikacji) {
    return this.zapisz(subscriptionId, userId, 'create', d);
  }

  async zmien(subscriptionId: string, userId: string, d: DaneAplikacji) {
    return this.zapisz(subscriptionId, userId, 'update', d);
  }

  async akcja(subscriptionId: string, userId: string, input: { interpreter: Interpreter; root: string; action: AkcjaAplikacji }) {
    if (!['start', 'stop', 'restart', 'destroy', 'install'].includes(input.action)) throw new BadRequestException('Nieznana akcja.');
    if (input.interpreter !== 'nodejs' && input.interpreter !== 'python') throw new BadRequestException('Wybierz Node.js albo Python.');
    return this.zlec(subscriptionId, userId, { mode: input.action, interpreter: input.interpreter, root: sprawdzKatalog(input.root) });
  }

  private async zapisz(subscriptionId: string, userId: string, mode: 'create' | 'update', d: DaneAplikacji) {
    const s = sprawdzDane(d);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, s.domain);
    return this.zlec(subscriptionId, userId, {
      mode,
      interpreter: s.interpreter,
      root: s.root,
      domain: domena,
      uri: s.uri,
      version: s.version,
      startup: s.startup,
      entry: s.interpreter === 'python' ? s.entry : '',
      envB64: Buffer.from(JSON.stringify(s.env)).toString('base64'),
    });
  }

  private async zlec(subscriptionId: string, userId: string, dane: Record<string, string>) {
    const { sub, account } = await this.wymagajKonta(subscriptionId, userId);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.APP_SELECTOR, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Poprzednia operacja na aplikacjach jest jeszcze w toku — poczekaj na wynik.');
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.APP_SELECTOR,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { ...dane, daUser: account.daUsername },
      },
    });
    if (dane.mode !== 'list') {
      const { envB64: _pominiete, ...bezSekretow } = dane;
      await this.audit.record({
        action: HostingResourceActions.HOSTING_APP_SELECTOR_QUEUED,
        userId: sub.userId,
        actorUserId: userId,
        details: { subscriptionId, ...bezSekretow, taskId: task.id },
      });
    }
    return this.opis(account.id);
  }

  private async opis(accountId: string) {
    const zadania = await this.prisma.nodeTask.findMany({
      where: { accountId, kind: NodeTaskKind.APP_SELECTOR },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && aplikacjeZLogu(z.outputLog));
    const ostatnie = zadania[0] ?? null;
    const stan = udane ? aplikacjeZLogu(udane.outputLog) : null;
    return {
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      aplikacje: stan?.apps ?? null,
      wersje: stan?.versions ?? { nodejs: [], python: [] },
      odczytano: udane ? (udane.completedAt ?? udane.createdAt).toISOString() : null,
      blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZLogu(ostatnie.outputLog) : null,
    };
  }

  private async wymagajKonta(subscriptionId: string, userId: string) {
    const sub = await this.prisma.subscription.findFirst({ where: { id: subscriptionId, userId }, include: { account: true } });
    if (!sub) throw new NotFoundException('Service not found');
    if (!sub.account) throw new BadRequestException('Usługa nie ma jeszcze konta hostingowego.');
    return { sub, account: sub.account };
  }
}

const napis = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

export function aplikacjeZLogu(log: string | null): { apps: AplikacjaKonta[]; versions: Record<Interpreter, string[]> } | null {
  const m = /^VERRIS_APPS=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { apps?: unknown; versions?: Record<string, unknown> };
    const wersje = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === 'string' && WERSJA_RE.test(v)) : []);
    const apps = (Array.isArray(j.apps) ? j.apps : []).flatMap((a: Record<string, unknown>) => {
      if (a?.interpreter !== 'nodejs' && a?.interpreter !== 'python') return [];
      const env: Record<string, string> = {};
      for (const [k, v] of Object.entries((a.env ?? {}) as Record<string, unknown>).slice(0, 30)) {
        if (ZMIENNA_RE.test(k)) env[k] = napis(v, 1000);
      }
      return [{
        interpreter: a.interpreter as Interpreter,
        root: napis(a.root, 200),
        version: napis(a.version, 16),
        domain: napis(a.domain, 253),
        uri: napis(a.uri, 200),
        startup: napis(a.startup, 200),
        entry: napis(a.entry, 64),
        status: a.status === 'started' ? ('started' as const) : ('stopped' as const),
        env,
      }];
    });
    return { apps, versions: { nodejs: wersje(j.versions?.nodejs), python: wersje(j.versions?.python) } };
  } catch {
    return null;
  }
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[app-selector] BŁĄD: '));
  return l ? l.slice('[app-selector] BŁĄD: '.length).slice(0, 300) : 'Operacja nie powiodła się. Napisz do nas — sprawdzimy to.';
}

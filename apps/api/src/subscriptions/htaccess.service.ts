import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { NodeTaskKind, NodeTaskStatus } from '@verris/database';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../common/audit/audit.service';
import { HostingResourceActions } from '../common/audit/audit.actions';
import { DirectAdminService } from '../servers/directadmin.service';

/**
 * B-17 / B-18 / G-07 — ustawienia strony w .htaccess (`ops/scripts/node-htaccess.sh`, zadanie
 * HTACCESS): własne strony błędów 403/404/500, listowanie katalogów, HSTS. Panel zmienia tylko swój
 * blok „# BEGIN Verris”; po zapisie skrypt sprawdza stronę i przy 5xx przywraca poprzedni plik.
 */
export type UstawieniaHtaccess = { indexes: 'on' | 'off' | 'default'; hsts: boolean; e403: string; e404: string; e500: string };

/** B-03 — katalog względem public_html (pusty = public_html) i wersja PHP katalogu („8.3” → "83"). */
const KATALOG_RE = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+){0,9}$/;
export function sprawdzKatalog(k: string): string {
  const v = k.trim().replace(/^\/+|\/+$/g, '');
  if (!v) return '';
  if (!KATALOG_RE.test(v) || v.split('/').some((c) => c === '.' || c === '..')) {
    throw new BadRequestException('Katalog to ścieżka w public_html, np. sklep albo blog/stary — litery, cyfry, . _ - /.');
  }
  return v;
}

const SCIEZKA_RE = /^\/[A-Za-z0-9._~-][A-Za-z0-9._~/-]{0,199}$/;
const poprawna = (v: string) => SCIEZKA_RE.test(v) && !v.includes('..') && !v.includes('//');

export function sprawdzSciezke(s: string): string {
  const v = s.trim();
  if (!v) return '';
  if (!poprawna(v)) {
    throw new BadRequestException('Strona błędu to ścieżka w witrynie, np. /404.html — litery, cyfry, . _ - / bez spacji.');
  }
  return v;
}

@Injectable()
export class HtaccessService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly directAdmin: DirectAdminService,
  ) {}

  async status(subscriptionId: string, userId: string, domain: string, katalog = '') {
    const { account } = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    return this.opis(account.id, domena, sprawdzKatalog(katalog));
  }

  async odczytaj(subscriptionId: string, userId: string, domain: string, katalog = '') {
    const k = sprawdzKatalog(katalog);
    return this.zlec(subscriptionId, userId, domain, k ? { mode: 'read', dir: k } : { mode: 'read' });
  }

  /**
   * B-03 — wersja PHP podkatalogu (LiteSpeed + CloudLinux alt-php, handler w .htaccess katalogu). W bloku
   * Verris podkatalogu jest wyłącznie wersja PHP; pusta wersja = katalog wraca do wersji domeny.
   */
  async phpKatalogu(subscriptionId: string, userId: string, input: { domain: string; katalog: string; php: string }) {
    const katalog = sprawdzKatalog(input.katalog);
    if (!katalog) throw new BadRequestException('Podaj podkatalog — wersję PHP całej domeny zmieniasz wyżej.');
    const m = /^([5-8])\.(\d)$/.exec(input.php.trim());
    if (input.php.trim() && !m) throw new BadRequestException('Nieprawidłowa wersja PHP.');
    return this.zlec(subscriptionId, userId, input.domain, {
      mode: 'write', dir: katalog, php: m ? `${m[1]}${m[2]}` : '',
      indexes: 'default', hsts: '0', e403: '', e404: '', e500: '',
    });
  }

  async zapisz(subscriptionId: string, userId: string, input: { domain: string } & UstawieniaHtaccess) {
    if (!['on', 'off', 'default'].includes(input.indexes)) throw new BadRequestException('Nieprawidłowe ustawienie listowania katalogów.');
    return this.zlec(subscriptionId, userId, input.domain, {
      mode: 'write',
      indexes: input.indexes,
      hsts: input.hsts ? '1' : '0',
      e403: sprawdzSciezke(input.e403),
      e404: sprawdzSciezke(input.e404),
      e500: sprawdzSciezke(input.e500),
    });
  }

  private async zlec(subscriptionId: string, userId: string, domain: string, dane: Record<string, string>) {
    const { sub, account } = await this.wymagajKonta(subscriptionId, userId);
    const domena = await this.directAdmin.assertDomainOwnedBySubscription(subscriptionId, userId, domain);
    if (account.status !== 'ACTIVE') throw new BadRequestException('Konto hostingowe nie jest aktywne.');
    const wToku = await this.prisma.nodeTask.findFirst({
      where: { accountId: account.id, kind: NodeTaskKind.HTACCESS, status: { in: [NodeTaskStatus.QUEUED, NodeTaskStatus.RUNNING] } },
    });
    if (wToku) throw new ConflictException('Zmiana ustawień strony jest już w toku — poczekaj na wynik.');
    const task = await this.prisma.nodeTask.create({
      data: {
        serverId: account.serverId,
        accountId: account.id,
        kind: NodeTaskKind.HTACCESS,
        status: NodeTaskStatus.QUEUED,
        requestedById: userId,
        payload: { ...dane, daUser: account.daUsername, domain: domena },
      },
    });
    if (dane.mode === 'write') {
      await this.audit.record({
        action: HostingResourceActions.HOSTING_HTACCESS_QUEUED,
        userId: sub.userId, actorUserId: userId,
        details: { subscriptionId, domain: domena, ...dane, taskId: task.id },
      });
    }
    return this.opis(account.id, domena, dane.dir ?? '');
  }

  private async opis(accountId: string, domena: string, katalog = '') {
    const zadania = (
      await this.prisma.nodeTask.findMany({
        where: { accountId, kind: NodeTaskKind.HTACCESS, payload: { path: ['domain'], equals: domena } },
        orderBy: { createdAt: 'desc' },
        take: 30,
      })
    )
      .filter((z) => ((z.payload as { dir?: string } | null)?.dir ?? '') === katalog)
      .slice(0, 5);
    const udane = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && ustawieniaZLogu(z.outputLog));
    const ostatnie = zadania[0] ?? null;
    return {
      domena,
      katalog,
      php: udane ? phpZLogu(udane.outputLog) : null,
      wToku: zadania.some((z) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING),
      ustawienia: udane ? ustawieniaZLogu(udane.outputLog) : null,
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

export function ustawieniaZLogu(log: string | null): UstawieniaHtaccess | null {
  const m = /^VERRIS_HTACCESS=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return null;
  try {
    const j = JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as Record<string, unknown>;
    const sc = (v: unknown) => (typeof v === 'string' && poprawna(v) ? v : '');
    return {
      indexes: j.indexes === 'on' || j.indexes === 'off' ? j.indexes : 'default',
      hsts: j.hsts === true,
      e403: sc(j.e403),
      e404: sc(j.e404),
      e500: sc(j.e500),
    };
  } catch {
    return null;
  }
}

/** B-03 — wersja PHP katalogu z wyniku skryptu: "83" → "8.3", brak → "". */
export function phpZLogu(log: string | null): string {
  const m = /^VERRIS_HTACCESS=([A-Za-z0-9+/=]+)\s*$/m.exec(log ?? '');
  if (!m) return '';
  try {
    const v = (JSON.parse(Buffer.from(m[1], 'base64').toString('utf8')) as { php?: unknown }).php;
    return typeof v === 'string' && /^[5-8]\d$/.test(v) ? `${v[0]}.${v[1]}` : '';
  } catch {
    return '';
  }
}

function bladZLogu(log: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.startsWith('[htaccess] BŁĄD: '));
  return l ? l.slice('[htaccess] BŁĄD: '.length).slice(0, 300) : 'Zmiana nie powiodła się. Napisz do nas — sprawdzimy to.';
}

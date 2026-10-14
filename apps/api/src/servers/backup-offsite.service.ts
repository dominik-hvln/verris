import { BadRequestException, Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { KOPIE_OFFSITE_DNI, retencjaOffsiteDni } from '@verris/contracts';
import { NodeTasksService } from './node-tasks.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { CryptoService } from '../common/crypto/crypto.service.js';
import { AuditService } from '../common/audit/audit.service.js';

/**
 * PB-31 — kopie off-site floty skonfigurowane RAZ w panelu (zamiast `rclone config` na każdym
 * węźle). H-16: te same hasła crypt i ten sam remote dla całej floty — inaczej konta z utraconego
 * węzła nie da się odtworzyć na innym. Całość zaszyfrowana (AES-256-GCM, APP_KMS_KEY) jednym wpisem
 * w platform_settings; na węzeł trafia przez kanał agenta (tożsamość węzła), z wpisem w audycie.
 *
 * Backend: Hetzner Storage Box przez SFTP (rclone „sftp”, port 23), na nim rclone „crypt”
 * (password + password2 — dokumentacja rclone crypt: bez tej samej soli danych nie odczytasz).
 */
const KLUCZ = 'backup.offsiteEnc';
/**
 * Audyt 13.10 (#11): wspólny zestaw dla floty oznaczał, że root JEDNEGO węzła czyta, odszyfrowuje i kasuje kopie
 * WSZYSTKICH węzłów. Węzeł z własnym wpisem (subkonto Storage Boxa ograniczone do jego katalogu + własne hasła crypt)
 * dostaje tylko ten wpis. Węzeł bez wpisu dostaje wspólny zestaw, dopóki admin nie włączy „tylko per węzeł” —
 * okres przejściowy dla t1/t2, każdy taki odczyt w audycie jako BACKUP_OFFSITE_SHARED_READ_BY_NODE.
 */
const kluczWezla = (serverId: string) => `backup.offsiteEnc.wezel.${serverId}`;
const KLUCZ_TYLKO_PER_WEZEL = 'backup.offsiteTylkoPerWezel';

export interface OffsiteWezla {
  host: string;
  port: number;
  /** Subkonto do zapisu kopii tego węzła (katalog bazowy = katalog węzła). */
  user: string;
  pass: string;
  /** Ścieżka względem katalogu subkonta (zwykle pusta — subkonto widzi tylko swój katalog). */
  sciezka: string;
  cryptPass: string;
  cryptSalt: string;
  /** Subkonto TYLKO DO ODCZYTU tego samego katalogu — dla odtworzenia konta na innym węźle (H-16). */
  roUser?: string;
  roPass?: string;
  /** Kiedy węzeł pierwszy raz pobrał własne dane (od tej chwili jego nowe kopie są pod własnym kluczem). */
  pobranoAt?: string;
}

export type PodgladOffsiteWezla =
  | { wlasne: false; tylkoPerWezel: boolean }
  | { wlasne: true; tylkoPerWezel: boolean; host: string; port: number; user: string; sciezka: string; roUser: string | null; zmienionoAt: string };

export interface KonfiguracjaOffsite {
  host: string;
  port: number;
  user: string;
  pass: string;
  sciezka: string;
  cryptPass: string;
  cryptSalt: string;
  retencjaDni: number;
}

export type PodgladOffsite =
  | { skonfigurowany: false }
  | { skonfigurowany: true; host: string; port: number; user: string; sciezka: string; retencjaDni: number; zmienionoAt: string | null };

@Injectable()
export class BackupOffsiteService {
  private readonly logger = new Logger(BackupOffsiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    @Optional() private readonly tasks?: NodeTasksService,
  ) {}

  private async wczytaj(): Promise<{ k: KonfiguracjaOffsite; at: Date } | null> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ } });
    if (!w?.value) return null;
    try {
      return { k: JSON.parse(this.crypto.decrypt(w.value)) as KonfiguracjaOffsite, at: w.updatedAt };
    } catch {
      return null;
    }
  }

  async podglad(): Promise<PodgladOffsite> {
    const w = await this.wczytaj();
    if (!w) return { skonfigurowany: false };
    const { host, port, user, sciezka, retencjaDni } = w.k;
    return { skonfigurowany: true, host, port, user, sciezka, retencjaDni, zmienionoAt: w.at.toISOString() };
  }

  /** Puste hasła = zostaw obecne (formularz nie odsyła sekretów). */
  async zapisz(
    dane: Omit<KonfiguracjaOffsite, 'pass' | 'cryptPass' | 'cryptSalt'> & { pass?: string; cryptPass?: string; cryptSalt?: string },
    actorUserId: string,
  ): Promise<PodgladOffsite> {
    const stare = (await this.wczytaj())?.k;
    const k: KonfiguracjaOffsite = {
      host: dane.host.trim(),
      port: dane.port,
      user: dane.user.trim(),
      sciezka: dane.sciezka.trim().replace(/^\/+|\/+$/g, ''),
      retencjaDni: dane.retencjaDni,
      pass: dane.pass?.trim() || stare?.pass || '',
      cryptPass: dane.cryptPass?.trim() || stare?.cryptPass || '',
      cryptSalt: dane.cryptSalt?.trim() || stare?.cryptSalt || '',
    };
    if (!k.pass || !k.cryptPass || !k.cryptSalt) {
      throw new BadRequestException('Podaj hasło do Storage Boxa oraz hasło i sól szyfrowania (przy pierwszym zapisie wszystkie trzy).');
    }
    if (stare && (stare.cryptPass !== k.cryptPass || stare.cryptSalt !== k.cryptSalt)) {
      // Zmiana haseł crypt odcina dostęp do wcześniejszych kopii — tylko świadomie, z audytem.
      await this.audit.record({ action: 'BACKUP_OFFSITE_CRYPT_CHANGED', actorUserId, details: { host: k.host } });
    }
    const value = this.crypto.encrypt(JSON.stringify(k));
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ },
      create: { key: KLUCZ, value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: 'BACKUP_OFFSITE_UPDATED',
      actorUserId,
      details: { host: k.host, port: k.port, user: k.user, sciezka: k.sciezka, retencjaDni: k.retencjaDni },
    });
    // PB-31 — zatwierdzone węzły, które czekały tylko na kopie, od razu dostają Onboard LIVE.
    if (!stare && this.tasks) {
      const czekajace = await this.prisma.server.findMany({
        where: { status: 'ACTIVE', onboardVerifiedAt: null, identityToken: { not: null } },
        select: { id: true },
      });
      for (const s of czekajace) {
        await this.tasks.queueOnboardLive(s.id, actorUserId).catch((e) => this.logger.warn(`Onboard ${s.id}: ${(e as Error).message}`));
      }
    }
    return this.podglad();
  }

  private async wczytajWezla(serverId: string): Promise<{ k: OffsiteWezla; at: Date } | null> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: kluczWezla(serverId) } });
    if (!w?.value) return null;
    try {
      return { k: JSON.parse(this.crypto.decrypt(w.value)) as OffsiteWezla, at: w.updatedAt };
    } catch {
      return null;
    }
  }

  private async tylkoPerWezel(): Promise<boolean> {
    const w = await this.prisma.platformSetting.findUnique({ where: { key: KLUCZ_TYLKO_PER_WEZEL } });
    return w?.value === '1';
  }

  async podgladWezla(serverId: string): Promise<PodgladOffsiteWezla> {
    const tylko = await this.tylkoPerWezel();
    const w = await this.wczytajWezla(serverId);
    if (!w) return { wlasne: false, tylkoPerWezel: tylko };
    const { host, port, user, sciezka, roUser } = w.k;
    return { wlasne: true, tylkoPerWezel: tylko, host, port, user, sciezka, roUser: roUser ?? null, zmienionoAt: w.at.toISOString() };
  }

  /** Puste hasła = zostaw obecne (formularz nie odsyła sekretów). Hasła crypt przy pierwszym zapisie obowiązkowe. */
  async zapiszWezla(
    serverId: string,
    dane: Omit<OffsiteWezla, 'pass' | 'cryptPass' | 'cryptSalt' | 'roPass'> & { pass?: string; cryptPass?: string; cryptSalt?: string; roPass?: string },
    actorUserId: string,
  ): Promise<PodgladOffsiteWezla> {
    const wezel = await this.prisma.server.findUnique({ where: { id: serverId }, select: { id: true } });
    if (!wezel) throw new NotFoundException('Nie znaleziono węzła.');
    const stare = (await this.wczytajWezla(serverId))?.k;
    const roUser = dane.roUser?.trim() || undefined;
    const k: OffsiteWezla = {
      host: dane.host.trim(),
      port: dane.port,
      user: dane.user.trim(),
      sciezka: (dane.sciezka ?? '').trim().replace(/^\/+|\/+$/g, ''),
      pass: dane.pass?.trim() || stare?.pass || '',
      cryptPass: dane.cryptPass?.trim() || stare?.cryptPass || '',
      cryptSalt: dane.cryptSalt?.trim() || stare?.cryptSalt || '',
      roUser,
      roPass: roUser ? dane.roPass?.trim() || (stare?.roUser === roUser ? stare?.roPass : undefined) || undefined : undefined,
    };
    // Węzeł przechodzi na nowe dane dopiero po ich pobraniu — do tego czasu kopie źródła czytamy jak dotąd.
    const tenSamZapis = stare && stare.user === k.user && stare.pass === k.pass && stare.cryptPass === k.cryptPass && stare.cryptSalt === k.cryptSalt && stare.sciezka === k.sciezka && stare.host === k.host;
    if (tenSamZapis && stare?.pobranoAt) k.pobranoAt = stare.pobranoAt;
    if (!k.pass || !k.cryptPass || !k.cryptSalt) {
      throw new BadRequestException('Podaj hasło subkonta oraz hasło i sól szyfrowania tego węzła (przy pierwszym zapisie wszystkie trzy).');
    }
    if (k.roUser && !k.roPass) throw new BadRequestException('Podaj hasło subkonta tylko do odczytu.');
    const glob = (await this.wczytaj())?.k;
    if (glob && glob.cryptPass === k.cryptPass) {
      throw new BadRequestException('Hasło szyfrowania węzła musi być inne niż wspólne hasło floty — inaczej klucz jednego węzła nadal otwiera kopie innych.');
    }
    if (stare && (stare.cryptPass !== k.cryptPass || stare.cryptSalt !== k.cryptSalt)) {
      await this.audit.record({ action: 'BACKUP_OFFSITE_CRYPT_CHANGED', actorUserId, details: { serverId, host: k.host } });
    }
    const value = this.crypto.encrypt(JSON.stringify(k));
    await this.prisma.platformSetting.upsert({
      where: { key: kluczWezla(serverId) },
      create: { key: kluczWezla(serverId), value, updatedByUserId: actorUserId },
      update: { value, updatedByUserId: actorUserId },
    });
    await this.audit.record({
      action: 'BACKUP_OFFSITE_NODE_UPDATED',
      actorUserId,
      details: { serverId, host: k.host, port: k.port, user: k.user, sciezka: k.sciezka, roUser: k.roUser ?? null },
    });
    return this.podgladWezla(serverId);
  }

  /** Po przeniesieniu wszystkich węzłów na własne wpisy admin odcina wspólny zestaw (węzeł bez wpisu = 404). */
  async ustawTylkoPerWezel(wlacz: boolean, actorUserId: string): Promise<{ tylkoPerWezel: boolean }> {
    await this.prisma.platformSetting.upsert({
      where: { key: KLUCZ_TYLKO_PER_WEZEL },
      create: { key: KLUCZ_TYLKO_PER_WEZEL, value: wlacz ? '1' : '0', updatedByUserId: actorUserId },
      update: { value: wlacz ? '1' : '0', updatedByUserId: actorUserId },
    });
    await this.audit.record({ action: 'BACKUP_OFFSITE_PER_NODE_ONLY', actorUserId, details: { wlacz } });
    return { tylkoPerWezel: wlacz };
  }

  /**
   * H-16 — dane TYLKO DO ODCZYTU kopii węzła źródłowego dla zadania odtworzenia na innym węźle.
   * - źródło na własnych danych, które węzeł już pobrał (`pobranoAt`): subkonto RO + crypt źródła;
   * - źródło jeszcze na wspólnym zestawie (albo zapisane własne, ale węzeł ich nie pobrał — kopie leżą nadal pod
   *   wspólnym kluczem; przegląd 15.10): wspólny zestaw floty, dopóki „tylko per węzeł” jest wyłączone;
   * - `null`: nie ma czego wydać.
   */
  async daneOdczytuZrodla(sourceServerId: string): Promise<{ rodzaj: 'wlasne' | 'wspolne'; k: OffsiteWezla } | null> {
    const w = await this.wczytajWezla(sourceServerId);
    if (w?.k.pobranoAt) {
      if (!w.k.roUser || !w.k.roPass) {
        throw new BadRequestException('Węzeł źródłowy nie ma subkonta tylko do odczytu w danych kopii off-site — uzupełnij je na karcie węzła.');
      }
      return { rodzaj: 'wlasne', k: { ...w.k, user: w.k.roUser, pass: w.k.roPass } };
    }
    const g = (await this.wczytaj())?.k;
    if (!g || (await this.tylkoPerWezel())) return null;
    return { rodzaj: 'wspolne', k: { host: g.host, port: g.port, user: g.user, pass: g.pass, sciezka: g.sciezka, cryptPass: g.cryptPass, cryptSalt: g.cryptSalt } };
  }

  /**
   * Czy odtworzenie na węźle `celServerId` potrzebuje danych źródła z control-plane: tak, gdy źródło ma własne dane
   * (cel ich nie zna) albo cel przeszedł na własne (jego remote nie widzi wspólnego klucza źródła).
   */
  async odtworzeniePotrzebujeDanychZrodla(sourceServerId: string, celServerId: string): Promise<boolean> {
    const [zrodlo, cel] = await Promise.all([this.wczytajWezla(sourceServerId), this.wczytajWezla(celServerId)]);
    if (zrodlo?.k.pobranoAt) {
      await this.daneOdczytuZrodla(sourceServerId); // brak subkonta RO → błąd od razu, przy zleceniu
      return true;
    }
    return Boolean(cel);
  }

  /**
   * Env dla zadania odtworzenia (H-16): dane do odczytu kopii źródła (zob. daneOdczytuZrodla). Tylko dla węzła, który
   * właśnie wykonuje to zadanie (OFFSITE_RESTORE w toku, zlecone z `zrodloServerId`) — inaczej 404. Odczyt w audycie.
   */
  async envDlaZadaniaOdtworzenia(taskId: string, celServerId: string): Promise<string> {
    const t = await this.prisma.nodeTask.findUnique({ where: { id: taskId }, select: { serverId: true, kind: true, status: true, payload: true } });
    const sourceServerId = (t?.payload as { zrodloServerId?: string } | null)?.zrodloServerId;
    if (!t || t.serverId !== celServerId || t.kind !== 'OFFSITE_RESTORE' || t.status !== 'RUNNING' || !sourceServerId) {
      throw new NotFoundException('Brak zadania odtworzenia w toku dla tego węzła.');
    }
    const d = await this.daneOdczytuZrodla(sourceServerId);
    if (!d) throw new NotFoundException('Brak danych kopii off-site węzła źródłowego.');
    await this.audit.record({ action: 'BACKUP_OFFSITE_SOURCE_READ_FOR_RESTORE', details: { sourceServerId, serverId: celServerId, taskId, rodzaj: d.rodzaj } });
    const q = (v: string | number) => `'${String(v).replace(/'/g, `'\\''`)}'`;
    const k = d.k;
    return [
      `SRC_HOST=${q(k.host)}`,
      `SRC_PORT=${q(k.port)}`,
      `SRC_USER=${q(k.user)}`,
      `SRC_PASS=${q(k.pass)}`,
      `SRC_PATH=${q(k.sciezka)}`,
      `SRC_CRYPT_PASS=${q(k.cryptPass)}`,
      `SRC_CRYPT_SALT=${q(k.cryptSalt)}`,
      '',
    ].join('\n');
  }

  /** Treść dla węzła (env, source-owalna). `null` = nieskonfigurowane (albo „tylko per węzeł” i brak wpisu). */
  async dlaWezla(serverId: string): Promise<string | null> {
    const q = (v: string | number) => `'${String(v).replace(/'/g, `'\\''`)}'`;
    const wlasne = await this.wczytajWezla(serverId);
    const w = await this.wczytaj();
    if (wlasne) {
      await this.audit.record({ action: 'BACKUP_OFFSITE_READ_BY_NODE', details: { serverId, wlasne: true } });
      if (!wlasne.k.pobranoAt) {
        const value = this.crypto.encrypt(JSON.stringify({ ...wlasne.k, pobranoAt: new Date().toISOString() }));
        await this.prisma.platformSetting.update({ where: { key: kluczWezla(serverId) }, data: { value } });
      }
      const k = wlasne.k;
      return [
        `VB_HOST=${q(k.host)}`,
        `VB_PORT=${q(k.port)}`,
        `VB_USER=${q(k.user)}`,
        `VB_PASS=${q(k.pass)}`,
        `VB_PATH=${q(k.sciezka)}`,
        `VB_CRYPT_PASS=${q(k.cryptPass)}`,
        `VB_CRYPT_SALT=${q(k.cryptSalt)}`,
        `VB_RETENTION_DAYS=${q(w?.k.retencjaDni ?? KOPIE_OFFSITE_DNI)}`,
        '',
      ].join('\n');
    }
    if (!w || (await this.tylkoPerWezel())) return null;
    await this.audit.record({ action: 'BACKUP_OFFSITE_SHARED_READ_BY_NODE', details: { serverId } });
    const k = w.k;
    return [
      `VB_HOST=${q(k.host)}`,
      `VB_PORT=${q(k.port)}`,
      `VB_USER=${q(k.user)}`,
      `VB_PASS=${q(k.pass)}`,
      `VB_PATH=${q(k.sciezka)}`,
      `VB_CRYPT_PASS=${q(k.cryptPass)}`,
      `VB_CRYPT_SALT=${q(k.cryptSalt)}`,
      `VB_RETENTION_DAYS=${q(k.retencjaDni)}`,
      '',
    ].join('\n');
  }

  /**
   * H-03 — retencja kopii poza serwerem per konto węzła, linia `<login> <dni>` (wybór klienta w granicach
   * planu, min. KOPIE_OFFSITE_DNI). node-offsite-backup.sh pobiera ją co noc przed przycinaniem wersji;
   * konto spoza listy (np. usunięte) dostaje RETENTION_DAYS floty.
   */
  async retencjaKontDlaWezla(serverId: string): Promise<string> {
    const konta = await this.prisma.account.findMany({
      where: { serverId, status: { not: 'DELETED' } },
      select: {
        daUsername: true,
        subscription: {
          select: {
            backupSchedule: { select: { offsiteRetentionDays: true } },
            plan: { select: { offsiteRetentionMaxDays: true } },
          },
        },
      },
      orderBy: { daUsername: 'asc' },
    });
    return konta
      .map((k) => {
        const s = k.subscription;
        return `${k.daUsername} ${retencjaOffsiteDni(s.backupSchedule?.offsiteRetentionDays, s.plan.offsiteRetentionMaxDays)}\n`;
      })
      .join('');
  }
}

import { AccountStatus } from '@verris/database';
import { KOPIA_KONTA_ALERT_DNI } from '@verris/contracts';
import type { PrismaService } from '../prisma/prisma.service.js';

/** F3.3 — stan kopii konta poza serwerem: reguły wspólne dla widoku „Kopie floty”, metryki i raportu węzła. */
const DOBA_MS = 24 * 60 * 60 * 1000;
/** Ten sam próg co pulpit i dzienny raport (ops-watchdog.scheduler.ts STALE_BACKUP_MS): przebieg węzła starszy = nieaktualny. */
export const PRZEBIEG_WEZLA_NIEAKTUALNY_MS = 36 * 60 * 60 * 1000;
const LOGIN = /^[a-z][a-z0-9]{0,15}$/;

/**
 * Harmonogram kopii poza serwerem — timer systemd z ops/scripts/node-offsite-backup.sh (OnCalendar 03:30,
 * RandomizedDelaySec 1800), ten sam na każdym węźle i nie w bazie, więc w panelu tylko do odczytu. Zgodność ze
 * skryptem pilnuje test/kopie-kont-raport.spec.ts.
 */
export const HARMONOGRAM_OFFSITE = { godzina: '03:30', rozrzutMin: 30, opis: 'codziennie o 03:30 (do 30 min później), czas serwera' } as const;

/** Konta, których kopię robi node-offsite-backup.sh (usertype=user — także zawieszone). */
export const STATUSY_Z_KOPIA: AccountStatus[] = [AccountStatus.ACTIVE, AccountStatus.SUSPENDED];

export type StanKopiiKonta = 'ok' | 'nowe' | 'nieudana' | 'przeterminowana' | 'brak';

/**
 * Stan ostatniej kopii konta poza serwerem:
 * - nieudana — ostatni przebieg nie skopiował konta (po udanej albo bez żadnej udanej),
 * - ok — udana kopia nie starsza niż KOPIA_KONTA_ALERT_DNI,
 * - nowe — konto młodsze niż próg i jeszcze bez kopii (pierwsza przy najbliższym przebiegu),
 * - brak — bez żadnej kopii, a konto starsze niż próg,
 * - przeterminowana — ostatnia udana starsza niż próg (węzeł nie raportuje albo nie robi kopii).
 */
export function stanKopiiKonta(
  k: { createdAt: Date; offsiteBackupOkAt: Date | null; offsiteBackupFailedAt: Date | null },
  teraz: number,
): StanKopiiKonta {
  const ok = k.offsiteBackupOkAt?.getTime() ?? null;
  const blad = k.offsiteBackupFailedAt?.getTime() ?? null;
  if (blad !== null && (ok === null || blad > ok)) return 'nieudana';
  const prog = KOPIA_KONTA_ALERT_DNI * DOBA_MS;
  if (ok !== null) return teraz - ok <= prog ? 'ok' : 'przeterminowana';
  return teraz - k.createdAt.getTime() <= prog ? 'nowe' : 'brak';
}

/** Konto bez świeżej kopii do metryki verris_backup_accounts_stale: starsze niż próg, bez udanej kopii w progu. */
export function warunekKontaBezSwiezejKopii(teraz: number) {
  const granica = new Date(teraz - KOPIA_KONTA_ALERT_DNI * DOBA_MS);
  return {
    status: { in: STATUSY_Z_KOPIA },
    createdAt: { lt: granica },
    OR: [{ offsiteBackupOkAt: null }, { offsiteBackupOkAt: { lt: granica } }],
  };
}

/** Pola z `lastOffsiteBackupInfo` („accounts=12 bytes=345 dur=60s …”) zapisanego przez node-backup.agent.controller.ts. */
export function przebiegZInfo(info: string | null | undefined) {
  const liczba = (klucz: string) => {
    const m = new RegExp(`(?:^| )${klucz}=(\\d+)`).exec(info ?? '');
    return m ? Number(m[1]) : null;
  };
  const reszta = (info ?? '').replace(/(?:^| )(?:accounts|bytes|dur)=\d+s?/g, '').trim();
  return { konta: liczba('accounts'), bajty: liczba('bytes'), czasS: liczba('dur'), opis: reszta.slice(0, 600) || null };
}

export interface KontoZRaportu {
  u: string;
  ok: boolean;
  b?: number;
}

/**
 * F3.3 — wynik kopii każdego konta z raportu przebiegu węzła. Tylko konta TEGO węzła (login + serverId), nieusunięte.
 * Udana: kiedy i rozmiar archiwum; nieudana: tylko kiedy — poprzednia udana zostaje (jej archiwum leży na zdalnym).
 */
export async function zapiszKopieKont(prisma: PrismaService, serverId: string, konta: KontoZRaportu[], kiedy: Date): Promise<number> {
  const poprawne = konta.filter((k) => LOGIN.test(k.u));
  if (!poprawne.length) return 0;
  const wyniki = await prisma.$transaction(
    poprawne.map((k) =>
      prisma.account.updateMany({
        where: { serverId, daUsername: k.u, status: { not: AccountStatus.DELETED } },
        data: k.ok
          ? { offsiteBackupOkAt: kiedy, offsiteBackupBytes: BigInt(Math.max(0, Math.trunc(k.b ?? 0))) }
          : { offsiteBackupFailedAt: kiedy },
      }),
    ),
  );
  return wyniki.reduce((s, w) => s + w.count, 0);
}


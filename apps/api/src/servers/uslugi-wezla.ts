import { NodeTaskStatus } from '@verris/database';
import { LOGI_WEZLA, USLUGI_WEZLA, logWezla, maskujAdresy, maskujSekrety, uslugaWezla } from '@verris/contracts';

/**
 * F3.4 — odczyt wyniku zadania NODE_SERVICES (ops/scripts/node-services.sh) i stan z ostatnich zadań węzła:
 * stan usług z białej listy, ostatni restart, ostatni odczyt logu. Maska adresów w logach poczty dla STAFF stosowana
 * także tutaj (wynik zamówiony przez ADMIN-a bez maski nie trafia do NOC).
 */

export type TrybUslug = 'status' | 'restart' | 'log';

export type StanUslugi = 'dziala' | 'stoi' | 'blad' | 'brak' | 'zmienia';

export interface UslugaZeStanem {
  klucz: string;
  etykieta: string;
  przerwa: boolean;
  restart: boolean;
  jednostka: string | null;
  stan: StanUslugi;
  activeState: string | null;
  subState: string | null;
  od: string | null;
  restarty: number | null;
}

const ISO = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/;
const POLE = /^[A-Za-z0-9_.:@-]{1,40}$/;

export function stanZActiveState(load: string | null, active: string | null): StanUslugi {
  if (load !== 'loaded') return 'brak';
  if (active === 'active') return 'dziala';
  if (active === 'failed') return 'blad';
  if (active === 'inactive') return 'stoi';
  return 'zmienia';
}

/** Wiersze VERRIS_SVC → usługi w kolejności białej listy (usługa bez wiersza — pominięta). */
export function uslugiZLogu(log: string | null): UslugaZeStanem[] {
  const wiersze = new Map<string, string[]>();
  for (const l of (log ?? '').split('\n')) {
    if (!l.startsWith('VERRIS_SVC ')) continue;
    const p = l.slice('VERRIS_SVC '.length).split('|');
    if (p.length !== 7 || !uslugaWezla(p[0])) continue;
    wiersze.set(p[0], p);
  }
  const out: UslugaZeStanem[] = [];
  for (const u of USLUGI_WEZLA) {
    const p = wiersze.get(u.klucz);
    if (!p) continue;
    const pole = (s: string) => (s !== '-' && POLE.test(s) ? s : null);
    const jednostka = p[1] !== '-' && u.jednostki.includes(p[1]) ? p[1] : null;
    out.push({
      klucz: u.klucz,
      etykieta: u.etykieta,
      przerwa: u.przerwa,
      restart: u.restart,
      jednostka,
      stan: jednostka ? stanZActiveState(pole(p[2]), pole(p[3])) : 'brak',
      activeState: pole(p[3]),
      subState: pole(p[4]),
      od: ISO.test(p[5]) ? p[5] : null,
      restarty: /^\d{1,9}$/.test(p[6]) ? Number(p[6]) : null,
    });
  }
  return out;
}

export interface WynikLogu {
  zrodlo: string | null;
  dopasowanych: number | null;
  pokazano: number | null;
  maska: boolean;
  linie: string[];
}

/** Wiersze VERRIS_LOG_ZRODLO / VERRIS_LOG. `maskuj` — wymuś maskę adresów (odczyt przez STAFF logu poczty). */
export function logZWyniku(log: string | null, maskuj: boolean): WynikLogu {
  const w: WynikLogu = { zrodlo: null, dopasowanych: null, pokazano: null, maska: false, linie: [] };
  for (const l of (log ?? '').split('\n')) {
    const z = /^VERRIS_LOG_ZRODLO [a-z0-9-]{1,40}\|([^|]{1,200})\|(\d+)\|(\d+)\|([01])$/.exec(l);
    if (z) {
      w.zrodlo = z[1];
      w.dopasowanych = Number(z[2]);
      w.pokazano = Number(z[3]);
      w.maska = z[4] === '1';
      continue;
    }
    if (l.startsWith('VERRIS_LOG ') && w.linie.length < 500) {
      const linia = maskujSekrety(l.slice('VERRIS_LOG '.length));
      w.linie.push(maskuj ? maskujAdresy(linia) : linia);
    }
  }
  if (maskuj) w.maska = true;
  return w;
}

export function bladUslug(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[services] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[services] BŁĄD: ') + '[services] BŁĄD: '.length).slice(0, 300);
  return (errorMessage ?? 'Zadanie na węźle nie powiodło się.').slice(0, 300);
}

export type ZadanieUslug = {
  id: string;
  status: NodeTaskStatus;
  payload: unknown;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

export type ParametryUslug = { mode?: TrybUslug; name?: string; onlyDown?: string; lines?: string; filter?: string; mask?: string };
export const parametryUslug = (z: Pick<ZadanieUslug, 'payload'>) => (z.payload ?? {}) as ParametryUslug;
export const trwa = (z: Pick<ZadanieUslug, 'status'>) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING;
const kiedy = (z: ZadanieUslug) => (z.completedAt ?? z.createdAt).toISOString();

/**
 * Stan z ostatnich zadań NODE_SERVICES węzła (najnowsze pierwsze). `admin` — czy czytający to ADMIN (bez maski adresów
 * w logach poczty, jeśli tak je zamówiono); STAFF zawsze widzi maskę, także w wyniku zamówionym przez ADMIN-a.
 */
export function stanUslug(zadania: ZadanieUslug[], admin: boolean) {
  const zTrybu = (t: TrybUslug) => zadania.filter((z) => (parametryUslug(z).mode ?? 'status') === t);
  const statusy = zTrybu('status');
  const ostatniStatus = statusy.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
  const restart = zTrybu('restart')[0] ?? null;
  const log = zTrybu('log')[0] ?? null;
  const p = restart ? parametryUslug(restart) : null;
  const pl = log ? parametryUslug(log) : null;
  const defLogu = pl ? logWezla(pl.name) : null;
  const zrestartu = restart && restart.status === NodeTaskStatus.COMPLETED ? uslugiZLogu(restart.outputLog)[0] ?? null : null;
  return {
    wToku: { status: statusy.some(trwa), restart: zTrybu('restart').some(trwa), log: zTrybu('log').some(trwa) },
    uslugi: ostatniStatus ? { kiedy: kiedy(ostatniStatus), lista: uslugiZLogu(ostatniStatus.outputLog) } : null,
    bladStanu: statusy[0]?.status === NodeTaskStatus.FAILED ? bladUslug(statusy[0].outputLog, statusy[0].errorMessage) : null,
    restart:
      restart && p
        ? {
            usluga: p.name ?? '',
            etykieta: uslugaWezla(p.name)?.etykieta ?? p.name ?? '',
            tylkoGdyStoi: p.onlyDown === '1',
            wToku: trwa(restart),
            kiedy: kiedy(restart),
            stanPo: zrestartu?.stan ?? null,
            blad: restart.status === NodeTaskStatus.FAILED ? bladUslug(restart.outputLog, restart.errorMessage) : null,
          }
        : null,
    log:
      log && pl
        ? {
            klucz: pl.name ?? '',
            etykieta: defLogu?.etykieta ?? pl.name ?? '',
            filtr: pl.filter ?? null,
            linieZamowione: Number(pl.lines) || null,
            wToku: trwa(log),
            kiedy: kiedy(log),
            ...(log.status === NodeTaskStatus.COMPLETED
              ? logZWyniku(log.outputLog, Boolean(defLogu?.poczta) && !admin)
              : { zrodlo: null, dopasowanych: null, pokazano: null, maska: Boolean(defLogu?.poczta) && (!admin || pl.mask !== '0'), linie: [] }),
            blad: log.status === NodeTaskStatus.FAILED ? bladUslug(log.outputLog, log.errorMessage) : null,
          }
        : null,
  };
}

export const KLUCZE_LOGOW = LOGI_WEZLA.map((l) => l.klucz);

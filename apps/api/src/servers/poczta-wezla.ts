import { NodeTaskStatus } from '@verris/database';
import { bladKolejki } from './kolejka-poczty.js';

/**
 * F3.1 (reszta) — odczyt wyników zadań węzła dla poczty:
 * - limit wysyłki konta: zadanie MAIL_QUEUE tryb `limit` (ops/scripts/node-mail-queue.sh), wiersz
 *   `VERRIS_MQ_LIMIT <login> <limit|domyslny|?> <domyślny|->`;
 * - najwięksi nadawcy i odrzucenia węzła: zadanie MAIL_LOG bez konta, tryb `stats` (ops/scripts/node-mail-log.sh),
 *   wiersze VERRIS_MS / VERRIS_MB / VERRIS_MS_OKNO — agregat bez adresów i treści.
 */

/** Najwyższy limit dobowy, jaki ustawi obsługa (ten sam sufit sprawdza skrypt węzła). */
export const LIMIT_WYSYLKI_MAX = 100_000;

export interface LimitNaWezle {
  login: string;
  /** null = konto bez własnego limitu (obowiązuje domyślny serwera); NaN nie wraca — nieczytelny plik to `nieczytelny`. */
  limit: number | null;
  nieczytelny: boolean;
  domyslny: number | null;
}

export function limitZLogu(log: string | null): LimitNaWezle | null {
  const m = /^VERRIS_MQ_LIMIT ([a-z][a-z0-9]{0,15}) (\d{1,9}|domyslny|\?) (\d{1,9}|-|\?)\s*$/m.exec(log ?? '');
  if (!m) return null;
  return {
    login: m[1],
    limit: /^\d+$/.test(m[2]) ? Number(m[2]) : null,
    nieczytelny: m[2] === '?',
    domyslny: /^\d+$/.test(m[3]) ? Number(m[3]) : null,
  };
}

export interface NadawcaWezla {
  domena: string;
  uzytkownik: string | null;
  wiadomosci: number;
  odrzucone: number;
  opoznione: number;
}

export interface OdrzucenieWezla {
  kod: string | null;
  serwer: string | null;
  liczba: number;
}

export function statystykiPocztyZLogu(log: string | null) {
  const nadawcy: NadawcaWezla[] = [];
  const odrzucenia: OdrzucenieWezla[] = [];
  let okno: { od: string | null; do: string | null; wiadomosci: number } | null = null;
  for (const l of (log ?? '').split('\n')) {
    let m = /^VERRIS_MS ([a-z0-9.()-]{1,253})\|([a-z][a-z0-9]{0,15}|-)\|(\d{1,9})\|(\d{1,9})\|(\d{1,9})\s*$/.exec(l);
    if (m && nadawcy.length < 30) {
      nadawcy.push({ domena: m[1], uzytkownik: m[2] === '-' ? null : m[2], wiadomosci: Number(m[3]), odrzucone: Number(m[4]), opoznione: Number(m[5]) });
      continue;
    }
    m = /^VERRIS_MB ([45]\d\d|-)\|([a-z0-9.-]{1,253}|-)\|(\d{1,9})\s*$/.exec(l);
    if (m && odrzucenia.length < 20) {
      odrzucenia.push({ kod: m[1] === '-' ? null : m[1], serwer: m[2] === '-' ? null : m[2], liczba: Number(m[3]) });
      continue;
    }
    m = /^VERRIS_MS_OKNO (\S+) (\S+) (\d{1,9})\s*$/.exec(l);
    if (m) okno = { od: m[1] === '-' ? null : m[1], do: m[2] === '-' ? null : m[2], wiadomosci: Number(m[3]) };
  }
  return { nadawcy, odrzucenia, okno };
}

type Zadanie = {
  status: NodeTaskStatus;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const trwa = (z: Zadanie) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING;

/** Błąd zadania z logu: wiersz „[mail-queue] BŁĄD:” albo „[mail-log] BŁĄD:”, inaczej komunikat agenta. */
export function bladZadaniaPoczty(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[mail-log] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[mail-log] BŁĄD: ') + '[mail-log] BŁĄD: '.length).slice(0, 300);
  return bladKolejki(log, errorMessage);
}

/** Stan z ostatnich zadań (najnowsze pierwsze): wynik ostatniego ukończonego, czy trwa, błąd ostatniego. */
export function stanZadan<T>(zadania: Zadanie[], wynik: (log: string | null) => T) {
  const ukonczone = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
  const ostatnie = zadania[0] ?? null;
  return {
    wToku: zadania.some(trwa),
    kiedy: ukonczone ? (ukonczone.completedAt ?? ukonczone.createdAt).toISOString() : null,
    wynik: ukonczone ? wynik(ukonczone.outputLog) : null,
    blad: ostatnie?.status === NodeTaskStatus.FAILED ? bladZadaniaPoczty(ostatnie.outputLog, ostatnie.errorMessage) : null,
  };
}

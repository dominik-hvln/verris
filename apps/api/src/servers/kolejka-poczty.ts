import { NodeTaskStatus } from '@verris/database';

/**
 * F3.1 — wspólne dla kolejki poczty konta i węzła (zadanie MAIL_QUEUE, ops/scripts/node-mail-queue.sh).
 * Identyfikator wiadomości wg Exima: od 4.97 23 znaki 6-11-4, wcześniej 16 znaków 6-6-2
 * (https://www.exim.org/exim-html-current/doc/html/spec_html/ch-how_exim_receives_and_delivers_mail.html,
 * „Message identification”). Ten sam wzorzec sprawdza skrypt na węźle.
 */
export const ID_WIADOMOSCI_EXIMA = /^(?:[0-9A-Za-z]{6}-[0-9A-Za-z]{11}-[0-9A-Za-z]{4}|[0-9A-Za-z]{6}-[0-9A-Za-z]{6}-[0-9A-Za-z]{2})$/;

/** Fraza wyszukiwania w kolejce: bez znaków sterujących (idzie przez env do Pythona na węźle, nie do powłoki). */
export const FRAZA_KOLEJKI = /^[^\x00-\x1f\x7f]{1,100}$/;

/** Tylko nagłówki — treści wiadomości API nie ma i nie zwraca. */
export interface WiadomoscWKolejce {
  id: string;
  wiek: string;
  rozmiar: string;
  zamrozona: boolean;
  nadawca: string;
  odbiorcy: string;
  temat: string;
}

export function wiadomosciZLogu(log: string | null): WiadomoscWKolejce[] {
  const out: WiadomoscWKolejce[] = [];
  for (const l of (log ?? '').split('\n')) {
    // Audyt Fal 2 — flaga u: długości w punktach kodowych, jak tnie skrypt (czysc); temat jako [^|], bo `.` nie łapie
    // U+2028/U+2029 — wiersz z takim tematem odpadał bez śladu i wiadomości nie dało się zaznaczyć do usunięcia.
    const m = /^VERRIS_MQ ([0-9A-Za-z-]{16,23})\|(\d+[smhdw])\|([0-9.]+[KMG]?)\|([01])\|([^|]{0,254})\|([^|]{0,254})\|([^|]{0,200})$/u.exec(l);
    if (m && ID_WIADOMOSCI_EXIMA.test(m[1]) && out.length < 300) {
      out.push({ id: m[1], wiek: m[2], rozmiar: m[3], zamrozona: m[4] === '1', nadawca: m[5], odbiorcy: m[6], temat: m[7] });
    }
  }
  return out;
}

const liczba = (log: string | null, znacznik: string): number | null => {
  const m = new RegExp(`^${znacznik} (\\d+)`, 'm').exec(log ?? '');
  return m ? Number(m[1]) : null;
};

export function podsumowanieKolejki(log: string | null) {
  const m = /^VERRIS_MQ_RAZEM (\d+) (\d+) (\d+) (\d+)/m.exec(log ?? '');
  return m ? { wKolejce: Number(m[1]), przeczytano: Number(m[2]), pasuje: Number(m[3]), pokazano: Number(m[4]) } : null;
}

export function wynikUsuwania(log: string | null) {
  return { usunieto: liczba(log, 'VERRIS_MQ_USUNIETO'), pominieto: liczba(log, 'VERRIS_MQ_POMINIETO') };
}

export function wynikWypchniecia(log: string | null) {
  return { przed: liczba(log, 'VERRIS_MQ_PRZED'), po: liczba(log, 'VERRIS_MQ_PO') };
}

export function bladKolejki(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[mail-queue] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[mail-queue] BŁĄD: ') + '[mail-queue] BŁĄD: '.length).slice(0, 300);
  return (errorMessage ?? 'Zadanie na węźle nie powiodło się.').slice(0, 300);
}

type Zadanie = {
  id: string;
  status: NodeTaskStatus;
  payload: unknown;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  completedAt: Date | null;
};

const tryb = (z: Zadanie) => (z.payload as { mode?: string } | null)?.mode;
const trwa = (z: Zadanie) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING;

/** Stan kolejki z ostatnich zadań MAIL_QUEUE (najnowsze pierwsze): ostatni podgląd, usunięcie i wypchnięcie. */
export function stanKolejki(zadania: Zadanie[]) {
  const listy = zadania.filter((z) => tryb(z) === 'list');
  const podglad = listy.find((z) => z.status === NodeTaskStatus.COMPLETED) ?? null;
  const ostatniPodglad = listy[0] ?? null;
  const usun = zadania.find((z) => tryb(z) === 'remove') ?? null;
  const wypchnij = zadania.find((z) => tryb(z) === 'flush') ?? null;
  const operacja = (z: Zadanie | null, wynik: (log: string | null) => Record<string, number | null>) =>
    z
      ? {
          wToku: trwa(z),
          kiedy: (z.completedAt ?? z.createdAt).toISOString(),
          // Liczby także przy błędzie: usunięcie przerwane w połowie podaje, ile już usunięto (nieodwracalne).
          ...(trwa(z) ? {} : wynik(z.outputLog)),
          blad: z.status === NodeTaskStatus.FAILED ? bladKolejki(z.outputLog, z.errorMessage) : null,
        }
      : null;
  return {
    wToku: listy.some(trwa),
    wczytano: podglad ? (podglad.completedAt ?? podglad.createdAt).toISOString() : null,
    szukaj: podglad ? ((podglad.payload as { szukaj?: string } | null)?.szukaj || null) : null,
    podsumowanie: podsumowanieKolejki(podglad?.outputLog ?? null),
    wiadomosci: wiadomosciZLogu(podglad?.outputLog ?? null),
    blad: ostatniPodglad?.status === NodeTaskStatus.FAILED ? bladKolejki(ostatniPodglad.outputLog, ostatniPodglad.errorMessage) : null,
    usuwanie: operacja(usun, wynikUsuwania),
    wypchniecie: operacja(wypchnij, wynikWypchniecia),
  };
}

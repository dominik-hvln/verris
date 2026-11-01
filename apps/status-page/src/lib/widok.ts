import type { DayDto, PublicIncidentDto, PublicServiceDto } from './api';
import { plForm } from './format';

/**
 * Logika widoku strony statusu (01.11, nowy wygląd: górna część z wariantu A, dół z wariantu B).
 * Czyste funkcje — bez Reacta, żeby dało się je przetestować bez renderowania.
 */

/** Klasa słupka dnia. „krotkie” = zakłócenie, które nie zabrało więcej niż ok. 5 minut doby. */
export type KlasaDnia = 'ok' | 'krotkie' | 'spowolnienie' | 'awaria' | 'prace' | 'brak';

/** 5 min z 1440 = 0,35% doby → dzień z dostępnością ≥ 99,65% to krótkie zakłócenie, nie awaria. */
export const PROG_KROTKIEGO_PCT = 99.65;
/** Zdarzenie do tylu minut nazywamy krótkim zakłóceniem. */
export const KROTKIE_MAKS_MIN = 5;
/** Zdarzenia w różnych usługach, które zaczęły się w tym oknie, to jedno zdarzenie (np. restart węzła). */
export const OKNO_GRUPOWANIA_MIN = 5;

export function klasaDnia(d: DayDto): KlasaDnia {
  switch (d.state) {
    case 'NO_DATA':
      return 'brak';
    case 'MAINTENANCE':
      return 'prace';
    case 'OK':
      return 'ok';
    default:
      if (d.uptimePct !== null && d.uptimePct >= PROG_KROTKIEGO_PCT) return 'krotkie';
      return d.state === 'DOWN' ? 'awaria' : 'spowolnienie';
  }
}

/**
 * Indeks pierwszego dnia z pomiarami w dowolnej usłudze (wszystkie usługi mają tę samą listę 90 dni).
 * Dni wcześniej to czas przed uruchomieniem sond — nie pokazujemy ich jako 64 szarych pól.
 */
export function poczatekPomiarow(services: PublicServiceDto[]): number {
  const dlugosc = Math.max(0, ...services.map((s) => s.days.length));
  for (let i = 0; i < dlugosc; i++) {
    if (services.some((s) => s.days[i] && s.days[i].state !== 'NO_DATA')) return i;
  }
  return Math.max(0, dlugosc - 1);
}

export type RodzajZdarzenia = 'krotkie' | 'spowolnienie' | 'awaria';

export interface GrupaZdarzen {
  id: string;
  start: string;
  koniec: string | null;
  trwa: boolean;
  minuty: number | null;
  rodzaj: RodzajZdarzenia;
  /** Usługi niedostępne (MAJOR) i wolniejsze (MINOR), w kolejności wystąpienia, bez powtórzeń. */
  niedostepne: string[];
  wolniejsze: string[];
  komunikaty: string[];
}

const ms = (iso: string) => new Date(iso).getTime();

/** Łączy zdarzenia, które zaczęły się w odstępie do OKNO_GRUPOWANIA_MIN od pierwszego w grupie. Najnowsze pierwsze. */
export function grupujZdarzenia(lista: PublicIncidentDto[], oknoMin = OKNO_GRUPOWANIA_MIN): GrupaZdarzen[] {
  const posortowane = [...lista].sort((a, b) => ms(a.startedAt) - ms(b.startedAt));
  const grupy: PublicIncidentDto[][] = [];
  for (const z of posortowane) {
    const ostatnia = grupy.at(-1);
    if (ostatnia && ms(z.startedAt) - ms(ostatnia[0].startedAt) <= oknoMin * 60_000) ostatnia.push(z);
    else grupy.push([z]);
  }
  return grupy.map(zbuduj).reverse();
}

function zbuduj(g: PublicIncidentDto[]): GrupaZdarzen {
  const trwa = g.some((z) => z.status === 'OPEN');
  const konce = g.map((z) => z.resolvedAt).filter((x): x is string => x !== null);
  const koniec = trwa || konce.length === 0 ? null : konce.reduce((a, b) => (ms(a) > ms(b) ? a : b));
  const start = g[0].startedAt;
  const minuty = koniec ? Math.max(1, Math.round((ms(koniec) - ms(start)) / 60_000)) : null;
  const unikalne = (xs: string[]) => [...new Set(xs)];
  const niedostepne = unikalne(g.filter((z) => z.severity === 'MAJOR').map((z) => z.service));
  const wolniejsze = unikalne(g.filter((z) => z.severity !== 'MAJOR').map((z) => z.service)).filter((s) => !niedostepne.includes(s));
  const rodzaj: RodzajZdarzenia =
    !trwa && minuty !== null && minuty <= KROTKIE_MAKS_MIN ? 'krotkie' : niedostepne.length ? 'awaria' : 'spowolnienie';
  return {
    id: g[0].id,
    start,
    koniec,
    trwa,
    minuty,
    rodzaj,
    niedostepne,
    wolniejsze,
    komunikaty: unikalne(g.map((z) => z.publicMessage).filter((m): m is string => !!m)),
  };
}

/** Tytuł zdarzenia w języku klienta: krótkie zakłócenie, awaria albo spowolnienie, z nazwami usług. */
export function tytulGrupy(g: GrupaZdarzen): string {
  const uslugi = [...g.niedostepne, ...g.wolniejsze];
  if (g.rodzaj === 'krotkie') {
    return uslugi.length > 1
      ? `Krótkie zakłócenie w ${uslugi.length} ${plForm(uslugi.length, 'usłudze', 'usługach', 'usługach')}`
      : `Krótkie zakłócenie: ${uslugi[0]}`;
  }
  if (g.rodzaj === 'awaria') return `${g.trwa ? 'Trwa awaria' : 'Awaria'}: ${g.niedostepne.join(', ')}`;
  return `${g.trwa ? 'Trwa spowolnienie' : 'Spowolnienie'}: ${uslugi.join(', ')}`;
}

/** Szczegóły pod tytułem: które usługi były niedostępne, a które działały wolniej. */
export function opisGrupy(g: GrupaZdarzen): string | null {
  const czesci = [
    g.niedostepne.length ? `Niedostępne: ${g.niedostepne.join(', ')}.` : null,
    g.wolniejsze.length ? `Wolniej: ${g.wolniejsze.join(', ')}.` : null,
  ].filter(Boolean);
  // Przy jednej usłudze tytuł mówi już wszystko.
  return g.niedostepne.length + g.wolniejsze.length > 1 ? czesci.join(' ') : null;
}

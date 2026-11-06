import type { DayDto, PublicIncidentDto, PublicMaintenanceDto, PublicServiceDto } from './api';
import { czasTrwania, dataKrotko, dataPelna, dodajDni, dzienKlucz, godzina, pct, plForm } from './format';

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

const ms = (iso: string) => new Date(iso).getTime();

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

/** Indeks pierwszego dnia z pomiarami usługi; `days.length`, gdy sondy jeszcze niczego nie zmierzyły. */
export function pierwszyPomiar(days: DayDto[]): number {
  const i = days.findIndex((d) => d.state !== 'NO_DATA');
  return i < 0 ? days.length : i;
}

/**
 * Indeks pierwszego dnia z pomiarami w dowolnej usłudze (wszystkie usługi mają tę samą listę 90 dni) — do nagłówka
 * „pomiary od …”. Pasek i tak pokazuje pełne 90 dni; dni wcześniej są oznaczone jako „przed uruchomieniem pomiarów”.
 */
export function poczatekPomiarow(services: PublicServiceDto[]): number {
  const dlugosc = Math.max(0, ...services.map((s) => s.days.length));
  return Math.min(dlugosc, ...services.map((s) => pierwszyPomiar(s.days)));
}

/** Stan dnia słownie (dymek, etykiety słupków, legenda). „przed” = dzień sprzed pierwszego pomiaru usługi. */
export const OPIS_KLASY: Record<KlasaDnia | 'przed', string> = {
  ok: 'działa',
  krotkie: 'krótkie zakłócenie',
  spowolnienie: 'spowolnienie',
  awaria: 'awaria',
  prace: 'planowane prace',
  brak: 'brak pomiarów',
  przed: 'przed uruchomieniem pomiarów',
};

export interface TrescDymka {
  data: string;
  klasa: KlasaDnia | 'przed';
  stan: string;
  szczegoly: string[];
}

/** Treść dymka dnia: pełna data, stan słownie, dostępność i średni czas odpowiedzi (albo wyjaśnienie braku). */
export function trescDymka(d: DayDto, przed: boolean): TrescDymka {
  const klasa = przed ? 'przed' : klasaDnia(d);
  const szczegoly =
    klasa === 'przed'
      ? ['Sondy jeszcze wtedy nie działały – dzień nie wchodzi do dostępności.']
      : klasa === 'brak'
        ? ['Brak próbek z tego dnia – dzień nie wchodzi do dostępności.']
        : [
            ...(d.uptimePct !== null ? [`Dostępność ${pct(d.uptimePct)}`] : []),
            ...(d.avgLatencyMs !== null ? [`Śr. czas odpowiedzi ${d.avgLatencyMs} ms`] : []),
          ];
  return { data: dataPelna(d.date), klasa, stan: OPIS_KLASY[klasa], szczegoly };
}

/** Roving tabindex paska dni: klawisz → nowy indeks (null = klawisz nie dotyczy paska). `min` = pierwszy widoczny dzień. */
export function nastepnyIndeks(klawisz: string, i: number, n: number, min = 0): number | null {
  switch (klawisz) {
    case 'ArrowLeft':
      return Math.max(min, i - 1);
    case 'ArrowRight':
      return Math.min(n - 1, i + 1);
    case 'Home':
      return min;
    case 'End':
      return n - 1;
    default:
      return null;
  }
}

/** Godziny zdarzenia w dymku dnia: „11:53”, „04:01–10:40” albo z datami, gdy przechodzi przez północ. */
function kiedy(start: string, koniec: string): string {
  if (dzienKlucz(start) !== dzienKlucz(koniec)) return `${dataKrotko(start)} ${godzina(start)} – ${dataKrotko(koniec)} ${godzina(koniec)}`;
  return godzina(start) === godzina(koniec) ? godzina(start) : `${godzina(start)}–${godzina(koniec)}`;
}

/** Ile zdarzeń pokazujemy w dymku jednego dnia — reszta jako „+ N kolejnych”. */
export const DYMEK_MAKS_ZDARZEN = 4;

/**
 * Zdarzenia usługi rozpisane na dni (czas polski) do dymka paska: incydenty z listy na stronie (trwające i ostatnie)
 * i prace, które już się zaczęły. Wpis trafia do każdego dnia, przez który zdarzenie trwało.
 * Lista ostatnich incydentów z API jest krótka — starsze dni pokazują sam stan, bez opisu zdarzeń.
 */
export function zdarzeniaDni(
  usluga: string,
  incydenty: PublicIncidentDto[],
  prace: PublicMaintenanceDto[],
  teraz: string,
): Record<string, string[]> {
  const wpisy: Array<{ start: string; koniec: string; tekst: string }> = [];
  for (const z of incydenty) {
    if (z.service !== usluga) continue;
    const koniec = z.resolvedAt ?? teraz;
    const minuty = z.resolvedAt ? (z.durationMinutes ?? Math.round((ms(z.resolvedAt) - ms(z.startedAt)) / 60_000)) : null;
    const rodzaj =
      minuty !== null && minuty <= KROTKIE_MAKS_MIN ? 'Krótkie zakłócenie' : z.severity === 'MAJOR' ? 'Awaria' : 'Spowolnienie';
    const czas = z.resolvedAt ? `${kiedy(z.startedAt, koniec)} · ${czasTrwania(minuty ?? 0)}` : `od ${kiedy(z.startedAt, z.startedAt)}, trwa`;
    wpisy.push({ start: z.startedAt, koniec, tekst: `${rodzaj} · ${czas}` });
  }
  for (const w of prace) {
    if (ms(w.scheduledStart) > ms(teraz)) continue; // zaplanowane na później — pasek kończy się na dziś
    const koniec = ms(w.scheduledEnd) < ms(teraz) ? w.scheduledEnd : teraz;
    wpisy.push({ start: w.scheduledStart, koniec, tekst: `Planowane prace: ${w.title} · ${kiedy(w.scheduledStart, w.scheduledEnd)}` });
  }
  wpisy.sort((a, b) => ms(a.start) - ms(b.start));

  const dni: Record<string, string[]> = {};
  for (const w of wpisy) {
    const ostatni = dzienKlucz(w.koniec);
    // Limit pętli: zdarzenie dłuższe niż okno paska i tak nie ma więcej dni do opisania.
    for (let d = dzienKlucz(w.start), i = 0; d <= ostatni && i < 100; d = dodajDni(d, 1), i++) (dni[d] ??= []).push(w.tekst);
  }
  for (const [d, lista] of Object.entries(dni)) {
    if (lista.length <= DYMEK_MAKS_ZDARZEN) continue;
    const reszta = lista.length - (DYMEK_MAKS_ZDARZEN - 1);
    dni[d] = [
      ...lista.slice(0, DYMEK_MAKS_ZDARZEN - 1),
      `+ ${reszta} ${plForm(reszta, 'kolejne zdarzenie', 'kolejne zdarzenia', 'kolejnych zdarzeń')}`,
    ];
  }
  return dni;
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

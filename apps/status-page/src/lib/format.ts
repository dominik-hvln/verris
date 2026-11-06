const TZ = 'Europe/Warsaw';

/** Polska odmiana liczebników (1 → one; końcówka 2–4 poza 12–14 → few; reszta → many). */
export function plForm(count: number, one: string, few: string, many: string): string {
  const n = Math.abs(count);
  const n10 = n % 10;
  const n100 = n % 100;
  if (n === 1) return one;
  if (n10 >= 2 && n10 <= 4 && (n100 < 12 || n100 > 14)) return few;
  return many;
}

/** 99,98% — API zwraca już wartość obciętą do 2 miejsc, więc nic tu nie zaokrągla w górę. */
export function pct(v: number | null): string {
  if (v === null) return '–';
  return `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

const MIESIACE_KROTKO = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'];
const MIESIACE_DOPELNIACZ = [
  'stycznia', 'lutego', 'marca', 'kwietnia', 'maja', 'czerwca',
  'lipca', 'sierpnia', 'września', 'października', 'listopada', 'grudnia',
];
const DNI_TYGODNIA = ['niedziela', 'poniedziałek', 'wtorek', 'środa', 'czwartek', 'piątek', 'sobota'];

/**
 * Daty kalendarzowe ('YYYY-MM-DD') składamy z własnych tabel, nie z Intl: te same napisy renderuje serwer
 * i przeglądarka (pasek dni jest komponentem klienckim — inny zestaw danych ICU nie rozjedzie hydratacji).
 */
const czesci = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return { y, m, d, dt: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
};

/** 'YYYY-MM-DD' → „7 paź”. */
export function dzienKrotko(date: string): string {
  const { m, d } = czesci(date);
  return `${d} ${MIESIACE_KROTKO[m - 1] ?? ''}`;
}

/** 'YYYY-MM-DD' → „środa, 8 października 2026”. */
export function dataPelna(date: string): string {
  const { y, m, d, dt } = czesci(date);
  return `${DNI_TYGODNIA[dt]}, ${d} ${MIESIACE_DOPELNIACZ[m - 1] ?? ''} ${y}`;
}

/** 'YYYY-MM-DD' przesunięte o `n` dni kalendarzowych (arytmetyka UTC — bez skoków przy zmianie czasu). */
export function dodajDni(date: string, n: number): string {
  const { y, m, d } = czesci(date);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export const godzina = (iso: string) =>
  new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const dataKrotko = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: TZ });

export const dzienTygodnia = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', timeZone: TZ });

/** ISO → dzień czasu polskiego 'YYYY-MM-DD' (te same granice dni co w API). */
export const dzienKlucz = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

/** „wt 04:00–04:20” w jednym dniu, „wt 7 paź 22:00 – śr 8 paź 02:00” między dniami. */
export function przedzial(startIso: string, endIso: string): string {
  if (dzienKlucz(startIso) === dzienKlucz(endIso)) {
    // Zakłócenie w obrębie jednej minuty: „11:53”, nie „11:53–11:53”.
    if (godzina(startIso) === godzina(endIso)) return `${dzienTygodnia(startIso)} ${dataKrotko(startIso)}, ${godzina(startIso)}`;
    return `${dzienTygodnia(startIso)} ${dataKrotko(startIso)}, ${godzina(startIso)}–${godzina(endIso)}`;
  }
  const pelna = (i: string) => `${dzienTygodnia(i)} ${dataKrotko(i)} ${godzina(i)}`;
  return `${pelna(startIso)} – ${pelna(endIso)}`;
}

/** 17 → „17 min”, 65 → „1 h 5 min”. */
export function czasTrwania(min: number): string {
  if (min < 60) return `${Math.max(min, 1)} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

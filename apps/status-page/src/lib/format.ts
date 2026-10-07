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
  if (v === null) return '—';
  return `${v.toLocaleString('pl-PL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}

/** 'YYYY-MM-DD' → „7 paź” (data kalendarzowa, bez przesunięć strefy). */
export function dzienKrotko(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

export const godzina = (iso: string) =>
  new Date(iso).toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: TZ });

export const dataKrotko = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short', timeZone: TZ });

export const dzienTygodnia = (iso: string) =>
  new Date(iso).toLocaleDateString('pl-PL', { weekday: 'short', timeZone: TZ });

const dzienKlucz = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: TZ });

/** „wt 04:00–04:20” w jednym dniu, „wt 7 paź 22:00 – śr 8 paź 02:00” między dniami. */
export function przedzial(startIso: string, endIso: string): string {
  if (dzienKlucz(startIso) === dzienKlucz(endIso)) {
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

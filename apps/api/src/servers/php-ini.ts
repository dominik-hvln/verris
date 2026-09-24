import { BadRequestException } from '@nestjs/common';

/**
 * B-05 — dyrektywy PHP, które klient ustawia z panelu (blok zarządzany w `.user.ini` domeny).
 * Tylko lista dozwolonych: każda inna dyrektywa z panelu to potencjalna zmiana zachowania PHP,
 * której nie umiemy opisać ani cofnąć (np. auto_prepend_file). Zakresy trzymają się rozsądku —
 * pamięć i tak ogranicza limit LVE konta, więc wyższe memory_limit niż RAM planu nic nie daje.
 */
export type UstawieniaPhp = Partial<Record<DyrektywaPhp, string>>;
export type DyrektywaPhp =
  | 'memory_limit'
  | 'upload_max_filesize'
  | 'post_max_size'
  | 'max_execution_time'
  | 'max_input_time'
  | 'max_input_vars'
  | 'display_errors'
  | 'date.timezone';

const MB = (min: number, max: number) => (v: string) => {
  const m = /^(\d{1,5})M$/.exec(v);
  return m !== null && Number(m[1]) >= min && Number(m[1]) <= max;
};
const LICZBA = (min: number, max: number, teżMinusJeden = false) => (v: string) =>
  (teżMinusJeden && v === '-1') || (/^\d{1,6}$/.test(v) && Number(v) >= min && Number(v) <= max);

export const DYREKTYWY_PHP: Record<DyrektywaPhp, { opis: string; poprawna: (v: string) => boolean }> = {
  memory_limit: { opis: 'od 32M do 2048M', poprawna: MB(32, 2048) },
  upload_max_filesize: { opis: 'od 2M do 1024M', poprawna: MB(2, 1024) },
  post_max_size: { opis: 'od 2M do 1024M', poprawna: MB(2, 1024) },
  max_execution_time: { opis: 'od 10 do 600 sekund', poprawna: LICZBA(10, 600) },
  max_input_time: { opis: '-1 albo od 10 do 600 sekund', poprawna: LICZBA(10, 600, true) },
  max_input_vars: { opis: 'od 1000 do 20000', poprawna: LICZBA(1000, 20000) },
  display_errors: { opis: 'On albo Off', poprawna: (v) => v === 'On' || v === 'Off' },
  'date.timezone': { opis: 'strefa czasowa IANA, np. Europe/Warsaw', poprawna: (v) => STREFY.has(v) },
};

const STREFY = new Set(Intl.supportedValuesOf('timeZone').concat('UTC'));

/** Normalizuje (wielkość liter w jednostce, spacje) i sprawdza. Puste pola pomijamy — PHP użyje domyślnej. */
export function sprawdzUstawieniaPhp(wejscie: Record<string, unknown>): UstawieniaPhp {
  const wynik: UstawieniaPhp = {};
  for (const [klucz, surowa] of Object.entries(wejscie ?? {})) {
    if (!(klucz in DYREKTYWY_PHP)) throw new BadRequestException(`Dyrektywa ${klucz} nie jest dostępna z panelu.`);
    if (surowa === undefined || surowa === null || String(surowa).trim() === '') continue;
    let v = String(surowa).trim();
    if (/^\d+m$/.test(v)) v = v.toUpperCase();
    if (klucz === 'display_errors') v = /^(on|1|true)$/i.test(v) ? 'On' : /^(off|0|false)$/i.test(v) ? 'Off' : v;
    const d = DYREKTYWY_PHP[klucz as DyrektywaPhp];
    if (!d.poprawna(v)) throw new BadRequestException(`${klucz}: ${d.opis}.`);
    wynik[klucz as DyrektywaPhp] = v;
  }
  const mb = (x?: string) => (x ? Number(x.slice(0, -1)) : undefined);
  const upload = mb(wynik.upload_max_filesize);
  const post = mb(wynik.post_max_size);
  if (upload !== undefined && post !== undefined && post < upload) {
    throw new BadRequestException('post_max_size musi być co najmniej równe upload_max_filesize — inaczej wysyłka dużego pliku się nie powiedzie.');
  }
  return wynik;
}

/** Wartości z bloku panelu + liczba własnych linii klienta poza blokiem (do informacji w panelu). */
export function odczytajUserIni(tresc: string, znaczniki: { begin: string; end: string }) {
  const b = tresc.indexOf(znaczniki.begin);
  const e = b === -1 ? -1 : tresc.indexOf(znaczniki.end, b);
  const blok = b !== -1 && e !== -1 ? tresc.slice(b + znaczniki.begin.length, e) : '';
  const poza = b !== -1 && e !== -1 ? tresc.slice(0, b) + tresc.slice(e + znaczniki.end.length) : tresc;
  const values: UstawieniaPhp = {};
  for (const linia of blok.split('\n')) {
    const m = /^\s*([a-z_.]+)\s*=\s*(.*?)\s*$/.exec(linia);
    if (m && m[1] in DYREKTYWY_PHP) values[m[1] as DyrektywaPhp] = m[2];
  }
  const wlasne = poza.split('\n').filter((l) => l.trim() && !l.trim().startsWith(';')).length;
  return { values, wlasneDyrektywy: wlasne };
}

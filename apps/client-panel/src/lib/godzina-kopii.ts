/**
 * Harmonogram kopii: klient wybiera godzinę i dzień w czasie polskim, a API zapisuje i uruchamia je w UTC
 * (`backup-schedule.service.ts` porównuje z `getUTCHours()` / `getUTCDay()`). Przesunięcie bierzemy z chwili
 * zapisu i odczytu (zimą +1, latem +2), więc po zmianie czasu odczyt pokaże godzinę, o której kopia faktycznie
 * startuje.
 */
export type Termin = { hour: number; dayOfWeek: number };

const TYDZIEN_H = 7 * 24;

/** Różnica czasu polskiego względem UTC w godzinach (1 albo 2). */
export function przesuniecieWarszawy(chwila: Date): number {
  const godzinaPl = Number(
    new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Warsaw', hour: '2-digit', hourCycle: 'h23' }).format(chwila),
  );
  return (godzinaPl - chwila.getUTCHours() + 24) % 24;
}

function przesun(t: Termin, godziny: number): Termin {
  const h = (((t.dayOfWeek * 24 + t.hour + godziny) % TYDZIEN_H) + TYDZIEN_H) % TYDZIEN_H;
  return { hour: h % 24, dayOfWeek: Math.floor(h / 24) };
}

export function terminDoUtc(polski: Termin, chwila: Date = new Date()): Termin {
  return przesun(polski, -przesuniecieWarszawy(chwila));
}

export function terminZUtc(utc: Termin, chwila: Date = new Date()): Termin {
  return przesun(utc, przesuniecieWarszawy(chwila));
}

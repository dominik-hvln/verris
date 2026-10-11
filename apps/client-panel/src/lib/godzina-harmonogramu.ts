/**
 * Weryfikacja 11.10 — harmonogram kopii zapisuje godzinę w UTC (cron węzła), a panel pokazywał „Godzina (UTC) 03:00”
 * obok „Ostatni automatyczny backup: … 05:00:00” (czas polski). Klient wybiera godzinę w czasie polskim; wartością
 * zostaje godzina UTC. Przesunięcie liczone na dany dzień (zimą +1 h, latem +2 h) — po zmianie czasu kopia
 * przesuwa się o godzinę względem zegara w Polsce, jak każdy cron w UTC.
 */
export function godzinaPolska(godzinaUtc: number, dzien: Date = new Date()): number {
  const d = new Date(Date.UTC(dzien.getUTCFullYear(), dzien.getUTCMonth(), dzien.getUTCDate(), godzinaUtc));
  return Number(new Intl.DateTimeFormat('en-GB', { hour: '2-digit', hourCycle: 'h23', timeZone: 'Europe/Warsaw' }).format(d));
}

/** Opcje listy: wartość = godzina UTC, etykieta = ta sama chwila w czasie polskim; posortowane po czasie polskim. */
export function opcjeGodzinyHarmonogramu(dzien: Date = new Date()): { value: string; label: string }[] {
  return Array.from({ length: 24 }, (_, h) => ({ h, pl: godzinaPolska(h, dzien) }))
    .sort((a, b) => a.pl - b.pl)
    .map(({ h, pl }) => ({ value: String(h), label: `${String(pl).padStart(2, '0')}:00` }));
}

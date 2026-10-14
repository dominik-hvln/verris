'use client';

import { useState } from 'react';

/**
 * Pokaz przeprowadzki (makieta 14.10, plansza Migracja): przełącznik 6 kroków i makieta ekranu kreatora.
 * Tylko ilustracja — opis kroków jest renderowany na serwerze obok (lista KROKI_PRZEPROWADZKI), więc bez JS
 * strona nic nie traci (widać pierwszy ekran). Dane przykładowe, bez portów i nazw serwerów Verris.
 */
const EKRANY: { podpis: string; wiersze: [string, string][] }[] = [
  {
    podpis: 'Domena docelowa — z Twojego konta',
    wiersze: [
      ['sklep-ogrodowy.pl', '✓ domena konta'],
      ['blog.sklep-ogrodowy.pl', ''],
      ['Stary adres strony', 'jeśli był inny'],
    ],
  },
  {
    podpis: 'Sprawdziliśmy domenę w DNS',
    wiersze: [
      ['Strona stoi na', 'serwer.stary-hosting.pl'],
      ['Poczta (MX)', 'mx.stary-hosting.pl'],
      ['Podpowiedź adresu panelu', 'popraw, jeśli jest inny'],
    ],
  },
  {
    podpis: 'Dostęp do starego hostingu',
    wiersze: [
      ['Rodzaj', 'cPanel · DirectAdmin · Plesk · FTP'],
      ['Login', 'sklepogr'],
      ['Hasło', '••••••••••'],
      ['Test dostępów', '✓ działa'],
    ],
  },
  {
    podpis: 'Znaleźliśmy na starym koncie',
    wiersze: [
      ['☑ Strona sklep-ogrodowy.pl', 'WordPress'],
      ['☑ Baza sklepogr_wp', 'dane z wp-config.php'],
      ['☑ biuro@sklep-ogrodowy.pl', 'wpisz hasło skrzynki'],
      ['☐ Baza sklepogr_stara', 'pomijamy'],
    ],
  },
  {
    podpis: 'Postęp przeprowadzki',
    wiersze: [
      ['Pliki strony', '100%'],
      ['Baza danych', '100%'],
      ['Konfiguracja strony (dane bazy)', 'w toku'],
      ['Skrzynka biuro@', 'w kolejce'],
    ],
  },
  {
    podpis: 'Gotowe do przełączenia',
    wiersze: [
      ['Strona u nas', '✓ skopiowana i sprawdzona'],
      ['Synchronizacja różnic', 'przed zmianą DNS'],
      ['Plan przełączenia', 'rekordy sprawdzane na bieżąco'],
    ],
  },
];

export function PokazPrzeprowadzki({ etykiety }: { etykiety: string[] }) {
  const [krok, setKrok] = useState(0);
  const ekran = EKRANY[krok] ?? EKRANY[0];
  return (
    <div className="b-pokaz">
      <div className="b-pokaz-kroki" role="group" aria-label="Wybierz krok pokazu">
        {etykiety.map((e, i) => (
          <button
            key={e}
            type="button"
            aria-pressed={i === krok}
            className={i < krok ? 'b-byl' : undefined}
            onClick={() => setKrok(i)}
          >
            {i + 1}. {e}
          </button>
        ))}
      </div>
      <div className="b-pokaz-ekran" aria-live="polite">
        <p className="b-pokaz-podpis">
          Krok {krok + 1} z {etykiety.length} · {ekran.podpis}
        </p>
        <ul>
          {ekran.wiersze.map(([k, v]) => (
            <li key={k}>
              <span>{k}</span>
              {v && <span className="b-pokaz-v">{v}</span>}
            </li>
          ))}
        </ul>
        <div className="b-pokaz-nav">
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setKrok(Math.max(0, krok - 1))} disabled={krok === 0}>
            Wstecz
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={() => setKrok(krok === etykiety.length - 1 ? 0 : krok + 1)}
          >
            {krok === etykiety.length - 1 ? 'Od początku' : 'Dalej'}
          </button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useId, useState } from 'react';

/**
 * /poczta — „Skonfigurujesz w 2 minuty” (makieta 1.11): zakładki urządzeń + tabela ustawień.
 * Porty zgodne z artykułem bazy wiedzy „Konfiguracja poczty e-mail (IMAP/SMTP, porty)”
 * (apps/api/src/cli/seed-knowledge-base.ts): IMAP 993 SSL/TLS, SMTP 465 SSL (albo 587 STARTTLS).
 * Adresu serwera nie podajemy na stronie — zależy od serwera konta, pokazuje go panel.
 */
export const URZADZENIA: { nazwa: string; kroki: string[] }[] = [
  {
    nazwa: 'iPhone',
    kroki: [
      'Otwórz Ustawienia → Aplikacje → Poczta → Konta → Dodaj konto → Inne.',
      'Wybierz „Dodaj konto Mail”, wpisz imię, adres i hasło skrzynki.',
      'Wybierz IMAP i wpisz serwer z panelu oraz porty z tabeli obok.',
      'Zapisz. Poczta pojawi się w aplikacji Mail.',
    ],
  },
  {
    nazwa: 'Android',
    kroki: [
      'Otwórz aplikację Gmail → Dodaj konto → Inne.',
      'Wpisz adres i wybierz „Konto osobiste (IMAP)”.',
      'Podaj hasło, serwer z panelu i porty z tabeli obok.',
      'Zapisz i wybierz, jak często sprawdzać pocztę.',
    ],
  },
  {
    nazwa: 'Outlook',
    kroki: [
      'Wybierz Plik → Dodaj konto.',
      'Wpisz adres, rozwiń opcje zaawansowane i wybierz ręczną konfigurację.',
      'Wybierz IMAP, wpisz serwer z panelu i porty z tabeli obok.',
      'Podaj hasło i zakończ.',
    ],
  },
  {
    nazwa: 'Thunderbird',
    kroki: [
      'Otwórz Menu → Ustawienia kont → Dodaj konto pocztowe.',
      'Wpisz imię, adres i hasło skrzynki.',
      'Jeśli program nie znajdzie ustawień sam, wybierz konfigurację ręczną.',
      'Wpisz serwer z panelu i porty z tabeli obok.',
    ],
  },
];

export function PocztaKonfiguracja() {
  const [aktywne, setAktywne] = useState(0);
  const baza = useId();
  return (
    <div className="pcz-konf">
      <div className="pcz-konf-l">
        <div className="pcz-tabs" role="tablist" aria-label="Urządzenie">
          {URZADZENIA.map((u, i) => (
            <button
              key={u.nazwa}
              type="button"
              role="tab"
              id={`${baza}-t${i}`}
              aria-selected={i === aktywne}
              aria-controls={`${baza}-p${i}`}
              tabIndex={i === aktywne ? 0 : -1}
              className={`pcz-tab${i === aktywne ? ' on' : ''}`}
              onClick={() => setAktywne(i)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                  e.preventDefault();
                  const n = (aktywne + (e.key === 'ArrowRight' ? 1 : URZADZENIA.length - 1)) % URZADZENIA.length;
                  setAktywne(n);
                  document.getElementById(`${baza}-t${n}`)?.focus();
                }
              }}
            >
              {u.nazwa}
            </button>
          ))}
        </div>
        {URZADZENIA.map((u, i) => (
          <div
            key={u.nazwa}
            role="tabpanel"
            id={`${baza}-p${i}`}
            aria-labelledby={`${baza}-t${i}`}
            hidden={i !== aktywne}
          >
            <ol className="pcz-kroki">
              {u.kroki.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ol>
          </div>
        ))}
      </div>
      {/* A3-13: przewijana w bok tabela dostępna z klawiatury (fokus + nazwa regionu). */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A3-13: przewijany w bok obszar musi dostać fokus (WCAG 2.1.1, axe scrollable-region-focusable) */}
      <div className="pcz-tabela card" role="region" aria-label="Ustawienia programu pocztowego" tabIndex={0}>
        <table>
          <caption className="pcz-sr">Ustawienia programu pocztowego</caption>
          <thead>
            <tr>
              <th scope="col">Ustawienie</th>
              <th scope="col">Przychodząca (IMAP)</th>
              <th scope="col">Wychodząca (SMTP)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Serwer</th>
              <td colSpan={2}>w panelu przy usłudze, w zakładce Poczta, z przyciskiem „Kopiuj”</td>
            </tr>
            <tr>
              <th scope="row">Port</th>
              <td className="mono">993</td>
              <td className="mono">465 (albo 587)</td>
            </tr>
            <tr>
              <th scope="row">Szyfrowanie</th>
              <td>SSL/TLS</td>
              <td>SSL/TLS (przy 587: STARTTLS)</td>
            </tr>
            <tr>
              <th scope="row">Login</th>
              <td colSpan={2}>pełny adres, np. anna@twojafirma.pl</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

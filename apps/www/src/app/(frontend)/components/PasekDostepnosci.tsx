'use client';

import { useState } from 'react';
import { opisDnia, procent, type Dostepnosc } from '@/lib/dostepnosc';

/**
 * Interaktywny pasek dostępności dzień po dniu (makieta 1.11, „Nie ukrywamy awarii”). Dane pobiera strona
 * serwerowo przez pobierzDostepnosc() (GET /status, cache 5 min) — gdy API nie odpowie, strona komponentu
 * nie renderuje. Opis dnia pojawia się po najechaniu, fokusie (Tab) albo kliknięciu słupka.
 */
export function PasekDostepnosci({ dane }: { dane: Dostepnosc }) {
  const [wybrany, setWybrany] = useState<number | null>(null);
  const opis = wybrany === null ? 'Najedź na dzień, żeby zobaczyć szczegóły' : opisDnia(dane.dni[wybrany]);
  const podsumowanie = [
    dane.d30 !== null ? `30 dni: ${procent(dane.d30)}` : null,
    dane.h24 !== null ? `dziś ${procent(dane.h24)}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <div className="pdost">
      <div className="pdost-dni" role="group" aria-label="Dostępność dzień po dniu" onMouseLeave={() => setWybrany(null)}>
        {dane.dni.map((d, i) => (
          <button
            key={d.data}
            type="button"
            className="pdost-d"
            data-k={d.klasa}
            aria-pressed={wybrany === i}
            aria-label={opisDnia(d)}
            onMouseEnter={() => setWybrany(i)}
            onFocus={() => setWybrany(i)}
            onClick={() => setWybrany(i)}
          />
        ))}
      </div>
      <div className="pdost-info">
        <span aria-live="polite">{opis}</span>
        {podsumowanie && <span className="mono">{podsumowanie}</span>}
      </div>
    </div>
  );
}

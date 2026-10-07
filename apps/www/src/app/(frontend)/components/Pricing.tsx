'use client';

import { useState } from 'react';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { PANEL } from '@/lib/site';
import { Button, SectionHead } from './ui';

/*
 * Cennik (strona główna i /cennik): jeden pakiet, przełącznik Miesięcznie/Rocznie (domyślnie rocznie).
 * Ceny pilnuje test API plan-produkcyjny.spec.ts, liczbę dni kopii — kopie-30-dni.spec.ts (czytają ten plik).
 */

const RESOURCES = [
  { base: '50 GB', max: '→ 1000 GB', label: 'dysk NVMe' },
  { base: 'do 8 GB', max: '→ 64 GB', label: 'RAM' },
  { base: 'do 2 vCPU', max: '→ 24 vCPU', label: 'procesor' },
];

const FEATURES = [
  'Bezpłatna migracja',
  'SSL dla każdej domeny',
  'Kopie poza serwerem z ostatnich 30 dni',
  'Staging WordPress',
  'Poczta i webmail',
  'Ukrycie danych w WHOIS',
  'PHP osobno dla domeny',
  'Subkonta i passkeys',
];

/** `naglowek={false}` — gdy stronę otwiera już własny h1 o cenie (/cennik). */
export function Pricing({ naglowek = true }: { naglowek?: boolean }) {
  const [yearly, setYearly] = useState(true);
  const Tytul = naglowek ? 'h3' : 'h2'; // bez nagłówka sekcji karta idzie zaraz po h1

  return (
    <section id="cennik" className="pricing2">
      <div className="bg-pat" aria-hidden="true" />
      <div className="wrap">
        {naglowek && (
          <SectionHead
            center
            eyebrow="Cennik"
            title="Jedna cena. Także przy odnowieniu."
            lead="Bez ceny za 1 zł na start i kilka razy droższego drugiego roku."
          />
        )}
        <div className="pcard2">
          <div className="pcard2-main">
            <Tytul className="pcard2-h">Hosting Verris z autoskalowaniem</Tytul>
            <p>Bez limitu stron, skrzynek i transferu — w ramach zasobów konta.</p>
            <ul className="pres">
              {RESOURCES.map((r) => (
                <li key={r.label}>
                  <strong>{r.base}</strong> <span className="mint">{r.max}</span>
                  <span className="l">{r.label}</span>
                </li>
              ))}
            </ul>
            <ul className="ticks">
              {FEATURES.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>

          <div className="pcard2-side">
            <div className="seg" role="group" aria-label="Okres rozliczenia">
              <button type="button" aria-pressed={!yearly} onClick={() => setYearly(false)}>
                Miesięcznie
              </button>
              <button type="button" aria-pressed={yearly} onClick={() => setYearly(true)}>
                Rocznie −91 zł
              </button>
            </div>
            <div aria-live="polite">
              <p className="price-big2">
                {yearly ? '449 zł' : '45 zł'}
                <span>{yearly ? ' / rok' : ' / mies'}</span>
              </p>
              <p className="price-sub2">
                {yearly
                  ? 'brutto, ok. 37 zł/mies · albo 45 zł/mies bez zobowiązania'
                  : 'brutto, bez zobowiązania · albo 449 zł/rok (taniej o 91 zł)'}
              </p>
            </div>
            <Button href={PANEL} cta="pricing" conv="checkout_intent" plan="hosting">
              Zamów hosting
            </Button>
            <p className="price-note2">
              Odnowienie po cenie z cennika. Rabat na start, jeśli trwa, widzisz przed zapłatą; przed odnowieniem
              przypomnimy e-mailem, a zrezygnujesz z niego w panelu w każdej chwili.
            </p>
          </div>
        </div>

        <p className="finebox">
          „Bez limitu” oznacza brak sztywnego licznika — realnym ogranicznikiem są zasoby konta (CPU/RAM/dysk) i
          zasady uczciwego korzystania. Autoskalowanie ponad bazę rozliczane jest według stawek z cennika, w blokach
          15 minut. {VPS_W_SPRZEDAZY ? 'VPS i domeny mają' : 'Domeny mają'} osobną wycenę — sprawdzisz ją w panelu.
        </p>
      </div>
    </section>
  );
}

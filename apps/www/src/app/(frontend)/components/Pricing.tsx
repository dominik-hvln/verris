'use client';

import { useState } from 'react';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { PANEL } from '@/lib/site';
import { miesiecznieZRocznej, netto, RABAT_NA_START, rabatRocznyProcent, zl, type CenaPakietu } from '@/lib/ceny';
import { Button, SectionHead } from './ui';

/*
 * Cennik (strona główna i /cennik): jeden pakiet, przełącznik Miesięcznie/Rocznie (domyślnie rocznie).
 * Ceny przychodzą z API (lib/ceny, prop `cena`), liczbę dni kopii pilnuje kopie-30-dni.spec.ts (czyta ten plik).
 */

const RESOURCES = [
  // Limit w pakiecie → sufit autoskalowania. RAM i CPU to limity (LVE), nie rezerwacja — strażnik Z-14.
  { label: 'limit dysku NVMe', base: '50 GB', max: '→ 1000 GB' },
  { label: 'limit RAM', base: '8 GB', max: '→ 64 GB' },
  { label: 'limit procesora', base: '2 vCPU', max: '→ 24 vCPU' },
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
export function Pricing({ naglowek = true, cena }: { naglowek?: boolean; cena: CenaPakietu }) {
  const [yearly, setYearly] = useState(true);
  const m = cena.miesiecznie;
  const r = cena.rocznie;
  const rabat = rabatRocznyProcent(cena);
  const Tytul = naglowek ? 'h3' : 'h2'; // bez nagłówka sekcji karta idzie zaraz po h1

  return (
    <section id="cennik" className="pricing2">
      <div className="bg-pat" aria-hidden="true" />
      <div className="wrap">
        {naglowek && (
          <SectionHead
            center
            eyebrow="Cennik"
            title="Jeden pakiet. Cenę odnowienia znasz z góry."
            lead="Bez ceny za 1 zł na start i kilka razy droższego drugiego roku. Odnowienie po cenie z cennika."
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
                {rabat > 0 ? `Rocznie −${rabat}%` : 'Rocznie'}
              </button>
            </div>
            <div aria-live="polite">
              <p className="price-big2">
                {yearly ? zl(r) : zl(m)}
                <span>{yearly ? ' / rok' : ' / mies'}</span>
              </p>
              <p className="price-sub2">
                {yearly
                  ? `brutto (${zl(netto(r))} netto), ok. ${zl(miesiecznieZRocznej(cena))}/mies · albo ${zl(m)}/mies bez zobowiązania`
                  : `brutto (${zl(netto(m))} netto), bez zobowiązania · albo ${zl(r)}/rok (taniej o ${zl(m * 12 - r)})`}
              </p>
            </div>
            <Button href={PANEL} cta="pricing" conv="checkout_intent" plan="hosting">
              Zamów hosting
            </Button>
            <p className="price-note2">
              {RABAT_NA_START} Przed odnowieniem przypomnimy e-mailem, a zrezygnujesz z niego w panelu w każdej chwili.
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

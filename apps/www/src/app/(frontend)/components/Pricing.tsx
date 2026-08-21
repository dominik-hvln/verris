'use client';

import { useState } from 'react';

const RESOURCES = [
  { base: '50 GB', max: '→ 1000 GB', label: 'dysk NVMe' },
  { base: '8 GB', max: '→ 64 GB', label: 'RAM' },
  { base: '2 vCPU', max: '→ 24 vCPU', label: 'CloudLinux' },
];

const GROUPS: { title: string; note?: string; items: (string | [string, string])[] }[] = [
  {
    title: 'Wydajność',
    items: [
      'Inteligentne autoskalowanie zasobów',
      ['Maksymalna moc w piku — ', 'do 24 vCPU'],
      ['Zoptymalizowany pod ', 'WordPress'],
      'Tryb ECO — zwalnia moc po piku',
    ],
  },
  {
    title: 'Bez limitu (w ramach zasobów konta)',
    items: [
      ['Liczba stron WWW — ', 'bez limitu'],
      ['Skrzynki pocztowe — ', 'bez limitu'],
      ['Transfer — ', 'bez limitu'],
      'Bazy danych i konta FTP',
    ],
  },
  {
    title: 'W cenie, bez dopłat',
    items: [
      'Bezpłatna i szybka migracja',
      "Certyfikat SSL Let's Encrypt",
      'Obsługa starych wersji PHP',
      'Kopie zapasowe z samodzielnym odtwarzaniem (w ramach limitu Planu)',
      'Kopia bezpieczeństwa przed przywróceniem — domyślnie włączona',
      'Kreator stron i menedżer plików',
    ],
  },
];

function Feat({ item }: { item: string | [string, string] }) {
  if (Array.isArray(item))
    return (
      <div className="feat">
        {item[0]}
        <strong>{item[1]}</strong>
      </div>
    );
  return <div className="feat">{item}</div>;
}

export function Pricing() {
  const [monthly, setMonthly] = useState(true);

  return (
    <section id="cennik">
      <div className="wrap">
        <div className="sec-head rv">
          <p className="kicker">Cennik</p>
          <h2>Jeden pakiet. Jedna cena. Zero zgadywania, który wybrać.</h2>
          <p>
            Wszystko, czego potrzebuje strona firmowa, blog albo sklep — w jednej cenie. Bez dopłat
            za SSL, migrację czy „szybszy dysk".
          </p>
        </div>
        <div className="price-wrap">
          <div className="toggle rv" role="tablist" aria-label="Okres rozliczenia">
            <button
              className={monthly ? 'on' : ''}
              role="tab"
              aria-selected={monthly}
              onClick={() => setMonthly(true)}
            >
              Miesięcznie
            </button>
            <button
              className={!monthly ? 'on' : ''}
              role="tab"
              aria-selected={!monthly}
              onClick={() => setMonthly(false)}
            >
              Rocznie <span className="save">−141 zł</span>
            </button>
          </div>

          <div className="pcard rv">
            <div className="pcard-main">
              <h3>Hosting Verris z autoskalowaniem</h3>
              <p className="sub">
                Bazowe zasoby non-stop w cenie — nadwyżka rozliczana godzinowo, tylko za realne
                użycie.
              </p>

              <div className="base-res">
                {RESOURCES.map((r) => (
                  <div className="res" key={r.label}>
                    <div className="v">{r.base}</div>
                    <div className="max">{r.max}</div>
                    <div className="l">{r.label}</div>
                  </div>
                ))}
              </div>

              <div className="spec-cols">
                {GROUPS.map((g) => (
                  <div key={g.title} style={{ display: 'contents' }}>
                    <p className="spec-title">{g.title}</p>
                    {g.items.map((it, i) => (
                      <Feat key={i} item={it} />
                    ))}
                  </div>
                ))}
              </div>
            </div>

            <div className="pcard-side">
              <div className="price-big">
                {monthly ? '45 zł' : '399 zł'}
                <span className="u">{monthly ? ' / mies' : ' / rok'}</span>
              </div>
              <p className="price-sub">
                {monthly
                  ? 'brutto (z VAT), rozliczenie miesięczne'
                  : 'brutto (z VAT), równowartość ok. 33 zł/mies'}
              </p>
              <p className="price-alt">
                {monthly ? 'albo 399 zł/rok — taniej o 141 zł' : 'albo 45 zł/mies bez zobowiązania rocznego'}
              </p>
              <a
                className="btn btn-primary"
                href="https://panel.verris.pl"
                data-event="cta_click"
                data-cta="pricing"
                data-conv="checkout_intent"
              >
                Załóż konto i przenieś stronę
              </a>
              <p className="price-note">
                Cena z cennika obowiązuje od pierwszego dnia. Odnowienie według cennika z dnia
                odnowienia — przypomnimy e-mailem, wyłączysz je w panelu w każdej chwili.
              </p>
            </div>
          </div>

          <p className="finebox">
            „Bez limitu" oznacza brak sztywnego licznika — realnym ogranicznikiem są zasoby konta
            (CPU/RAM/dysk) i zasady uczciwego korzystania. Autoskalowanie ponad bazę rozliczane jest
            godzinowo według stawek z cennika. VPS i domeny mają osobną wycenę — sprawdzisz ją w
            panelu.
          </p>
        </div>
      </div>
    </section>
  );
}

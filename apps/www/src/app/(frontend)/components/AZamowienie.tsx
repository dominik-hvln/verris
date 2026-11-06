'use client';

import { useState, useSyncExternalStore } from 'react';
import { LEGAL, PANEL } from '@/lib/site';
import { miesiecznieZRocznej, netto, zl, zlGrosze, type CenaPakietu } from '@/lib/ceny';

/*
 * Grupa A — /zamow (makieta 14.10, plansza Zamowienie): trzy kroki i podsumowanie. Strona niczego nie
 * zapisuje i nie przyjmuje płatności: konto, dane do faktury, zgody i płatność są w panelu. Końcowy
 * przycisk prowadzi do panelu i liczy checkout_intent (jedyne takie miejsce na ścieżce z nagłówka).
 * Bez JavaScriptu (render na serwerze) widać wszystkie kroki naraz, łącznie z przyciskiem do panelu.
 */

const KROKI = ['Domena', 'Okres', 'Konto i płatność'] as const;

const DOMENY = [
  { tytul: 'Mam domenę gdzie indziej', opis: 'Zostaw ją u obecnego rejestratora – w panelu pokażemy, jakie rekordy ustawić.', pozycja: 'Domena zewnętrzna', cena: '0 zł' },
  { tytul: 'Nowa domena', opis: 'Zarejestrujesz ją w panelu razem z hostingiem.', pozycja: 'Rejestracja domeny', cena: 'wg cennika domen' },
  { tytul: 'Przenieś domenę do Verris', opis: 'Potrzebny kod AuthInfo od obecnego rejestratora.', pozycja: 'Transfer domeny', cena: 'wg cennika domen' },
] as const;

/** Okresy rozliczenia z cenami z API (lib/ceny) — brutto w tytule, netto w opisie. */
const okresy = (c: CenaPakietu) => [
  {
    rok: true,
    tytul: `Rocznie – ${zl(c.rocznie)}`,
    opis: `Około ${zl(miesiecznieZRocznej(c))} miesięcznie, taniej o ${zl(c.miesiecznie * 12 - c.rocznie)} niż 12 × ${zl(c.miesiecznie)}. Netto ${zl(netto(c.rocznie))}.`,
  },
  { rok: false, tytul: `Miesięcznie – ${zl(c.miesiecznie)}`, opis: `Bez zobowiązania, rezygnujesz, kiedy chcesz. Netto ${zl(netto(c.miesiecznie))}.` },
];

const nic = () => () => {};

export function AZamowienie({ cena: c }: { cena: CenaPakietu }) {
  const OKRESY = okresy(c);
  const js = useSyncExternalStore(nic, () => true, () => false);
  const [krok, setKrok] = useState(0);
  const [domena, setDomena] = useState(0);
  const [rok, setRok] = useState(true);

  const widac = (i: number) => !js || krok === i;
  const brutto = rok ? c.rocznie : c.miesiecznie;
  const cena = zlGrosze(brutto);
  const cenaNetto = zlGrosze(netto(brutto));
  const d = DOMENY[domena];

  return (
    <div className="a-order">
      <div className="a-order-main">
        {js && (
          <ol className="a-order-steps" aria-label="Kroki zamówienia">
            {KROKI.map((k, i) => (
              <li key={k}>
                <button
                  type="button"
                  className="a-pill"
                  aria-current={i === krok ? 'step' : undefined}
                  onClick={() => setKrok(i)}
                >
                  {i + 1}. {k}
                </button>
              </li>
            ))}
          </ol>
        )}

        <section className="card a-order-step" hidden={!widac(0)} aria-labelledby="krok-1">
          <h2 id="krok-1">1. Jaka domena?</h2>
          <div className="a-opts">
            {DOMENY.map((o, i) => (
              <button key={o.tytul} type="button" className="a-opt" aria-pressed={i === domena} onClick={() => setDomena(i)}>
                <strong>{o.tytul}</strong>
                <span>{o.opis}</span>
              </button>
            ))}
          </div>
          <p className="a-order-note">
            Przeniesienie strony i poczty z obecnego hostingu jest bezpłatne. Dostęp do starego hostingu podasz w panelu po
            zamówieniu.
          </p>
        </section>

        <section className="card a-order-step" hidden={!widac(1)} aria-labelledby="krok-2">
          <h2 id="krok-2">2. Jak chcesz płacić?</h2>
          <div className="a-opts">
            {OKRESY.map((o) => (
              <button key={o.tytul} type="button" className="a-opt" aria-pressed={o.rok === rok} onClick={() => setRok(o.rok)}>
                <strong>{o.tytul}</strong>
                <span>{o.opis}</span>
              </button>
            ))}
          </div>
          <p className="a-order-note">
            Ceny brutto. Autoskalowanie włączasz sam w panelu. Bez limitu płacisz za faktyczne użycie; limit kosztu na 30 dni
            możesz ustawić przy zamówieniu i zmienić w panelu.
          </p>
        </section>

        <section className="card a-order-step" hidden={!widac(2)} aria-labelledby="krok-3">
          <h2 id="krok-3">3. Konto i płatność</h2>
          <p>
            W panelu Verris założysz konto (e-mail i dane do faktury – NIP, jeśli kupujesz na firmę), zaakceptujesz{' '}
            <a href={LEGAL}>regulamin i politykę prywatności</a>, a potem zapłacisz kartą, BLIK-iem albo szybkim przelewem.
          </p>
          <a
            href={PANEL}
            className="btn btn-primary btn-block"
            data-event="cta_click"
            data-cta="zamow"
            data-conv="checkout_intent"
            data-plan={rok ? 'hosting-rok' : 'hosting-mies'}
          >
            Przejdź do panelu i zapłać
          </a>
        </section>

        {js && (
          <div className="a-order-nav">
            <button type="button" className="btn btn-ghost" disabled={krok === 0} onClick={() => setKrok(Math.max(0, krok - 1))}>
              Wstecz
            </button>
            {krok < KROKI.length - 1 && (
              <button type="button" className="btn btn-primary" onClick={() => setKrok(krok + 1)}>
                Dalej
              </button>
            )}
          </div>
        )}
      </div>

      <aside className="card card-accent a-order-sum" aria-labelledby="podsumowanie">
        <h2 id="podsumowanie">Podsumowanie</h2>
        <dl className="a-kv" aria-live="polite">
          <div>
            <dt>Hosting z autoskalowaniem</dt>
            <dd>{cena}</dd>
          </div>
          <div>
            <dt>{d.pozycja}</dt>
            <dd>{d.cena}</dd>
          </div>
          <div>
            <dt>Przeniesienie strony i poczty</dt>
            <dd>0 zł</dd>
          </div>
          <div className="a-kalk-suma">
            <dt>Do zapłaty za hosting</dt>
            <dd className="mint">
              {cena} <small>brutto ({cenaNetto} netto)</small>
            </dd>
          </div>
        </dl>
        <p className="kalk-note">
          {rok ? 'Za rok odnowienie po cenie z cennika.' : 'Odnowienie co miesiąc po cenie z cennika.'} Przed odnowieniem
          przypomnimy e-mailem.
        </p>
        <ul className="a-list">
          <li>odnowienie wyłączysz w panelu w każdej chwili</li>
          <li>faktura VAT przy każdej wpłacie, w panelu</li>
          <li>SLA 99,5% z automatyczną rekompensatą według regulaminu</li>
        </ul>
      </aside>
    </div>
  );
}

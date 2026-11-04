import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Button, JsonLd, SectionHead2 } from '../components/ui';
import { BetaForm } from '../components/BetaForm';
import { pobierzCeny } from '@/lib/ceny-api';
import { netto, zl } from '@/lib/ceny';
import { BETA_MIESIAC, BETA_TERMIN, KREDYT_TESTOW, WAZNOSC_KODU_DNI, miesiaceZKredytu } from '@/lib/beta';
import { LEGAL } from '@/lib/site';
import { faqSchema, graph, webPageSchema } from '@/lib/schema';

/*
 * Otwarte testy przed startem (PB-26) — makieta Design „Verris — LP otwartych testów” (20.10), zmiany 2.11.2026:
 * termin grudzień 2026 (otwarta beta 7–20.12 na węźle produkcyjnym), bez obietnicy asystenta AI (jest za flagą),
 * selekcja zgłoszeń zamiast kolejności. Kredyt i ważność kodu z lib/beta.ts (zgodne z apps/api/src/beta),
 * ceny wyłącznie z lib/ceny (GET /plans). Strona tymczasowa — noindex, poza sitemapą.
 */
const OPIS = `Otwarte testy hostingu Verris przed startem: przenieś stronę, sklep albo pocztę i powiedz nam, co działa, a co nie. Na testy ${KREDYT_TESTOW} zł w kredytach, bez karty.`;

export const metadata: Metadata = {
  title: 'Testy hostingu przed startem — zgłoś się | Verris',
  description: OPIS,
  alternates: { canonical: '/beta' },
  robots: { index: false, follow: true },
};

const KOGO: [string, string][] = [
  ['Masz stronę na WordPressie', 'Przenieś ją kreatorem przeniesienia i sprawdź, czy działa jak u dotychczasowego hostingu.'],
  ['Prowadzisz sklep', 'WooCommerce albo PrestaShop: koszyk, płatności testowe, maile do klientów.'],
  ['Robisz strony dla klientów', 'Kilka stron na jednym koncie, wersja testowa, kopie, dostęp dla współpracowników.'],
  ['Potrzebujesz tylko poczty', 'Skrzynka w domenie firmy, poczta w przeglądarce i konfiguracja w telefonie.'],
];

const KROKI: [string, string][] = [
  ['Zgłaszasz się', 'Formularz niżej: imię, e-mail i co chcesz przetestować. Potem potwierdzasz adres linkiem z maila. Minuta.'],
  ['Dostajesz zaproszenie', `Mail z imiennym kodem na ${KREDYT_TESTOW} K i krótką listą rzeczy do sprawdzenia.`],
  ['Uruchamiasz usługę', 'Rejestracja, kod w portfelu, zakup hostingu i przeniesienie strony. Testujesz tylko pocztę? Zamawiasz samą pocztę.'],
  ['Mówisz nam, co nie gra', 'Przycisk „Zgłoś uwagę” w panelu, ze zrzutem ekranu. Na koniec 5 pytań.'],
];

const TESTUJESZ: string[] = [
  'Limity w pakiecie: 50 GB NVMe, 8 GB RAM i 2 vCPU. Z autoskalowaniem rosną do 1000 GB, 64 GB RAM i 24 vCPU',
  'Kreator przeniesienia strony i poczty z innego hostingu',
  'Certyfikaty SSL, poczta w domenie, poczta w przeglądarce',
  'Kopie co noc poza serwerem i samodzielne odtwarzanie',
  'Moc ponad pakiet jest opcjonalna: płacisz tylko za czas użycia, w blokach po 15 minut, do limitu ustawionego w panelu',
];

/**
 * Limity pakietu i sufity autoskalowania. Liczby jako dane, a „limit w pakiecie” stoi w nagłówku kolumny —
 * strażnik Z-14 (apps/api/src/test/oferta-zgodnosc.spec.ts) pilnuje, żeby baza RAM/CPU nie wyglądała na rezerwację.
 */
const LIMITY: { co: string; jedn: string; pakiet: number; max: number }[] = [
  { co: 'Dysk NVMe', jedn: 'GB', pakiet: 50, max: 1000 },
  { co: 'RAM', jedn: 'GB', pakiet: 8, max: 64 },
  { co: 'Procesor', jedn: 'vCPU', pakiet: 2, max: 24 },
];

export default async function Page() {
  const ceny = await pobierzCeny();
  const h = ceny.hosting;
  const wystarczy = miesiaceZKredytu(h.miesiecznie);

  const FAQ: [string, string][] = [
    [
      'Czy muszę coś płacić?',
      `Nie. ${KREDYT_TESTOW} K na koncie wystarczy na hosting na czas testów. Karty nie podajesz, więc nic nie zostanie pobrane. Po testach usługa zostaje; odnowienie z portfela albo kartą jest Twoją decyzją.`,
    ],
    [
      'Co z moją stroną, jeśli coś nie zadziała?',
      'Przeniesienie kopiuje stronę — dotychczasowy hosting zostaje bez zmian, dopóki sam nie przełączysz domeny. Na początek możesz testować na kopii.',
    ],
    [
      'Ile czasu to zajmie?',
      'Uruchomienie i przeniesienie strony — zwykle kilkanaście minut. Resztę sprawdzasz w swoim tempie przez dwa tygodnie.',
    ],
    [
      'Kiedy dostanę zaproszenie?',
      `Testy trwają ${BETA_TERMIN}. Zapraszamy małymi grupami i wybieramy tak, żeby przetestować różne strony, więc nie każde zgłoszenie dostanie zaproszenie od razu. Kod jest ważny ${WAZNOSC_KODU_DNI} dni od wysłania.`,
    ],
    ['Kto stoi za Verris?', 'Polska firma HVLN Dominik Kowalski. Na zgłoszenia z testów odpowiadamy osobiście, po polsku.'],
  ];

  const jsonLd = graph(
    webPageSchema({ name: 'Testy hostingu Verris przed startem', description: OPIS, path: '/beta' }),
    faqSchema(FAQ),
  );

  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap bt-hero">
          <div className="bt-hero-t">
            <span className="eyebrow">Testy przed startem · {BETA_MIESIAC}</span>
            <h1>
              Przenieś stronę na nowy polski hosting, <span className="mint">zanim wystartuje</span>
            </h1>
            <p className="lead">
              Testujemy hosting z autoskalowaniem: gdy ruch rośnie, konto może dostać więcej mocy. Szukamy osób, które
              przeniosą do nas stronę, sklep albo pocztę i powiedzą wprost, co działa, a co nie. Na testy dostajesz{' '}
              <strong>{KREDYT_TESTOW} zł w kredytach</strong> na konto Verris — bez karty, bez zobowiązań.
            </p>
            <div className="hero2-cta">
              <Button href="#zgloszenie" cta="beta-hero">
                Zgłaszam się
              </Button>
            </div>
            <p className="hero2-fine">
              Zapraszamy małymi grupami; wybieramy tak, żeby przetestować różne strony. Zaproszenie z imiennym kodem
              przyjdzie mailem.
            </p>
          </div>

          <figure className="card bt-kod" aria-labelledby="bt-kod-podpis">
            <p className="kicker">Twój kod testera</p>
            <p className="bt-kod-nr mono" aria-hidden="true">
              BETA-K7Q2XM
            </p>
            <dl className="bt-kod-dl">
              <div>
                <dt>Kredyty na konto</dt>
                <dd>{KREDYT_TESTOW} K</dd>
              </div>
              <div>
                <dt>Wystarczy na</dt>
                <dd>{wystarczy}</dd>
              </div>
              <div>
                <dt>Karta płatnicza</dt>
                <dd>niepotrzebna</dd>
              </div>
              <div>
                <dt>Kod ważny</dt>
                <dd>{WAZNOSC_KODU_DNI} dni od zaproszenia</dd>
              </div>
            </dl>
            <figcaption id="bt-kod-podpis">Przykładowy kod. 1 K = 1 zł w portfelu Verris.</figcaption>
          </figure>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="bt-kogo">
        <div className="wrap">
          <SectionHead2
            id="bt-kogo"
            eyebrow="Kogo szukamy"
            title="Nie musisz być informatykiem"
            lead="Najwięcej dowiemy się od osób, które panelu hostingu nie znają."
          />
          <ul className="bt-siatka4">
            {KOGO.map(([t, d]) => (
              <li key={t} className="card">
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" aria-labelledby="bt-jak">
        <div className="wrap">
          <SectionHead2 id="bt-jak" eyebrow="Jak to wygląda" title="Cztery kroki od zgłoszenia do uwag" />
          <ol className="bt-siatka4 bt-kroki">
            {KROKI.map(([t, d], i) => (
              <li key={t} className="card">
                <span className="mono bt-nr">{String(i + 1).padStart(2, '0')}</span>
                <h3>{t}</h3>
                <p>{d}</p>
              </li>
            ))}
          </ol>
          {/* P1-04: co przygotować przed przeniesieniem — ta sama lista co na /przenies-strone. */}
          <p className="b-przypis">
            Przenosisz stronę? Przygotuj login do starego panelu albo dane FTP i hasła skrzynek. Jeśli stronę robił ktoś
            inny, poproś go o nie wcześniej. <Link href="/przenies-strone#co-przygotowac">Co przygotować do przeniesienia</Link>
          </p>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="bt-co">
        <div className="wrap bt-dwa">
          <div>
            <SectionHead2 id="bt-co" eyebrow="Co testujesz" title="Ten sam hosting, który przygotowujemy do sprzedaży" />
            <ul className="bt-lista">
              {TESTUJESZ.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
          <div className="card bt-uczciwie">
            <h3>Uczciwie o testach</h3>
            <p>To wersja przed startem — możesz trafić na błąd. Po to są testy, a my naprawiamy na bieżąco.</p>
            <p>
              Działasz na zwykłych zasadach <a href={LEGAL}>regulaminu i polityki prywatności</a> Verris.
            </p>
            <p>
              Po testach usługa zostaje — nic nie wygasa i nic nie trzeba przenosić; później odnawiasz ją z portfela albo
              kartą, jak każdy klient. Gdyby coś miało się zmienić, napiszemy z wyprzedzeniem. Dotychczasowy hosting
              zostaje nietknięty, dopóki sam nie przełączysz domeny.
            </p>
            <p>Serwery w Unii Europejskiej.</p>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="bt-auto">
        <div className="wrap bt-dwa">
          <div>
            <SectionHead2 id="bt-auto" eyebrow="Autoskalowanie" title="Więcej mocy w szczycie, do Twojego limitu" />
            <p>
              Pakiet ma stałą cenę: {zl(h.miesiecznie)} miesięcznie albo {zl(h.rocznie)} za rok brutto (
              {zl(netto(h.miesiecznie))} albo {zl(netto(h.rocznie))} netto). Kiedy na stronę wpada więcej ludzi niż
              zwykle, na przykład po kampanii albo w Black Friday, konto może dostać więcej mocy, do limitu, który
              ustawisz. Po szczycie wraca do pakietu.
            </p>
            <p>
              Moc ponad pakiet jest opcjonalna. Płacisz tylko za czas użycia, w blokach po 15 minut, a górny limit wydatków
              ustawiasz sam w panelu. W testach to jeden ze scenariuszy: sprawdzisz prognozę zużycia i ustawienia limitu.
            </p>
          </div>
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A3-13: przewijany w bok obszar musi dostać fokus (WCAG 2.1.1, axe scrollable-region-focusable) */}
          <div className="card bt-limity" role="region" aria-label="Limity w pakiecie i z autoskalowaniem" tabIndex={0}>
            <table>
              <caption className="bt-sr">Limity w pakiecie i z autoskalowaniem</caption>
              <thead>
                <tr>
                  <th scope="col">
                    <span className="bt-sr">Zasób</span>
                  </th>
                  <th scope="col">limit w pakiecie</th>
                  <th scope="col">z autoskalowaniem do</th>
                </tr>
              </thead>
              <tbody>
                {LIMITY.map((l) => (
                  <tr key={l.co}>
                    <th scope="row">{l.co}</th>
                    <td>
                      {l.pakiet} {l.jedn}
                    </td>
                    <td className="mint">
                      {l.max} {l.jedn}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="zgloszenie" aria-labelledby="bt-form-h">
        <div className="wrap bt-dwa bt-form-sec">
          <div>
            <SectionHead2
              id="bt-form-h"
              eyebrow={`Testy ${BETA_TERMIN}`}
              title="Zgłoś się do testów"
              lead="Przeczytamy każde zgłoszenie. Zaproszenie z kodem wyślemy mailem, gdy wybierzemy grupę."
            />
          </div>
          <BetaForm />
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead2 eyebrow="Pytania" title="Pytania o testy" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>
    </main>
  );
}

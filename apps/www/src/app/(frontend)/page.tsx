import type { ReactNode } from 'react';
import Link from 'next/link';
import { Pricing } from './components/Pricing';
import { Accordion, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy, Steps, type Step } from './components/ui';
import { organization, ORG_ID, SITE, HOSTING_OFFERS } from '@/lib/schema';
import { SPECYFIKACJA_OPUBLIKOWANA, zweryfikowane } from '@/lib/oferta';
import { formatZl, kosztPiku } from '@/lib/kalkulator';
import { PANEL } from '@/lib/site';

// Przykład piku w hero i w „Stawki brutto”: +7 vCPU i +4 GB RAM przez 2,5 h (liczone, nie wpisane).
const PRZYKLAD = formatZl(kosztPiku(7, 4, 2.5));

// Słupki wykresu w hero (px przy wysokości 190); `p` = pik ponad bazę.
const SLUPKI = [22, 26, 20, 30, 34, 92, 150, 176, 138, 80, 32, 24, 28, 22].map((h) => ({ h, p: h > 40 }));

const PARAMETRY: [ReactNode, string][] = [
  [<>50 GB <span className="mint">→ 1000 GB</span></>, 'dysk NVMe'],
  [<>do 8 GB <span className="mint">→ 64 GB</span></>, 'pamięci RAM'],
  [<>do 2 vCPU <span className="mint">→ 24</span></>, 'moc procesora w piku'],
  [<>99,5%</>, 'SLA z rekompensatą w umowie'],
];

// `po: true` — funkcja czeka na weryfikację na węźle (lib/oferta.ts, SPEC_PO_WERYFIKACJI).
const NOWOSCI = zweryfikowane([
  {
    tag: 'Kopie zapasowe',
    title: 'Kopia poza serwerem z każdego z ostatnich 30 dni',
    text: 'Szyfrowana. Pliki, bazy i pocztę przywracasz sam, z panelu.',
    link: ['Jak działają kopie', '/funkcje/kopie-zapasowe'],
  },
  {
    tag: 'WordPress',
    title: 'Kopia testowa (staging) jednym kliknięciem',
    text: 'Sprawdzasz aktualizacje wtyczek na kopii, zanim trafią na stronę.',
    link: ['Hosting WordPress', '/hosting/wordpress'],
  },
  {
    tag: 'Domeny',
    title: 'Ukrycie danych w WHOIS — bezpłatnie',
    text: 'Twoje dane abonenta nie są publiczne. Włączasz jednym przyciskiem przy domenie.',
    link: ['Domeny w Verris', '/domeny'],
  },
  {
    tag: 'Dla deweloperów',
    title: 'PostgreSQL 16, Redis i wdrożenia z Git',
    text: 'Osobna instancja Redis dla konta, SSH w izolowanym środowisku, Node.js i Python.',
    link: ['Specyfikacja', '/specyfikacja'],
    po: true,
  },
  {
    tag: 'Bezpieczeństwo',
    title: 'Logowanie kluczem dostępu (passkey)',
    text: 'Bez hasła do zgubienia. Do tego subkonta z uprawnieniami dla współpracowników.',
    link: ['Bezpieczeństwo konta', '/specyfikacja'],
  },
]);

const KROKI: Step[] = [
  {
    label: '01',
    title: 'Baza w abonamencie',
    text: '50 GB NVMe, do 8 GB RAM i do 2 vCPU za 45 zł/mies. Dla większości stron to z zapasem wystarczy.',
  },
  {
    label: '02',
    title: 'Pik ruchu — więcej mocy',
    text: 'Kampania, Black Friday, artykuł w mediach? Zasoby rosną automatycznie, do 24 vCPU i 64 GB RAM. Rozliczenie w blokach po 15 minut.',
    accent: true,
  },
  {
    label: '03',
    title: 'Spokój — powrót do bazy',
    text: 'Gdy ruch spada, nadwyżka znika, a naliczanie kończy się w ciągu kilkunastu minut. Nie płacisz za moc, której nie używasz.',
  },
];

const ZYSKI: [string, string][] = [
  ['Nie przepłacasz za pakiet „na zapas”.', 'Większy pakiet na cały rok to pieniądze za moc używaną kilka dni w roku.'],
  ['Strona nie zwalnia w najważniejszym momencie.', 'W kampanii zasoby rosną, zamiast kończyć się na limicie pakietu.'],
  ['Limit kosztów ustawiasz sam.', 'Po jego osiągnięciu zasoby przestają rosnąć — bez niespodzianek na fakturze.'],
  ['Widzisz każdy kwadrans.', 'Wykresy CPU, RAM i I/O oraz dopłaty na bieżąco w panelu.'],
];

type Konkret = { t: string; d: string; po?: boolean };
// Po 4 pozycje na kartę: najpierw te z makiety; gdy czekają na weryfikację, wskakują kolejne z listy.
const KONKRETY: { title: string; items: Konkret[] }[] = [
  {
    title: 'Wydajność',
    items: [
      { t: 'LiteSpeed Enterprise', d: 'szybki serwer WWW z cache dla WordPress', po: true },
      { t: 'Dyski NVMe', d: 'krótszy czas ładowania i szybsze bazy' },
      { t: 'PHP 7.4–8.3', d: 'wersja osobno dla każdej domeny' },
      { t: 'Redis i Memcached', d: 'własna instancja dla konta', po: true },
      { t: 'Autoskalowanie', d: 'do 24 vCPU, 64 GB RAM i 1000 GB dysku w piku' },
      { t: 'WordPress jednym kliknięciem', d: 'z kopią testową (staging)' },
    ],
  },
  {
    title: 'Bezpieczeństwo',
    items: [
      { t: 'Izolacja kont', d: 'sąsiad na serwerze nie spowolni Twojej strony', po: true },
      { t: 'ImunifyAV', d: 'skan złośliwego oprogramowania w tle i na żądanie', po: true },
      { t: 'WAF z regułami OWASP', d: 'blokuje typowe ataki na formularze i wtyczki', po: true },
      { t: 'Kopie przez 30 dni', d: 'szyfrowane, poza serwerem' },
      { t: 'Logowanie dwuskładnikowe i passkeys', d: 'oraz subkonta z uprawnieniami' },
      { t: "SSL Let's Encrypt", d: 'także wildcard, odnawiany automatycznie' },
      { t: 'Kopia przed przywróceniem', d: 'nieudane odtworzenie da się cofnąć' },
    ],
  },
  {
    title: 'Opieka',
    items: [
      { t: 'Bezpłatna migracja', d: 'strona, bazy i poczta w cenie' },
      { t: 'SLA 99,5% z rekompensatą', d: 'zapisane w umowie, nie w reklamie' },
      { t: 'Dane w EOG', d: 'centra danych w Niemczech lub Finlandii' },
      { t: 'Monitoring i strona statusu', d: 'wykresy, powiadomienia i publiczny status usług' },
    ],
  },
].map((g) => ({ ...g, items: zweryfikowane(g.items).slice(0, 4) }));

const MIGRACJA: Step[] = [
  { label: '1', title: 'Podajesz dostęp do starego hostingu', text: 'Przez formularz w panelu albo w zgłoszeniu do zespołu.' },
  { label: '2', title: 'Kopiujemy pliki, bazy i pocztę', text: 'Stara strona działa dalej, nic nie znika w trakcie.' },
  { label: '3', title: 'Sprawdzasz i przełączasz domenę', text: 'Podgląd przed przełączeniem, potem jedna zmiana DNS.' },
];

const POROWNANIE: [string, string, string][] = [
  ['Cena po pierwszym roku', 'tania przynęta, odnowienie kilka razy drożej', 'ta sama cena z cennika'],
  ['Pik ruchu', 'limit zasobów i błąd 508', 'autoskalowanie do 24 vCPU'],
  ['Kopie zapasowe', 'płatny dodatek albo kilka dni', '30 dni poza serwerem, w cenie'],
  ['Dostępność', 'obietnica w reklamie', 'SLA 99,5% z rekompensatą w umowie'],
];

const FAQ: [string, string][] = [
  [
    'Ile naprawdę kosztuje autoskalowanie?',
    'Baza jest w abonamencie (45 zł/mies lub 449 zł/rok brutto). Nadwyżkę liczymy według jawnych stawek brutto w blokach po 15 minut, a limit kosztu autoskalowania ustawiasz sam w panelu.',
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    'Nie stosujemy modelu taniego pierwszego roku i kilkukrotnie droższego odnowienia. Na start możesz dostać rabat — jego wysokość widzisz przed zapłatą — a odnowienie idzie po cenie z cennika (dziś 45 zł/mies lub 449 zł/rok). Przed każdym odnowieniem wyślemy przypomnienie e-mail, a z odnowienia zrezygnujesz w panelu w każdej chwili, bez opłat.',
  ],
  [
    'Czy mogę przenieść stronę z innego hostingu?',
    'Tak. Przeprowadzkę strony i poczty wykonuje zespół Verris albo migrator w panelu — oba bezpłatne w ramach zamówienia hostingu. Migracja odbywa się obok działającej strony, bez przestoju, a przełączenie następuje przez zmianę DNS. Bez limitu liczby plików i bez dopłat za bazy danych.',
  ],
  [
    'Gdzie są moje dane?',
    'W centrach danych w Niemczech lub Finlandii (EOG). Lokalizację serwera widzisz w panelu.',
  ],
  [
    'Co znaczy „bez limitu” stron, skrzynek i transferu?',
    'Nie nakładamy sztywnego licznika na liczbę stron, skrzynek e-mail ani na transfer. Realnym ogranicznikiem są zasoby konta (CPU, RAM, dysk) oraz zasady uczciwego korzystania — dzięki autoskalowaniu te zasoby rosną w piku.',
  ],
];

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Verris', inLanguage: 'pl-PL', publisher: { '@id': ORG_ID } },
    {
      '@type': 'Product',
      name: 'Hosting Verris z autoskalowaniem',
      description:
        'Hosting współdzielony z autoskalowaniem CPU/RAM/dysku. Baza: 50 GB NVMe, do 8 GB RAM, do 2 vCPU; skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł, SLA 99,5% z rekompensatami.',
      brand: { '@id': ORG_ID },
      offers: HOSTING_OFFERS,
    },
    { '@type': 'FAQPage', mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })) },
  ],
};

function Wykres() {
  return (
    <div className="chart">
      <span className="chart-base">baza</span>
      {SLUPKI.map((s, i) => (
        <span key={i} className={s.p ? 'burst' : undefined} style={{ height: `${(s.h / 190) * 100}%` }} />
      ))}
    </div>
  );
}

function Ptaszek() {
  return (
    <span className="tick" aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 6.5l2.5 2.5L10 3.5" />
      </svg>
    </span>
  );
}

export default function HomePage() {
  return (
    <main>
      <JsonLd data={homeJsonLd} />

      {/* HERO */}
      <section className="hero2">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <span className="chip">Hosting z autoskalowaniem · panel po polsku</span>
            <h1>Hosting, który rośnie razem z&nbsp;Twoim ruchem</h1>
            <p className="lead">
              Strona, sklep i poczta w jednym panelu. W piku zasoby rosną same — do 24 vCPU i 64 GB RAM — a po nim
              wracają do bazy. Płacisz abonament i tylko za realnie użytą nadwyżkę.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="hero" conv="checkout_intent" plan="hosting">
                Zamów hosting — 45 zł/mies
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="hero-migracja">
                Przenieś stronę za darmo →
              </Button>
            </div>
            <p className="hero2-fine">
              449 zł/rok brutto · odnowienie po tej samej cenie · limit kosztów autoskalowania ustawiasz sam
            </p>
          </div>

          {/* Makieta panelu w HTML/CSS. TODO: zrzut z konta demo (bez danych osobowych). */}
          <div
            className="card mock tylko-szeroki"
            role="img"
            aria-label={`Przykładowy wykres mocy CPU z panelu Verris: pik 9 vCPU i 12 GB RAM przez 2 h 30 min, dopłata ${PRZYKLAD} zł.`}
          >
            <div className="mock-bar">
              <i />
              <i />
              <i />
              <span>panel.verris.pl › Hosting › Autoskalowanie</span>
            </div>
            <div className="mock-body">
              <div className="mock-head">
                <div>
                  <b>Moc CPU — ostatnie 24 h</b>
                  <small>baza do 2 vCPU · sufit 24 vCPU</small>
                </div>
                <span className="chip chip-sm">● Autoskalowanie włączone</span>
              </div>
              <Wykres />
              <div className="mock-stats">
                <div>
                  <small>Pik</small>
                  <b>9 vCPU · 12 GB</b>
                </div>
                <div>
                  <small>Czas piku</small>
                  <b>2 h 30 min</b>
                </div>
                <div>
                  <small>Dopłata</small>
                  <b className="mint">{PRZYKLAD} zł</b>
                </div>
              </div>
              <small className="mock-note">Przykład wyliczony ze stawek z cennika. Limit kosztu ustawiasz sam.</small>
            </div>
          </div>
        </div>

        <div className="wrap">
          <ul className="params">
            {PARAMETRY.map(([v, l]) => (
              <li key={l}>
                <b>{v}</b>
                <span>{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* NOWOŚCI */}
      <section className="sec news-sec" aria-labelledby="nowosci">
        <div className="wrap news-head">
          <SectionHead eyebrow="Co nowego" title="Nowości w Verris" id="nowosci" />
          <Link className="more" href="/funkcje">
            Wszystkie funkcje →
          </Link>
        </div>
        <ul className="news">
          {NOWOSCI.map((n) => (
            <li key={n.title} className="card">
              <span className="chip chip-sm">{n.tag}</span>
              <h3>{n.title}</h3>
              <p>{n.text}</p>
              <Link href={n.link[1]}>{n.link[0]} →</Link>
            </li>
          ))}
        </ul>
      </section>

      {/* AUTOSKALOWANIE: JAK TO DZIAŁA */}
      <section className="sec" id="autoskalowanie">
        <div className="wrap">
          <SectionHead
            eyebrow="Autoskalowanie"
            title="Jak to działa?"
            lead="Nie zgadujesz, jaki pakiet kupić „na zapas”. Masz jedną bazę w abonamencie, a moc dokłada się sama, kiedy strona jej potrzebuje."
          />
          <div className="card mock-mini tylko-telefon" role="img" aria-label={`Przykład: pik 2,5 h, +7 vCPU i +4 GB RAM, dopłata ${PRZYKLAD} zł.`}>
            <div className="mock-head">
              <b>Moc CPU — 24 h</b>
              <small>przykład</small>
            </div>
            <Wykres />
            <p>
              Pik 2,5 h: +7 vCPU i +4 GB RAM → dopłata <strong className="mint">{PRZYKLAD} zł</strong>
            </p>
          </div>
          <Steps items={KROKI} />
          <div className="duo">
            <Card>
              <h3>Co zyskujesz?</h3>
              <ul className="gains">
                {ZYSKI.map(([b, t]) => (
                  <li key={b}>
                    <Ptaszek />
                    <div>
                      <strong>{b}</strong> {t}
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
            <Card className="rates">
              <p className="kicker kicker-stone">Stawki brutto, jawne</p>
              <dl>
                <div>
                  <dt>1% CPU przez godzinę</dt>
                  <dd>0,001323 zł</dd>
                </div>
                <div>
                  <dt>1 GB RAM przez godzinę</dt>
                  <dd>0,0882 zł</dd>
                </div>
                <div>
                  <dt>1 GB dysku przez godzinę</dt>
                  <dd>0,0008 zł</dd>
                </div>
              </dl>
              <p>
                Przykład: dodatkowe 7 vCPU i 4 GB RAM przez 2,5 godziny kampanii to{' '}
                <strong className="mint">{PRZYKLAD} zł</strong>.
              </p>
              <Link href="/hosting#kalkulator">Policz dopłatę za pik →</Link>
            </Card>
          </div>
        </div>
      </section>

      {/* PANEL */}
      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead
            center
            eyebrow="Panel Verris"
            title="Wszystko pod kontrolą w jednym panelu"
            lead="Strony, poczta, domeny, kopie i WordPress — po polsku, bez technicznego żargonu. Bez zgłoszeń do supportu na każdą drobnostkę."
          />
          {/* Makieta pulpitu w HTML/CSS. TODO: zrzut z konta demo (bez danych osobowych), przełączany kartami. */}
          <div className="dash" role="img" aria-label="Przykładowy pulpit panelu Verris: zajętość dysku i RAM, ostatnia kopia, SSL, WordPress ze stagingiem i poczta.">
            <div className="dash-tabs" aria-hidden="true">
              <span className="on">Pulpit</span>
              <span>Kopie zapasowe</span>
              <span>WordPress</span>
              <span>Poczta</span>
              <span>Domeny i DNS</span>
            </div>
            <div className="card dash-win">
              <div className="dash-side">
                <b>verris</b>
                {['Pulpit', 'Strony WWW', 'WordPress', 'Poczta', 'Domeny', 'Kopie zapasowe', 'Autoskalowanie', 'Portfel'].map((m, i) => (
                  <span key={m} className={i === 0 ? 'on' : undefined}>
                    {m}
                  </span>
                ))}
              </div>
              <div className="dash-main">
                <div className="mock-head">
                  <div>
                    <b className="dash-hi">Dzień dobry</b>
                    <small>twoja-strona.pl · wszystko działa</small>
                  </div>
                  <span className="chip chip-sm">● Strona online</span>
                </div>
                <div className="dash-tiles">
                  <div>
                    <small>Dysk</small>
                    <b>12,4 / 50 GB</b>
                    <i>
                      <span style={{ width: '25%' }} />
                    </i>
                  </div>
                  <div className="dash-opt">
                    <small>RAM teraz</small>
                    <b>1,8 / 8 GB</b>
                    <i>
                      <span style={{ width: '22%' }} />
                    </i>
                  </div>
                  <div>
                    <small>Ostatnia kopia</small>
                    <b>dziś, 03:12</b>
                    <em>Przywróć plik lub bazę →</em>
                  </div>
                  <div>
                    <small>SSL</small>
                    <b>Aktywny</b>
                    <em className="stone">odnawia się sam</em>
                  </div>
                </div>
                <div className="dash-rows">
                  <div>
                    <b>WordPress</b>
                    <p>
                      <span>twoja-strona.pl</span>
                      <span className="mint">aktualny</span>
                    </p>
                    <p>
                      <span>staging.twoja-strona.pl</span>
                      <span className="stone">kopia testowa</span>
                    </p>
                  </div>
                  <div className="dash-opt">
                    <b>Poczta</b>
                    <p>
                      <span>sklep@twoja-strona.pl</span>
                      <span>0,4 / 1 GB</span>
                    </p>
                    <p>
                      <span>Webmail</span>
                      <span className="mint">logowanie z panelu</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* KONKRETY */}
      <section className="sec">
        <div className="wrap">
          <SectionHead
            eyebrow="Specyfikacja w skrócie"
            title="Konkrety, nie obietnice"
            lead="Każdy punkt ma pokrycie w specyfikacji usługi i regulaminie."
          />
          <div className="grid3 tylko-szeroki">
            {KONKRETY.map((g) => (
              <Card key={g.title}>
                <h3>{g.title}</h3>
                <ul className="facts">
                  {g.items.map((i) => (
                    <li key={i.t}>
                      <strong>{i.t}</strong>
                      <span>{i.d}</span>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          <Accordion
            className="tylko-telefon"
            items={KONKRETY.map((g, n) => ({
              title: g.title,
              open: n === 0,
              body: (
                <ul className="facts">
                  {g.items.map((i) => (
                    <li key={i.t}>
                      <strong>{i.t}</strong> — {i.d}
                    </li>
                  ))}
                </ul>
              ),
            }))}
          />
          {SPECYFIKACJA_OPUBLIKOWANA && (
            <p className="center-cta">
              <Button href="/specyfikacja" variant="ghost">
                Pełna specyfikacja techniczna →
              </Button>
            </p>
          )}
        </div>
      </section>

      {/* CENNIK */}
      <Pricing />

      {/* MIGRACJA */}
      <section className="sec" id="migracja">
        <div className="wrap split">
          <div>
            <SectionHead
              eyebrow="Przeprowadzka"
              title="Przenosimy stronę za Ciebie. Za darmo."
              lead="Pliki, bazy danych i poczta — bez przerwy w działaniu strony. Wolisz sam? W panelu czeka migrator krok po kroku."
            />
            <Button href="/przenies-strone" cta="migracja" className="tylko-szeroki">
              Zleć bezpłatną migrację
            </Button>
          </div>
          <div>
            <Steps items={MIGRACJA} variant="lista" />
            <Button href="/przenies-strone" cta="migracja" className="tylko-telefon btn-block">
              Zleć bezpłatną migrację
            </Button>
          </div>
        </div>
      </section>

      {/* PORÓWNANIE */}
      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead eyebrow="Porównanie" title="Na co patrzeć przy wyborze hostingu" />
          <table className="cmp2">
            <thead>
              <tr>
                <th scope="col">Na co patrzysz</th>
                <th scope="col">Typowy hosting</th>
                <th scope="col">Verris</th>
              </tr>
            </thead>
            <tbody>
              {POROWNANIE.map(([k, inni, my]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td data-label="Typowy hosting">{inni}</td>
                  <td data-label="Verris" className="vr">
                    {my}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="Pytania" title="Częste pytania" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Twoja strona zasługuje na hosting bez pułapek"
        text="Zamawiasz online, a migrację robimy za Ciebie."
        secondary={{ label: 'Porozmawiaj z nami', href: '/kontakt' }}
      />
      <StickyBuy />
    </main>
  );
}

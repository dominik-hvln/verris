import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { VPS_W_SPRZEDAZY } from '@/lib/oferta';
import { faqSchema, graph, guideSchema, itemListSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

/*
 * Przewodnik-filar (makieta 14.10, plansza JakWybrac). Tabele tylko z faktów ogólnych i z faktów o Verris
 * potwierdzonych w lib/ i na obecnych stronach — bez nazw i cen konkurentów.
 */
const TYTUL = 'Jak wybrać hosting? Lista 10 pytań przed zakupem | Verris';
const OPIS =
  'Jak wybrać hosting dla strony firmowej lub sklepu: cena za 3 lata, kopie, limity, SLA, RODO. Lista kontrolna i tabela parametrów bez marketingu.';
const OPUBLIKOWANO = '2026-10-14';
const ZAKTUALIZOWANO = '2026-10-14';
const ZAKTUALIZOWANO_TEKST = '14 października 2026';

export const metadata: Metadata = {
  title: TYTUL,
  description: OPIS,
  alternates: { canonical: '/jak-wybrac-hosting' },
  openGraph: {
    title: 'Jak wybrać hosting i nie żałować za rok',
    description: OPIS,
    url: 'https://verris.pl/jak-wybrac-hosting',
    locale: 'pl_PL',
    type: 'article',
    siteName: 'Verris',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Jak wybrać hosting — przewodnik Verris' }],
  },
};

const RODZAJE: [string, string, string][] = [
  ['Wizytówka firmy', 'hosting współdzielony', 'poczta i kopie w cenie; nie przepłacaj za moc, której strona nie używa'],
  ['Blog, strona z treściami', 'hosting z szybkim serwerem', 'pamięć podręczna, aktualne PHP 8, dyski NVMe'],
  ['Sklep internetowy', 'hosting z zapasem mocy w szczytach', 'RAM, Redis i to, co się dzieje przy dużym ruchu'],
  ['Kilka stron klientów', 'hosting bez limitu stron albo program dla agencji', 'izolacja kont, jeden panel do wszystkich stron'],
  ['Aplikacja, własne usługi', 'serwer VPS z dostępem root', 'serwerem administrujesz sam — aktualizacje i bezpieczeństwo są po Twojej stronie'],
];

const PYTANIA: [string, string][] = [
  ['Ile zapłacę za 3 lata?', 'Pierwszy rok plus dwa odnowienia. Dopiero ta liczba pozwala uczciwie porównać oferty.'],
  ['Czy kopie są codzienne i czy sam je przywrócę?', 'Kopia, której nie da się szybko przywrócić bez zgłoszenia, niewiele daje w kryzysie.'],
  ['Czy przeprowadzka jest w cenie?', 'Część dostawców liczy przeniesienie strony osobno — zapytaj przed zakupem.'],
  ['Jakie są limity?', '„Bez limitu” zawsze ma jakiś limit. Szukaj liczb: RAM, CPU, procesy, miejsce na dysku.'],
  ['Co się stanie przy dużym ruchu?', 'Strona zwolni, przestanie działać czy dostanie więcej mocy — i ile to kosztuje?'],
  ['Czy SSL jest w cenie także przy odnowieniu?', 'Darmowy certyfikat Let’s Encrypt wystarczy większości firmowych stron i sklepów.'],
  ['Czy dostępność jest w umowie?', 'SLA z rekompensatą zapisaną w regulaminie to coś innego niż procent na banerze.'],
  ['Jak wygląda pomoc?', 'Kto odpowiada, którędy (zgłoszenie, mail, telefon) i w jakim języku.'],
  ['Czy domena odnawia się sama?', 'Sprawdź, czy o odnowieniu decydujesz Ty, czy karta zostanie obciążona automatycznie.'],
  ['Czy dostanę umowę powierzenia (RODO)?', 'Firma potrzebuje jej, gdy na stronie są dane klientów — formularze, zamówienia, konta.'],
];

const PARAMETRY: [string, string][] = [
  ['Dyski NVMe', 'Szybsze od zwykłych dysków SSD. Najbardziej odczuwa to baza danych sklepu i panel WordPressa.'],
  ['Serwer WWW', 'Wydajny serwer (np. LiteSpeed albo nginx) z pamięcią podręczną stron obsłuży więcej odwiedzin na tych samych zasobach.'],
  ['Wersja PHP', 'Szukaj aktualnego PHP 8.x i możliwości wyboru wersji dla każdej strony osobno.'],
  ['Pamięć podręczna', 'Redis albo Memcached przyspieszają WordPressa i WooCommerce, odciążając bazę danych.'],
  ['Izolacja kont', 'Gdy sąsiad na serwerze ma problem, Twoja strona nie powinna tego odczuć.'],
  ['Lokalizacja danych', 'Dla firm w Polsce najprościej, gdy dane zostają w Unii Europejskiej.'],
];

const VERRIS: [string, string][] = [
  ['Cena za 3 lata', '3 × 449 zł = 1347 zł brutto przy dzisiejszym cenniku — ta sama cena przy odnowieniu'],
  ['Kopie', 'codziennie: 7 ostatnich na serwerze i kopia z każdego z 30 ostatnich dni poza serwerem; przywracasz sam w panelu'],
  ['Przeprowadzka', 'w cenie — robi ją kreator w panelu albo nasz zespół'],
  ['Limity', '50 GB NVMe, 8 GB RAM, 2 vCPU; z autoskalowaniem do 1000 GB, 64 GB RAM i 24 vCPU'],
  ['Duży ruch', 'autoskalowanie rozliczane w blokach po 15 minut, z limitem kosztu, który ustawiasz sam'],
  ['Dostępność', 'SLA 99,5% w miesiącu; rekompensata na wniosek od 5% do 100% opłaty, zapisana w regulaminie'],
  ['SSL', 'Let’s Encrypt w cenie, także wildcard, odnawiany automatycznie'],
  ['Domeny', 'bez automatycznych odnowień — przypomnienia 30, 14 i 7 dni przed wygaśnięciem'],
  ['RODO', 'umowa powierzenia do akceptacji w panelu, dane w UE'],
];

const FAQ: [string, string][] = [
  [
    'Jaki hosting wybrać na początek?',
    'Dla strony firmowej lub bloga wystarczy hosting współdzielony z codziennymi kopiami, SSL w cenie i szybkim serwerem. VPS ma sens dopiero wtedy, gdy potrzebujesz własnej konfiguracji serwera i umiesz nim administrować.',
  ],
  [
    'Ile powinien kosztować dobry hosting?',
    'Licz koszt za 3 lata razem z odnowieniami i porównuj oferty na tej samej liczbie, a nie na cenie z banera. Sprawdź też, co jest w cenie: kopie, SSL, poczta, przeniesienie strony.',
  ],
  [
    'Czy tani hosting jest zły?',
    'Nie musi. Ważne, czy cena zostaje taka sama przy odnowieniu i co jest w niej zawarte.',
  ],
  [
    'Czy lokalizacja serwera ma znaczenie?',
    'Dla szybkości ważne, by serwer był blisko odwiedzających, czyli w Europie. Dla RODO najprościej, gdy dane zostają w Unii Europejskiej.',
  ],
  [
    'Czym różni się hosting współdzielony od VPS?',
    'Na hostingu współdzielonym serwerem zarządza dostawca, a Ty zajmujesz się stroną. Na VPS dostajesz własny serwer wirtualny z dostępem root i sam odpowiadasz za jego konfigurację, aktualizacje i bezpieczeństwo.',
  ],
];

const jsonLd = graph(
  guideSchema({
    title: 'Jak wybrać hosting i nie żałować za rok',
    description: OPIS,
    path: '/jak-wybrac-hosting',
    datePublished: OPUBLIKOWANO,
    dateModified: ZAKTUALIZOWANO,
  }),
  itemListSchema(
    'Lista kontrolna: 10 pytań przed zakupem hostingu',
    PYTANIA.map(([q]) => q),
  ),
  faqSchema(FAQ),
);

export default function Page() {
  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="b-hero">
            <Breadcrumbs items={[{ label: 'Jak wybrać hosting' }]} />
            <span className="eyebrow">Przewodnik</span>
            <h1>
              Jak wybrać hosting <span className="mint">i nie żałować za rok</span>
            </h1>
            <p className="lead">
              Na rynku są dziesiątki ofert, które wyglądają prawie tak samo. Ten przewodnik pomoże Ci w kwadrans odsiać
              obietnice od faktów — niezależnie od tego, czy wybierzesz nas.
            </p>
            <div className="hero2-cta">
              <Button href="#lista" cta="hero-lista">
                Przejdź do listy kontrolnej
              </Button>
              <Button href="/cennik" variant="ghost" cta="hero-cennik">
                Zobacz nasz cennik
              </Button>
            </div>
            <p className="hero2-fine">
              Aktualizacja: <time dateTime={ZAKTUALIZOWANO}>{ZAKTUALIZOWANO_TEKST}</time>
            </p>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap narrow">
          <div className="b-odpowiedz">
            <p>Odpowiedź w 30 sekund</p>
            <p>
              Dobry hosting dla firmowej strony albo małego sklepu ma tę samą cenę przy odnowieniu, codzienne kopie z łatwym
              przywracaniem, SSL w cenie, szybki serwer (dyski NVMe, aktualne PHP, pamięć podręczna), jawne limity i
              dostępność zapisaną w umowie razem z rekompensatą.
            </p>
          </div>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-potrzeby">
        <div className="wrap">
          <SectionHead id="b-potrzeby" eyebrow="Krok 1" title="Najpierw: czego potrzebuje Twoja strona?" />
          <div className="b-tabela">
            <table>
              <thead>
                <tr>
                  <th scope="col">Rodzaj strony</th>
                  <th scope="col">Co wybrać</th>
                  <th scope="col">Na co uważać</th>
                </tr>
              </thead>
              <tbody>
                {RODZAJE.map(([r, co, uwaga]) => (
                  <tr key={r}>
                    <th scope="row">{r}</th>
                    <td>{co}</td>
                    <td>{uwaga}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="b-przypis">
            Więcej o hostingu pod konkretne zastosowania: <Link href="/hosting/wordpress">hosting WordPress</Link>,{' '}
            <Link href="/hosting/sklep">hosting dla sklepu</Link>, <Link href="/reseller">program dla agencji</Link>
            {VPS_W_SPRZEDAZY ? (
              <>
                , <Link href="/vps">serwery VPS</Link>
              </>
            ) : null}
            .
          </p>
        </div>
      </section>

      <section className="sec" id="lista" aria-labelledby="b-lista">
        <div className="wrap narrow">
          <SectionHead
            id="b-lista"
            eyebrow="Krok 2"
            title="Lista kontrolna: 10 pytań przed zakupem"
            lead="Zadaj je każdemu dostawcy, którego rozważasz — także nam."
          />
          <ol className="b-kroki">
            {PYTANIA.map(([q, a], i) => (
              <li key={q}>
                <span className="b-kroki-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{q}</h3>
                  <p>{a}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-parametry">
        <div className="wrap">
          <SectionHead id="b-parametry" eyebrow="Krok 3" title="Parametry techniczne bez tajemnic" />
          <div className="b-grid3">
            {PARAMETRY.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="b-verris">
        <div className="wrap narrow">
          <SectionHead
            id="b-verris"
            eyebrow="Dla porównania"
            title="Jak wypada Verris na tle tej listy"
            lead="Każda odpowiedź ma pokrycie w specyfikacji albo w regulaminie."
          />
          <table className="cmp2 b-cmp1">
            <thead>
              <tr>
                <th scope="col">Pytanie</th>
                <th scope="col">Verris</th>
              </tr>
            </thead>
            <tbody>
              {VERRIS.map(([k, v]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td data-label="Verris" className="vr">
                    {v}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="b-przypis">
            Celowo nie porównujemy cen innych firm — zmieniają się często. Użyj listy kontrolnej i sprawdź je sam.
            Szczegóły znajdziesz w <Link href="/specyfikacja">specyfikacji</Link>, opisie{' '}
            <Link href="/funkcje/kopie-zapasowe">kopii zapasowych</Link> i <Link href="/funkcje/sla">SLA</Link>, a o
            darmowym przeniesieniu strony przeczytasz na stronie <Link href="/przenies-strone">przeprowadzki</Link>.
          </p>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Najczęstsze pytania o wybór hostingu" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="updated">
            Ostatnia aktualizacja: <time dateTime={ZAKTUALIZOWANO}>{ZAKTUALIZOWANO_TEKST}</time>
          </p>
        </div>
      </section>

      <CTABand
        title="Sprawdziłeś listę? Sprawdź nas w praktyce"
        text="45 zł/mies albo 449 zł/rok brutto, przeniesienie strony w cenie. Z odnowienia zrezygnujesz w panelu w dwóch kliknięciach."
        primaryHref={ZAMOW}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
    </main>
  );
}

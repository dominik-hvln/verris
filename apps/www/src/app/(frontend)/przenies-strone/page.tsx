import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy, Steps } from '../components/ui';
import { KalkulatorPiku } from '../components/KalkulatorPiku';
import { Pricing } from '../components/Pricing';
import { MigrationLeadForm } from '../components/MigrationLeadForm';
import { KROKI_MIGRACJI } from '@/lib/migracja';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Zmiana hostingu bez stresu — darmowa migracja strony | Verris',
  description:
    'Przeniesiemy Twoją stronę i pocztę za darmo — albo zrobisz to sam migratorem w panelu. Odnowienie po cenie z cennika: 45 zł/mies lub 449 zł/rok brutto. Autoskalowanie zamiast pakietu na zapas, SLA 99,5% z rekompensatami.',
  alternates: { canonical: '/przenies-strone' },
  openGraph: {
    title: 'Zmiana hostingu bez stresu — przeniesiemy Twoją stronę za darmo',
    description:
      'Darmowa migracja strony i poczty. Odnowienie po cenie z cennika: 45 zł/mies lub 449 zł/rok brutto, bez szoku po pierwszym roku. Autoskalowanie zamiast pakietu na zapas.',
    url: 'https://verris.pl/przenies-strone',
    locale: 'pl_PL',
    type: 'website',
    siteName: 'Verris',
    images: [
      { url: '/og-default.png', width: 1200, height: 630, alt: 'Verris — darmowa migracja hostingu' },
    ],
  },
};

const FAQ: [string, string][] = [
  ['Czy strona przestanie działać w trakcie przenoszenia na inny hosting?', 'Nie powinna. Migracja odbywa się „obok" działającej strony — kopiujemy dane na nowy serwer, a Twoja obecna strona działa u dotychczasowego dostawcy do momentu przełączenia domeny. Samo przełączenie DNS wiąże się z propagacją, która zwykle trwa od kilkunastu minut do kilku godzin; w tym czasie część odwiedzających może jeszcze trafiać na starą wersję strony.'],
  ['Czy przeniesienie strony wpłynie na pozycje w Google?', 'Sama zmiana hostingu nie zmienia adresów URL ani treści strony, więc poprawnie przeprowadzona migracja nie powoduje utraty pozycji. Krótkie wahania w trakcie propagacji DNS są możliwe, ale ustępują samoistnie. Szybszy i stabilniejszy serwer może wręcz pomóc — czas ładowania strony jest jednym z czynników rankingowych.'],
  ['Jak przenieść stronę WordPress na inny hosting?', 'Przeniesienie WordPressa to skopiowanie plików, bazy danych i konfiguracji na nowy serwer. W Verris zrobi to za Ciebie zespół w ramach darmowej migracji — wystarczy przekazać dostępy do obecnego hostingu. Możesz też użyć migratora w panelu, który przeniesie pliki i bazę samodzielnie, krok po kroku.'],
  ['Czy muszę przenosić domenę razem z hostingiem?', 'Nie. Domena może zostać u obecnego rejestratora — wystarczy zmienić rekordy DNS tak, aby wskazywały na serwery Verris. Transfer domeny do Verris jest opcjonalny i możesz go wykonać w dowolnym momencie później. U nas domeny odnawiają się wyłącznie po opłaceniu — nigdy automatycznie.'],
  ['Jak działa autoskalowanie i ile kosztuje?', 'W cenie pakietu masz bazowe zasoby. Gdy strona potrzebuje więcej — np. w piku kampanii — zasoby rosną automatycznie, a dodatkowa moc rozliczana jest godzinowo, tylko za czas faktycznego użycia. Gdy ruch spada, autoskalowanie wraca do bazy i naliczanie się kończy. Orientacyjny koszt policzysz w kalkulatorze powyżej.'],
  ['Co z pocztą e-mail przy zmianie hostingu?', 'Hosting Verris obejmuje pocztę (webmail Roundcube). W ramach migracji przenosimy również skrzynki — szczegóły zakresu ustalimy przy przekazaniu dostępów. Do czasu przełączenia DNS poczta działa u obecnego dostawcy, więc żadna wiadomość nie ginie w trakcie przeprowadzki.'],
  ['Czy migracja jest naprawdę bezpłatna?', 'Tak. Zarówno migrator w panelu, jak i pomoc naszego zespołu są bezpłatne w ramach zamówienia hostingu. Nie ma limitu „do X plików" ani dopłat za bazy danych.'],
  ['Czy cena wzrośnie przy odnowieniu?', 'Nie stosujemy modelu „tani pierwszy rok, kilkukrotnie droższe odnowienie". Rabat na start, jeśli trwa, widzisz przed zapłatą, a odnowienie następuje według cennika obowiązującego w dniu odnowienia (dziś 45 zł/mies lub 449 zł/rok), a przed każdym odnowieniem wyślemy przypomnienie e-mail (7, 3 i 1 dzień wcześniej). Z odnowienia zrezygnujesz w panelu w dwóch kliknięciach, bez opłat.'],
  ['Czy mogę zrezygnować po zakupie?', 'Jako konsument masz prawo odstąpienia od umowy. Zasady odstąpienia i zwrotu opisuje regulamin, który zobaczysz przed zakupem — zwrot realizuje nasze wsparcie.'],
];

const COMPARE: [string, string, string][] = [
  ['Cena', 'Niska w pierwszym okresie, znacznie wyższa przy odnowieniu', 'Odnowienie po cenie z cennika — 45 zł/mies lub 449 zł/rok brutto'],
  ['Zasoby', 'Sztywne pakiety — płacisz za moc „na zapas" 24 h/dobę', 'Autoskalowanie godzinowe — dodatkowa moc tylko wtedy, gdy jest używana'],
  ['Odnowienia domen', 'Automatyczne obciążenie, czasem bez wyraźnej zgody', 'Nie odnowi się bez Twojej decyzji — przypomnienia 30, 14 i 7 dni przed wygaśnięciem'],
  ['Awarie', 'Rekompensata uznaniowa, jeśli w ogóle', 'SLA 99,5% i progi rekompensat zapisane w regulaminie — przyznajemy je na Twoje zgłoszenie'],
  ['Przywrócenie kopii', 'Zgłoszenie do supportu, czasem płatne, bez możliwości cofnięcia', 'Samodzielnie w panelu — wybierasz pliki, bazę lub pocztę, a system domyślnie robi kopię bezpieczeństwa przed operacją'],
  ['Rezygnacja', 'Ukryte kroki, konsultant „zatrzymujący"', 'Rezygnacja z odnowienia w panelu w dwóch kliknięciach, bez opłat'],
];


const PULAPKI: { tag: string; t: string; opis: string; fix: string }[] = [
  {
    tag: 'Pułapka nr 1',
    t: 'Promocja-przynęta',
    opis: 'Pierwszy rok za grosze, a przy odnowieniu pełna stawka — często kilkukrotnie wyższa. Rachunek przychodzi po roku, kiedy przenosiny wydają się trudniejsze niż dopłata.',
    fix: 'odnowienie idzie po cenie z cennika — 45 zł/mies lub 449 zł/rok brutto. Rabat na start, jeśli trwa, widzisz przed zapłatą; po nim nie ma skoku do kilkuset złotych.',
  },
  {
    tag: 'Pułapka nr 2',
    t: 'Pakiet na zapas',
    opis: 'Kupujesz większy pakiet „na wszelki wypadek” — i przez większość roku płacisz za moc, której strona nie używa. Nadpłacony zapas nie wraca.',
    fix: 'jedna baza + autoskalowanie rozliczane godzinowo. Dodatkowe zasoby tylko wtedy, gdy strona ich naprawdę potrzebuje — a gdy ruch spada, wracają do bazy.',
  },
  {
    tag: 'Pułapka nr 3',
    t: 'Cicha dopłata',
    opis: 'Automatyczne odnowienia domen i dodatków, o których dowiadujesz się z obciążenia karty. Rezygnacja? Przez konsultanta, który „ma dla Ciebie lepszą ofertę”.',
    fix: 'domena nie odnowi się bez Twojej decyzji (przypomnienia 30/14/7 dni), a z odnowienia subskrypcji zrezygnujesz w panelu w dwóch kliknięciach.',
  },
];

const PARAMETRY: [string, string][] = [
  ['0 zł', 'migracja strony i poczty'],
  ['Bez limitu', 'stron i skrzynek'],
  ['SLA 99,5%', 'rekompensata na zgłoszenie'],
  ['BLIK i karta', 'także przelew online'],
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: 'Hosting Verris z autoskalowaniem — darmowa migracja',
      description:
        'Hosting współdzielony z autoskalowaniem i darmową migracją strony oraz poczty. Baza: 50 GB NVMe, do 8 GB RAM, do 2 vCPU. SLA 99,5% z rekompensatami.',
      brand: { '@type': 'Organization', name: 'Verris' },
      offers: [
        { '@type': 'Offer', price: '45.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', url: 'https://verris.pl/przenies-strone', description: 'Rozliczenie miesięczne, cena brutto' },
        { '@type': 'Offer', price: '449.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', url: 'https://verris.pl/przenies-strone', description: 'Rozliczenie roczne, cena brutto' },
      ],
    },
    {
      '@type': 'HowTo',
      name: 'Jak przenieść stronę na inny hosting bez przestoju',
      description: 'Przeniesienie strony do Verris w trzech krokach, bez przerwy w działaniu.',
      step: KROKI_MIGRACJI.map((s, i) => ({ '@type': 'HowToStep', position: i + 1, name: s.title, text: s.text })),
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map(([q, a]) => ({ '@type': 'Question', name: q, acceptedAnswer: { '@type': 'Answer', text: a } })),
    },
  ],
};


export default function Page() {
  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="hero2-grid">
            <div>
              <Breadcrumbs items={[{ label: 'Przenieś stronę' }]} />
              <h1>
                Zmiana hostingu bez stresu <span className="mint">i bez przepłacania</span>
              </h1>
              <p className="lead">
                Przeniesiemy Twoją stronę za darmo — albo zrobisz to sam migratorem w panelu. Uczciwe odnowienie po cenie
                z cennika — bez szoku po pierwszym roku.
              </p>
              <div className="hero2-cta">
                <Button href={PANEL} cta="hero" conv="checkout_intent" plan="hosting">
                  Przenieś stronę za darmo
                </Button>
                <Button href="#kalkulator" variant="ghost" cta="hero-calc">
                  Policz koszt autoskalowania
                </Button>
              </div>
              <p className="hero2-fine">
                Hosting z autoskalowaniem: <strong>45 zł/mies</strong> lub <strong>449 zł/rok</strong> brutto. Migracja jest
                bezpłatna w ramach zamówienia — bez gwiazdek.
              </p>
            </div>
            <Card className="incl">
              <h2 className="incl-h">Przykład: migracja twojafirma.pl</h2>
              <dl>
                <div>
                  <dt>Pliki strony</dt>
                  <dd>1,2 GB ✓</dd>
                </div>
                <div>
                  <dt>Bazy danych</dt>
                  <dd>2 bazy ✓</dd>
                </div>
                <div>
                  <dt>Skrzynki e-mail</dt>
                  <dd>5 kont ✓</dd>
                </div>
                <div>
                  <dt>Przełączenie DNS</dt>
                  <dd>gdy potwierdzisz</dd>
                </div>
              </dl>
              <p className="incl-peak">Twoja obecna strona cały czas działa</p>
            </Card>
          </div>
          <ul className="params">
            {PARAMETRY.map(([b, s]) => (
              <li key={b}>
                <b>{b}</b>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="przeplacasz">
        <div className="wrap">
          <SectionHead
            eyebrow="Sprawdź swoją fakturę"
            title="Za co dziś przepłacasz u swojego dostawcy hostingu?"
            lead="Rynek hostingu ma trzy sprawdzone sposoby na Twoje pieniądze. Wszystkie są legalne. Żaden nie jest uczciwy. Zbudowaliśmy Verris tak, żeby nie dało się na nich zarabiać."
          />
          <div className="grid3">
            {PULAPKI.map((p) => (
              <Card key={p.t}>
                <p className="kicker kicker-stone">{p.tag}</p>
                <h3>{p.t}</h3>
                <p>{p.opis}</p>
                <p className="pain-fix">
                  <strong>W Verris:</strong> {p.fix}
                </p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap split">
          <SectionHead
            eyebrow="Kalkulator autoskalowania"
            title="Nie kupuj mocy na zapas. Policz, ile kosztuje moc na godziny."
            lead="Podstawa to cały hosting w ramach abonamentu. Gdy strona potrzebuje więcej — np. w piku kampanii reklamowej albo w Black Friday — zasoby rosną automatycznie, a Ty płacisz tylko za nadwyżkę, w blokach po 15 minut."
          />
          <KalkulatorPiku />
        </div>
      </section>

      <section className="sec" id="jak-to-dziala">
        <div className="wrap">
          <SectionHead
            eyebrow="Jak to działa"
            title="Jak przenieść stronę na inny hosting — w 3 krokach, bez przestoju"
            lead="Przeniesienie strony nie wymaga wiedzy technicznej ani przerwy w działaniu. Migracja odbywa się „obok” działającej strony, a Ty przełączasz się dopiero wtedy, gdy wszystko jest sprawdzone."
          />
          <Steps items={KROKI_MIGRACJI} />
        </div>
      </section>

      {/* Lead — wejście do sekwencji e-mail (zgoda i double opt-in w MigrationLeadForm) */}
      <section className="sec">
        <div className="wrap">
          <MigrationLeadForm />
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead
            eyebrow="Uczciwe zasady"
            title="Czym Verris różni się od typowego hostingu?"
            lead="Konkrety zamiast deklaracji — każdy punkt po stronie Verris ma pokrycie w regulaminie albo w specyfikacji usługi."
          />
          <table className="cmp2">
            <thead>
              <tr>
                <th scope="col">Obszar</th>
                <th scope="col">Typowy model rynkowy</th>
                <th scope="col">Verris</th>
              </tr>
            </thead>
            <tbody>
              {COMPARE.map(([k, inni, my]) => (
                <tr key={k}>
                  <th scope="row">{k}</th>
                  <td data-label="Typowy model rynkowy">{inni}</td>
                  <td data-label="Verris" className="vr">
                    {my}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Pricing />

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Częste pytania o przeniesienie strony" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="updated">Ostatnia aktualizacja: 8 lipca 2026</p>
        </div>
      </section>

      <CTABand
        title="Twoja strona zasługuje na hosting bez pułapek."
        text="Zamów hosting, przekaż dostępy — resztą przeprowadzki zajmiemy się my. Za 0 zł."
        primaryLabel="Przenieś stronę za darmo"
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <StickyBuy />
    </main>
  );
}

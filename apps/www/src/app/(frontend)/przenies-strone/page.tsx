import type { Metadata } from 'next';
import { ShieldCheck, Boxes, CreditCard, Database, Check } from 'lucide-react';
import { Pricing } from '../components/Pricing';
import { CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';
import { MigrationCalculator } from '../components/MigrationCalculator';
import { MigrationLeadForm } from '../components/MigrationLeadForm';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Zmiana hostingu bez stresu — darmowa migracja strony | Verris',
  description:
    'Przeniesiemy Twoją stronę i pocztę za darmo — albo zrobisz to sam migratorem w panelu. Jedna cena bez promocji-przynęty: 45 zł/mies lub 399 zł/rok brutto. Autoskalowanie zamiast pakietu na zapas, SLA 99,5% z rekompensatami.',
  alternates: { canonical: '/przenies-strone' },
  openGraph: {
    title: 'Zmiana hostingu bez stresu — przeniesiemy Twoją stronę za darmo',
    description:
      'Darmowa migracja strony i poczty. Jedna cena: 45 zł/mies lub 399 zł/rok brutto, bez szoku przy odnowieniu. Autoskalowanie zamiast pakietu na zapas.',
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
  ['Jak działa autoskalowanie i ile kosztuje?', 'W cenie pakietu masz bazowe zasoby. Gdy strona potrzebuje więcej — np. w piku kampanii — zasoby rosną automatycznie, a dodatkowa moc rozliczana jest godzinowo, tylko za czas faktycznego użycia. Gdy ruch spada, tryb ECO zwalnia zasoby i naliczanie się kończy. Orientacyjny koszt policzysz w kalkulatorze powyżej.'],
  ['Co z pocztą e-mail przy zmianie hostingu?', 'Hosting Verris obejmuje pocztę (webmail Roundcube). W ramach migracji przenosimy również skrzynki — szczegóły zakresu ustalimy przy przekazaniu dostępów. Do czasu przełączenia DNS poczta działa u obecnego dostawcy, więc żadna wiadomość nie ginie w trakcie przeprowadzki.'],
  ['Czy migracja jest naprawdę bezpłatna?', 'Tak. Zarówno migrator w panelu, jak i pomoc naszego zespołu są bezpłatne w ramach zamówienia hostingu. Nie ma limitu „do X plików" ani dopłat za bazy danych.'],
  ['Czy cena wzrośnie przy odnowieniu?', 'Nie stosujemy modelu „tani pierwszy rok, drogie odnowienie" — cena z cennika obowiązuje od pierwszego dnia. Odnowienie następuje według cennika obowiązującego w dniu odnowienia, a przed każdym odnowieniem wyślemy przypomnienie e-mail (7 dni przy rozliczeniu rocznym, 3 dni przy miesięcznym). Odnawianie możesz wyłączyć w panelu w każdej chwili, bez opłat.'],
  ['Czy mogę zrezygnować po zakupie?', 'Jako konsument masz prawo odstąpienia od umowy. Jeśli usługa została aktywowana od razu na Twoje życzenie, opłata jest rozliczana proporcjonalnie do wykorzystanego okresu. Szczegóły znajdziesz w regulaminie przed zakupem.'],
];

const STEPS: [string, string, string][] = [
  ['01', 'Zamów hosting Verris', 'Załóż konto i wybierz rozliczenie — 45 zł/mies lub 399 zł/rok brutto. Płatność kartą, BLIK-iem, Apple Pay, Google Pay albo przelewem online. Twoja obecna strona dalej działa.'],
  ['02', 'Wybierz sposób migracji', 'Przekaż dostępy do obecnego hostingu, a my bezpłatnie przeniesiemy pliki, bazy danych i pocztę. Wolisz mieć wszystko pod kontrolą? Uruchom darmowy migrator w panelu.'],
  ['03', 'Przełącz DNS i gotowe', 'Sprawdzasz stronę na nowym serwerze, zmieniasz rekordy DNS — i to wszystko. Stara strona działa do momentu przełączenia, więc odwiedzający nie zobaczą żadnej przerwy.'],
];

const COMPARE: [string, string, string][] = [
  ['Cena', 'Niska w pierwszym okresie, znacznie wyższa przy odnowieniu', 'Jedna cena z cennika od pierwszego dnia — 45 zł/mies lub 399 zł/rok brutto'],
  ['Zasoby', 'Sztywne pakiety — płacisz za moc „na zapas" 24 h/dobę', 'Autoskalowanie godzinowe — dodatkowa moc tylko wtedy, gdy jest używana'],
  ['Odnowienia domen', 'Automatyczne obciążenie, czasem bez wyraźnej zgody', 'Wyłącznie po opłaceniu — przypomnienia 30, 14 i 7 dni przed wygaśnięciem'],
  ['Awarie', 'Rekompensata po reklamacji, jeśli w ogóle', 'SLA 99,5% z automatycznymi rekompensatami zapisanymi w regulaminie'],
  ['Przywrócenie kopii', 'Zgłoszenie do supportu, czasem płatne, bez możliwości cofnięcia', 'Samodzielnie w panelu — wybierasz pliki, bazę lub pocztę, a system domyślnie robi kopię bezpieczeństwa przed operacją'],
  ['Rezygnacja', 'Ukryte kroki, konsultant „zatrzymujący"', 'Wyłączenie odnowienia jednym przełącznikiem w panelu, bez opłat'],
];

const jsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Product',
      name: 'Hosting Verris z autoskalowaniem — darmowa migracja',
      description:
        'Hosting współdzielony na DirectAdmin z autoskalowaniem i darmową migracją strony oraz poczty. Baza: 50 GB NVMe, do 8 GB RAM, do 2 vCPU. SLA 99,5% z rekompensatami.',
      brand: { '@type': 'Organization', name: 'Verris' },
      offers: [
        { '@type': 'Offer', price: '45.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', url: 'https://verris.pl/przenies-strone', description: 'Rozliczenie miesięczne, cena brutto' },
        { '@type': 'Offer', price: '399.00', priceCurrency: 'PLN', availability: 'https://schema.org/InStock', url: 'https://verris.pl/przenies-strone', description: 'Rozliczenie roczne, cena brutto' },
      ],
    },
    {
      '@type': 'HowTo',
      name: 'Jak przenieść stronę na inny hosting bez przestoju',
      description: 'Przeniesienie strony do Verris w trzech krokach, bez przerwy w działaniu.',
      step: STEPS.map(([n, name, text], i) => ({ '@type': 'HowToStep', position: i + 1, name, text })),
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* HERO */}
      <section className="lp-hero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap lp-hero-grid">
          <div>
            <span className="eyebrow">Darmowa migracja hostingu</span>
            <h1>
              Zmiana hostingu bez stresu <span className="accent">i bez przepłacania</span>.
            </h1>
            <p className="lead">
              Przeniesiemy Twoją stronę za darmo — albo zrobisz to sam migratorem w panelu. Jedna
              uczciwa cena od pierwszego dnia, bez promocji-przynęty i szoku przy odnowieniu.
            </p>
            <p className="note">
              Migracja jest bezpłatna w ramach zamówienia hostingu — bez gwiazdek i ukrytych warunków.
            </p>
            <div className="cta-row">
              <a className="btn btn-primary" href={PANEL} data-event="cta_click" data-cta="hero" data-conv="checkout_intent">
                Przenieś stronę za darmo
              </a>
              <a className="btn btn-ghost" href="#kalkulator" data-event="cta_click" data-cta="hero-calc">
                Policz koszt autoskalowania
              </a>
            </div>
            <p className="hero-price">
              Hosting z autoskalowaniem: <strong>45 zł/mies</strong> lub <strong>399 zł/rok</strong> brutto
            </p>
          </div>

          <div className="migration-card" role="img" aria-label="Podgląd migracji w panelu: pliki, bazy i skrzynki przeniesione, przełączenie DNS czeka na potwierdzenie">
            <div className="mc-head">
              <span className="mc-title">Migracja: twojafirma.pl</span>
              <span className="mc-badge">W toku</span>
            </div>
            {[
              ['Pliki strony', '1,2 GB'],
              ['Bazy danych', '2 bazy'],
              ['Skrzynki e-mail', '5 kont'],
            ].map(([lbl, val]) => (
              <div className="mc-row" key={lbl}>
                <span className="mc-ok" aria-hidden="true"><Check /></span>
                <span className="lbl">{lbl}</span>
                <span className="val">{val}</span>
              </div>
            ))}
            <div className="mc-row">
              <span className="mc-wait" aria-hidden="true" />
              <span className="lbl">Przełączenie DNS</span>
              <span className="val">gdy potwierdzisz</span>
            </div>
            <p className="mc-foot">
              <span className="dot" aria-hidden="true" />
              Twoja obecna strona cały czas działa
            </p>
          </div>
        </div>
      </section>

      {/* TRUST */}
      <div className="trust">
        <div className="wrap">
          <div className="row">
            <span><ShieldCheck /> Awaria? Rekompensata wraca sama</span>
            <span><Boxes /> Bez limitu stron i skrzynek</span>
            <span><CreditCard /> Płatność BLIK i kartą</span>
            {/* Brand-review: KSeF/„polski support" to standard, nie wyróżnik — mówimy korzyścią. */}
            <span><Database /> Cofniesz nieudaną aktualizację</span>
          </div>
        </div>
      </div>

      {/* ZA CO PRZEPŁACASZ */}
      <section id="przeplacasz">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Sprawdź swoją fakturę</p>
            <h2>Za co dziś przepłacasz u swojego dostawcy hostingu?</h2>
            <p>Rynek hostingu ma trzy sprawdzone sposoby na Twoje pieniądze. Wszystkie są legalne. Żaden nie jest uczciwy. Zbudowaliśmy Verris tak, żeby nie dało się na nich zarabiać.</p>
          </div>
          <div className="pains">
            <div className="pain-card rv">
              <span className="tag">Pułapka nr 1</span>
              <h3>Promocja-przynęta</h3>
              <p className="pain-desc">Pierwszy rok za grosze, a przy odnowieniu pełna stawka — często kilkukrotnie wyższa. Rachunek przychodzi po roku, kiedy przenosiny wydają się trudniejsze niż dopłata.</p>
              <p className="fix"><strong>W Verris:</strong> cena z cennika obowiązuje od pierwszego dnia — 45 zł/mies lub 399 zł/rok brutto. Bez skokowej podwyżki „po promocji", bo promocji-przynęty nie ma.</p>
            </div>
            <div className="pain-card rv">
              <span className="tag">Pułapka nr 2</span>
              <h3>Pakiet na zapas</h3>
              <p className="pain-desc">Kupujesz większy pakiet „na wszelki wypadek" — i przez większość roku płacisz za moc, której strona nie używa. Nadpłacony zapas nie wraca.</p>
              <p className="fix"><strong>W Verris:</strong> jedna baza + autoskalowanie rozliczane godzinowo. Dodatkowe zasoby tylko wtedy, gdy strona ich naprawdę potrzebuje — a tryb ECO zwalnia je, gdy ruch spada.</p>
            </div>
            <div className="pain-card rv">
              <span className="tag">Pułapka nr 3</span>
              <h3>Cicha dopłata</h3>
              <p className="pain-desc">Automatyczne odnowienia domen i dodatków, o których dowiadujesz się z obciążenia karty. Rezygnacja? Przez konsultanta, który „ma dla Ciebie lepszą ofertę".</p>
              <p className="fix"><strong>W Verris:</strong> domeny odnawiamy wyłącznie po opłaceniu (przypomnienia 30/14/7 dni), a odnowienie subskrypcji wyłączysz jednym przełącznikiem w panelu.</p>
            </div>
          </div>
        </div>
      </section>

      {/* KALKULATOR */}
      <section id="kalkulator" className="band">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Kalkulator autoskalowania</p>
            <h2>Nie kupuj mocy na zapas. Policz, ile kosztuje moc na godziny.</h2>
            <p>Podstawa to cały hosting w ramach abonamentu. Gdy strona potrzebuje więcej — np. w piku kampanii reklamowej albo w Black Friday — zasoby rosną automatycznie, a Ty płacisz godzinowo tylko za nadwyżkę.</p>
          </div>
          <div className="rv">
            <MigrationCalculator />
          </div>
        </div>
      </section>

      {/* JAK TO DZIAŁA */}
      <section id="jak-to-dziala">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Jak to działa</p>
            <h2>Jak przenieść stronę na inny hosting — w 3 krokach, bez przestoju</h2>
            <p>Przeniesienie strony nie wymaga wiedzy technicznej ani przerwy w działaniu. Migracja odbywa się „obok" działającej strony, a Ty przełączasz się dopiero wtedy, gdy wszystko jest sprawdzone.</p>
          </div>
          <div className="steps">
            {STEPS.map(([n, h, p]) => (
              <div className="step rv" key={n}>
                <span className="n">{n}</span>
                <h3>{h}</h3>
                <p>{p}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* LEAD — wejście do sekwencji e-mail */}
      <section>
        <div className="wrap">
          <MigrationLeadForm />
        </div>
      </section>

      {/* PORÓWNANIE */}
      <section className="band">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">Uczciwe zasady</p>
            <h2>Czym Verris różni się od typowego hostingu?</h2>
            <p>Konkrety zamiast deklaracji — każdy punkt po stronie Verris ma pokrycie w regulaminie albo w specyfikacji usługi.</p>
          </div>
          <table className="cmp rv">
            <thead>
              <tr><th scope="col">Obszar</th><th scope="col">Typowy model rynkowy</th><th scope="col">Verris</th></tr>
            </thead>
            <tbody>
              {COMPARE.map((r) => (
                <tr key={r[0]}>
                  <th scope="row">{r[0]}</th>
                  <td className="other">{r[1]}</td>
                  <td className="vr">{r[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* CENNIK */}
      <Pricing />

      {/* FAQ */}
      <section className="band" id="faq">
        <div className="wrap">
          <div className="sec-head rv">
            <p className="kicker">FAQ</p>
            <h2>Częste pytania o przeniesienie strony</h2>
          </div>
          <div className="faq">
            {FAQ.map(([q, a]) => (
              <details className="rv" key={q}>
                <summary>{q}</summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
          <p className="updated">Ostatnia aktualizacja: 8 lipca 2026</p>
        </div>
      </section>

      <CTABand
        title="Twoja strona zasługuje na hosting bez pułapek."
        text="Zamów hosting, przekaż dostępy — resztą przeprowadzki zajmiemy się my. Za 0 zł."
        primaryLabel="Przenieś stronę za darmo"
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

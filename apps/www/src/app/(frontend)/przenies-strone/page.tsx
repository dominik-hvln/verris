import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, SectionHead2 } from '../components/ui';
import { MobilnyPasek } from '../components/MobilnyPasek';
import { PasRozmowy } from '../components/PasRozmowy';
import { KartyUslug } from '../components/KartyUslug';
import { pobierzCeny } from '@/lib/ceny-api';
import { netto, zl, type Ceny } from '@/lib/ceny';
import { MigrationLeadForm } from '../components/MigrationLeadForm';
import { PokazPrzeprowadzki } from '../components/PokazPrzeprowadzki';
import { CMS_Z_ODCZYTEM_BAZY, HASLA_KASOWANE_PO_DNIACH, KROKI_PRZEPROWADZKI } from '@/lib/migracja';
import { PORADNIKI } from '@/lib/poradniki';
import { faqSchema, graph, howToSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

// Makieta 14.10 (plansza Migracja + notatka „seo-migracja” w canvas.json).
export const metadata: Metadata = {
  title: 'Przeniesienie strony na nowy hosting za darmo | Verris',
  description:
    'Przeniesiemy stronę, bazę i pocztę z cPanel, Plesk, innego panelu albo przez FTP. Stara strona działa do przełączenia domeny. Bez opłat.',
  alternates: { canonical: '/przenies-strone' },
  openGraph: {
    title: 'Przeniesienie strony na nowy hosting za darmo',
    description:
      'Przeniesiemy stronę, bazę i pocztę z cPanel, Plesk, innego panelu albo przez FTP. Stara strona działa do przełączenia domeny.',
    url: 'https://verris.pl/przenies-strone',
    locale: 'pl_PL',
    type: 'website',
    siteName: 'Verris',
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Verris – darmowe przeniesienie strony' }],
  },
};

const PARAMETRY: [string, string][] = [
  ['0 zł', 'przeniesienie strony i poczty'],
  ['Bez przerwy', 'stara strona działa do przełączenia; sklep: kilka minut przerwy w zamówieniach'],
  [`${HASLA_KASOWANE_PO_DNIACH} dni`, 'potem kasujemy hasła do starego hostingu'],
  ['Na żywo', 'postęp każdego etapu w panelu'],
];

const PODZIAL: [string, string, string][] = [
  ['Pliki strony', 'login do panelu albo dane FTP / SFTP', 'wyszukanie katalogu strony, kopia i porównanie liczby plików ze źródłem'],
  [
    'Baza danych',
    'zwykle nic – dane bazy odczytamy z plików strony; przy samym FTP podajesz nazwę bazy',
    'nowa baza u nas, import, nowe dane bazy w konfiguracji strony i sprawdzenie połączenia',
  ],
  ['Poczta', 'hasło każdej skrzynki', 'założenie skrzynek u nas, kopia wiadomości i folderów'],
  ['Domena', 'wybór z listy i zmiana DNS, kiedy jesteś gotowy', 'sprawdzenie DNS, plan przełączenia i synchronizacja różnic przed zmianą'],
];

const BEZPIECZENSTWO: [string, string][] = [
  [
    'Hasła zaszyfrowane i kasowane',
    `Dostęp do starego hostingu trzymamy zaszyfrowany tylko na czas przeniesienia i kasujemy automatycznie ${HASLA_KASOWANE_PO_DNIACH} dni po zakończeniu.`,
  ],
  ['Stara strona zostaje', 'Dane kopiujemy obok – u starego dostawcy niczego nie kasujemy, więc strona działa tam dalej.'],
  [
    'Zgoda i dziennik',
    'Gdy przeprowadzkę robi za Ciebie nasz zespół, rusza ona po Twojej zgodzie w panelu, a każdy wgląd w hasła trafia do dziennika.',
  ],
  ['Zatrzymasz w każdej chwili', 'Przeprowadzkę w toku anulujesz w panelu jednym przyciskiem.'],
];

const faq = (ceny: Ceny): [string, string][] => [
  [
    'Czy strona przestanie działać w trakcie przenoszenia na inny hosting?',
    'Nie powinna. Migracja odbywa się „obok” działającej strony – kopiujemy dane na nowy serwer, a Twoja obecna strona działa u dotychczasowego dostawcy do momentu przełączenia domeny. Samo przełączenie DNS wiąże się z propagacją, która zwykle trwa od kilkunastu minut do kilku godzin; w tym czasie część odwiedzających może jeszcze trafiać na starą wersję strony.',
  ],
  [
    'Czy przeniesienie strony wpłynie na pozycje w Google?',
    'Sama zmiana hostingu nie zmienia adresów URL ani treści strony, więc poprawnie przeprowadzona migracja nie powoduje utraty pozycji. Krótkie wahania w trakcie propagacji DNS są możliwe, ale ustępują samoistnie.',
  ],
  [
    'Jak przenieść stronę WordPress na inny hosting?',
    'Przeniesienie WordPressa to skopiowanie plików, bazy danych i konfiguracji na nowy serwer. W Verris kreator w panelu kopiuje pliki i bazę, odczytuje dane bazy z wp-config.php i wpisuje do niego nowe dane. Możesz też przekazać dostępy, a przeprowadzkę zrobi za Ciebie nasz zespół.',
  ],
  [
    'Czy muszę znać dane bazy danych?',
    `Zwykle nie. Odczytamy je z panelu albo z plików konfiguracji ${CMS_Z_ODCZYTEM_BAZY}. Przy samym FTP podajesz tylko nazwę bazy.`,
  ],
  [
    'Co z moimi hasłami do starego hostingu?',
    `Trzymamy je zaszyfrowane tylko na czas przeniesienia i kasujemy automatycznie ${HASLA_KASOWANE_PO_DNIACH} dni po zakończeniu, a po błędzie albo anulowaniu – po 3 dniach.`,
  ],
  [
    'Czy muszę przenosić domenę razem z hostingiem?',
    'Nie. Domena może zostać u obecnego rejestratora – wystarczy zmienić rekordy DNS tak, aby wskazywały na serwery Verris. Transfer domeny do Verris jest opcjonalny i możesz go wykonać w dowolnym momencie później. U nas domeny odnawiają się wyłącznie po opłaceniu – nigdy automatycznie.',
  ],
  [
    'Co z pocztą e-mail przy zmianie hostingu?',
    'Hosting Verris obejmuje pocztę. W ramach przeprowadzki zakładamy skrzynki u nas i kopiujemy wiadomości z folderami – do każdej skrzynki podajesz jej hasło. Do czasu przełączenia DNS poczta działa u obecnego dostawcy, więc żadna wiadomość nie ginie.',
  ],
  [
    'Czy migracja jest naprawdę bezpłatna?',
    'Tak. Zarówno kreator w panelu, jak i pomoc naszego zespołu są bezpłatne w ramach zamówienia hostingu. Nie ma limitu „do X plików” ani dopłat za bazy danych.',
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    `Nie stosujemy modelu „cena za 1 zł na start, kilkukrotnie droższe odnowienie”. Odnowienie następuje według cennika obowiązującego w dniu odnowienia (dziś ${zl(ceny.hosting.miesiecznie)}/mies lub ${zl(ceny.hosting.rocznie)}/rok brutto), a przed każdym odnowieniem wyślemy przypomnienie e-mail (7, 3 i 1 dzień wcześniej). Z odnowienia zrezygnujesz w panelu w dwóch kliknięciach, bez opłat.`,
  ],
  [
    'Czy mogę zrezygnować po zakupie?',
    'Jako konsument masz prawo odstąpienia od umowy. Zasady odstąpienia i zwrotu opisuje regulamin, który zobaczysz przed zakupem – zwrot realizuje nasze wsparcie.',
  ],
];

const jsonLd = (FAQ: [string, string][]) =>
  graph(
  howToSchema({
    name: 'Jak przenieść stronę na nowy hosting bez przerwy w działaniu',
    description: 'Przeniesienie strony, bazy i poczty do Verris w 6 krokach – stara strona działa do przełączenia domeny.',
    path: '/przenies-strone',
    steps: KROKI_PRZEPROWADZKI.map((k) => ({ name: k.tytul, text: `${k.tekst} Co robimy za Ciebie: ${k.zaCiebie}` })),
  }),
  faqSchema(FAQ),
);

// Makieta 1.11: czasy przeniesienia — orientacyjne (zależą od rozmiaru i szybkości starego serwera).
const CZASY: { kicker: string; czas: string; opis: string; ty?: boolean }[] = [
  { kicker: 'Twój czas', czas: 'ok. 5 min', opis: 'wybór domeny, dostęp i jedno kliknięcie na koniec', ty: true },
  { kicker: 'Strona firmowa do 1 GB', czas: '15–30 min', opis: 'pliki, baza i kilka skrzynek pocztowych' },
  { kicker: 'Sklep 1–10 GB', czas: '30–90 min', opis: 'duża baza, tysiące zdjęć produktów' },
  {
    kicker: 'Przerwa w działaniu',
    czas: '0 min',
    opis: 'stara strona działa, aż sam przełączysz domenę; sklep wstrzymuje zamówienia na kilka minut przy ostatnim dograniu bazy, o wybranej porze',
  },
];

// Makieta 1.11: pilny przypadek. Migrator nie przyjmuje pliku kopii (sprawdzone 1.11 w apps/api/src/subscriptions/migration-*),
// więc przy wygasłym hostingu nie obiecujemy odtworzenia „z pliku w panelu” — pomaga zespół.
const PILNE: [string, string][] = [
  ['Stary hosting jeszcze działa', 'Przenosimy jak zwykle. Domenę przełączasz po sprawdzeniu nowej strony.'],
  ['Zostało kilka dni', 'Najpierw kopiujemy pliki i bazy, pocztę na końcu. Strona nie zniknie, kiedy stary hosting wygaśnie.'],
  ['Hosting już wygasł', 'Poproś starego dostawcę o kopię strony i napisz do nas – pomożemy ją odtworzyć.'],
];

const zyski = (ceny: Ceny): [string, string][] => [
  ['Szybsze ładowanie', 'LiteSpeed z cache dla WordPressa, dyski NVMe i Redis. Strony z cache serwer oddaje bez uruchamiania PHP.'],
  ['Spokój przy ruchu', 'Przy promocji albo kampanii moc rośnie sama. Ty ustawiasz, ile najwyżej możesz za to zapłacić.'],
  ['Kopie, które przywrócisz sam', 'Codziennie, z każdego z ostatnich 30 dni. Pliki, bazy i poczta, bez zgłoszenia do pomocy.'],
  ['Cena odnowienia z góry', `${zl(ceny.hosting.rocznie)} brutto (${zl(netto(ceny.hosting.rocznie))} netto) rocznie według cennika – tyle kosztuje odnowienie.`],
  ['Statystyki bez cookies', 'Widzisz odwiedziny i źródła ruchu bez banera zgody i bez narzędzi zewnętrznych.'],
  ['Dostępność w umowie', '99,5% w miesiącu. Poniżej tego oddajemy część opłaty, a każdą awarię widać na stronie statusu.'],
];

export default async function Page() {
  const ceny = await pobierzCeny();
  const FAQ = faq(ceny);
  return (
    <main>
      <JsonLd data={jsonLd(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="b-hero">
            <Breadcrumbs items={[{ label: 'Przeniesienie strony' }]} />
            <span className="eyebrow">Przeniesienie strony, bazy i poczty – w cenie hostingu</span>
            <h1>
              Przeniesiemy Twoją stronę na nowy hosting. <span className="mint">Ty w tym czasie spokojnie pracujesz</span>
            </h1>
            <p className="lead">
              Podajesz dostęp do starego hostingu – login do panelu albo FTP – i hasła skrzynek pocztowych. Strony, bazy i
              skrzynki wyszukamy sami, a każdy etap zobaczysz na żywo. Strona działa przez cały czas przeprowadzki.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="hero" conv="checkout_intent" plan="hosting">
                Przenieś stronę za darmo
              </Button>
              <Button href="#poradniki" variant="ghost" cta="hero-poradniki">
                Poradniki krok po kroku
              </Button>
            </div>
            <p className="hero2-fine">
              Hosting z autoskalowaniem: <strong>{zl(ceny.hosting.miesiecznie)}/mies</strong> lub{' '}
              <strong>{zl(ceny.hosting.rocznie)}/rok</strong> brutto ({zl(netto(ceny.hosting.miesiecznie))} lub{' '}
              {zl(netto(ceny.hosting.rocznie))} netto), odnowienie po cenie z cennika. Przeniesienie jest bezpłatne w ramach
              zamówienia.
            </p>
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

      <section className="sec" id="jak-to-dziala" aria-labelledby="b-jak">
        <div className="wrap">
          <SectionHead
            id="b-jak"
            eyebrow="Jak to działa"
            title="Tak wygląda przeprowadzka w panelu – 6 kroków"
            lead="Kreator prowadzi Cię od wyboru domeny do przełączenia. Kliknij kroki pokazu, żeby zobaczyć, co widzisz na ekranie."
          />
          <div className="b-split">
            <ol className="b-kroki">
              {KROKI_PRZEPROWADZKI.map((k, i) => (
                <li key={k.tytul} id={`krok-${i + 1}`}>
                  <span className="b-kroki-n" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <div>
                    <h3>{k.tytul}</h3>
                    <p>{k.tekst}</p>
                    <p className="b-zaciebie">
                      <strong>Co robimy za Ciebie:</strong> {k.zaCiebie}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
            <PokazPrzeprowadzki etykiety={KROKI_PRZEPROWADZKI.map((k) => k.etykieta)} />
          </div>
          <ul className="pc-czasy" aria-label="Ile trwa przeniesienie">
            {CZASY.map((c) => (
              <li key={c.kicker} className={c.ty ? 'ty' : undefined}>
                <p className="kicker mono">{c.kicker.toUpperCase()}</p>
                <b>{c.czas}</b>
                <span>{c.opis}</span>
              </li>
            ))}
          </ul>
          <p className="pc-uwaga">
            Czasy kopiowania są orientacyjne: zależą od rozmiaru strony i poczty oraz od szybkości starego serwera.
            Przeniesienie przez samo FTP i duże skrzynki pocztowe trwają dłużej. Postęp każdego etapu widzisz w panelu na
            bieżąco.
          </p>
        </div>
      </section>

      <section className="sec sec-alt" id="co-przygotowac" aria-labelledby="b-podzial">
        <div className="wrap">
          <SectionHead id="b-podzial" eyebrow="Podział pracy" title="Ty: kilka minut. My: cała reszta" />
          <table className="cmp2">
            <thead>
              <tr>
                <th scope="col">Co przenosimy</th>
                <th scope="col">Twoja część</th>
                <th scope="col">Nasza część</th>
              </tr>
            </thead>
            <tbody>
              {PODZIAL.map(([co, ty, my]) => (
                <tr key={co}>
                  <th scope="row">{co}</th>
                  <td data-label="Twoja część">{ty}</td>
                  <td data-label="Nasza część" className="vr">
                    {my}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="b-przypis">
            Dane bazy odczytujemy z plików {CMS_Z_ODCZYTEM_BAZY}. Przy samym FTP podajesz jeszcze nazwę bazy.
          </p>
        </div>
      </section>

      <section className="sec" id="poradniki" aria-labelledby="b-skad">
        <div className="wrap">
          <SectionHead
            id="b-skad"
            eyebrow="Poradniki przeprowadzki"
            title="Skąd przeniesiemy Twoją stronę?"
            lead="Prawie z każdego hostingu w Polsce. Jeśli Twój dostawca ma panel cPanel, Plesk albo inny popularny panel, zwykle wystarczy login do panelu. Jeśli nie, przeniesiemy stronę przez FTP. Wybierz poradnik krok po kroku."
          />
          <ul className="b-zrodla">
            {PORADNIKI.map((p) => (
              <li key={p.slug}>
                <Link href={`/przenies-strone/${p.slug}`}>
                  <h3>{p.kafelek.tytul}</h3>
                  <p>{p.kafelek.tekst}</p>
                  <span className="b-wiecej">Poradnik krok po kroku →</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="pilne" aria-labelledby="pp-tytul">
        <div className="wrap">
          <div className="pp-pilne">
            <div className="pp-pilne-txt">
              <p className="kicker">Pilny przypadek</p>
              <h2 id="pp-tytul">Kończy Ci się hosting? Zacznij przeniesienie dziś</h2>
              <p>
                Załóż konto i uruchom przeniesienie od razu, bez czekania na odpowiedź z pomocy. Jeśli zostało niewiele
                czasu, zostaw numer – oddzwonimy i ustalimy kolejność.
              </p>
              <div className="pp-pilne-cta">
                <Button href={ZAMOW} cta="pilne" conv="checkout_intent" plan="hosting">
                  Przenieś pilnie
                </Button>
                <Button href="#porozmawiajmy" variant="ghost" cta="pilne-telefon">
                  Poproś o telefon
                </Button>
              </div>
            </div>
            <ul className="pp-scen">
              {PILNE.map(([t, p]) => (
                <li key={t}>
                  <b>{t}</b>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="po-przeniesieniu" aria-labelledby="pz-tytul">
        <div className="wrap">
          <SectionHead2
            id="pz-tytul"
            eyebrow="Po przeniesieniu"
            title="Co zmieni się dla Twojej strony"
            lead="Ta sama strona, ten sam adres. Zmienia się to, co dzieje się pod spodem."
          />
          <ul className="pz-karty">
            {zyski(ceny).map(([t, p]) => (
              <li key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-bezp">
        <div className="wrap">
          <SectionHead id="b-bezp" eyebrow="Bezpieczeństwo" title="Twoje hasła i dane są bezpieczne" />
          <div className="b-grid4">
            {BEZPIECZENSTWO.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Lead — wejście do sekwencji e-mail (zgoda i double opt-in w MigrationLeadForm) */}
      <section className="sec">
        <div className="wrap">
          <MigrationLeadForm />
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Częste pytania o przeniesienie strony" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="updated">Ostatnia aktualizacja: 14 października 2026</p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <KartyUslug pomin={['przeniesienie']} />
        </div>
      </section>

      <PasRozmowy />

      <CTABand
        title="Przeprowadzka bez stresu i bez kosztów"
        text="Podaj dostęp, a resztą zajmiemy się my. Stara strona działa do chwili przełączenia domeny."
        primaryLabel="Przenieś stronę za darmo"
        primaryHref={ZAMOW}
        secondary={{ label: 'Jak wybrać hosting', href: '/jak-wybrac-hosting' }}
      />
      <MobilnyPasek tytul="Przeniesienie 0 zł" podpis="stara strona działa do końca" przycisk="Przenieś stronę" href={ZAMOW} />
    </main>
  );
}

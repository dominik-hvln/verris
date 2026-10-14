import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy } from '../components/ui';
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
    images: [{ url: '/og-default.png', width: 1200, height: 630, alt: 'Verris — darmowe przeniesienie strony' }],
  },
};

const PARAMETRY: [string, string][] = [
  ['0 zł', 'przeniesienie strony i poczty'],
  ['Bez przerwy', 'stara strona działa do przełączenia'],
  [`${HASLA_KASOWANE_PO_DNIACH} dni`, 'potem kasujemy hasła do starego hostingu'],
  ['Na żywo', 'postęp każdego etapu w panelu'],
];

const PODZIAL: [string, string, string][] = [
  ['Pliki strony', 'login do panelu albo dane FTP / SFTP', 'wyszukanie katalogu strony, kopia i porównanie liczby plików ze źródłem'],
  [
    'Baza danych',
    'zwykle nic — dane bazy odczytamy z plików strony; przy samym FTP podajesz nazwę bazy',
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
  ['Stara strona zostaje', 'Dane kopiujemy obok — u starego dostawcy niczego nie kasujemy, więc strona działa tam dalej.'],
  [
    'Zgoda i dziennik',
    'Gdy przeprowadzkę robi za Ciebie nasz zespół, rusza ona po Twojej zgodzie w panelu, a każdy wgląd w hasła trafia do dziennika.',
  ],
  ['Zatrzymasz w każdej chwili', 'Przeprowadzkę w toku anulujesz w panelu jednym przyciskiem.'],
];

const FAQ: [string, string][] = [
  [
    'Czy strona przestanie działać w trakcie przenoszenia na inny hosting?',
    'Nie powinna. Migracja odbywa się „obok” działającej strony — kopiujemy dane na nowy serwer, a Twoja obecna strona działa u dotychczasowego dostawcy do momentu przełączenia domeny. Samo przełączenie DNS wiąże się z propagacją, która zwykle trwa od kilkunastu minut do kilku godzin; w tym czasie część odwiedzających może jeszcze trafiać na starą wersję strony.',
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
    `Trzymamy je zaszyfrowane tylko na czas przeniesienia i kasujemy automatycznie ${HASLA_KASOWANE_PO_DNIACH} dni po zakończeniu, a po błędzie albo anulowaniu — po 3 dniach.`,
  ],
  [
    'Czy muszę przenosić domenę razem z hostingiem?',
    'Nie. Domena może zostać u obecnego rejestratora — wystarczy zmienić rekordy DNS tak, aby wskazywały na serwery Verris. Transfer domeny do Verris jest opcjonalny i możesz go wykonać w dowolnym momencie później. U nas domeny odnawiają się wyłącznie po opłaceniu — nigdy automatycznie.',
  ],
  [
    'Co z pocztą e-mail przy zmianie hostingu?',
    'Hosting Verris obejmuje pocztę. W ramach przeprowadzki zakładamy skrzynki u nas i kopiujemy wiadomości z folderami — do każdej skrzynki podajesz jej hasło. Do czasu przełączenia DNS poczta działa u obecnego dostawcy, więc żadna wiadomość nie ginie.',
  ],
  [
    'Czy migracja jest naprawdę bezpłatna?',
    'Tak. Zarówno kreator w panelu, jak i pomoc naszego zespołu są bezpłatne w ramach zamówienia hostingu. Nie ma limitu „do X plików” ani dopłat za bazy danych.',
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    'Nie stosujemy modelu „tani pierwszy rok, kilkukrotnie droższe odnowienie”. Odnowienie następuje według cennika obowiązującego w dniu odnowienia (dziś 45 zł/mies lub 449 zł/rok brutto), a przed każdym odnowieniem wyślemy przypomnienie e-mail (7, 3 i 1 dzień wcześniej). Z odnowienia zrezygnujesz w panelu w dwóch kliknięciach, bez opłat.',
  ],
  [
    'Czy mogę zrezygnować po zakupie?',
    'Jako konsument masz prawo odstąpienia od umowy. Zasady odstąpienia i zwrotu opisuje regulamin, który zobaczysz przed zakupem — zwrot realizuje nasze wsparcie.',
  ],
];

const jsonLd = graph(
  howToSchema({
    name: 'Jak przenieść stronę na nowy hosting bez przerwy w działaniu',
    description: 'Przeniesienie strony, bazy i poczty do Verris w 6 krokach — stara strona działa do przełączenia domeny.',
    path: '/przenies-strone',
    steps: KROKI_PRZEPROWADZKI.map((k) => ({ name: k.tytul, text: `${k.tekst} Co robimy za Ciebie: ${k.zaCiebie}` })),
  }),
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
            <Breadcrumbs items={[{ label: 'Przeniesienie strony' }]} />
            <span className="eyebrow">Przeniesienie strony, bazy i poczty — w cenie hostingu</span>
            <h1>
              Przeniesiemy Twoją stronę na nowy hosting. <span className="mint">Ty w tym czasie spokojnie pracujesz</span>
            </h1>
            <p className="lead">
              Podajesz dostęp do starego hostingu — login do panelu albo FTP — i hasła skrzynek pocztowych. Strony, bazy i
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
              Hosting z autoskalowaniem: <strong>45 zł/mies</strong> lub <strong>449 zł/rok</strong> brutto, ta sama cena
              przy odnowieniu. Przeniesienie jest bezpłatne w ramach zamówienia.
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
            title="Tak wygląda przeprowadzka w panelu — 6 kroków"
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
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-podzial">
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

      <CTABand
        title="Przeprowadzka bez stresu i bez kosztów"
        text="Podaj dostęp, a resztą zajmiemy się my. Stara strona działa do chwili przełączenia domeny."
        primaryLabel="Przenieś stronę za darmo"
        primaryHref={ZAMOW}
        secondary={{ label: 'Jak wybrać hosting', href: '/jak-wybrac-hosting' }}
      />
      <StickyBuy href={ZAMOW} label="Przenieś stronę" />
    </main>
  );
}

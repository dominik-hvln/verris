import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead } from '../components/ui';
import { PANEL } from '@/lib/site';
import { faqSchema, graph, serviceSchema } from '@/lib/schema';

/*
 * Makieta 14.10 (plansza Domeny). Wyszukiwarka z makiety NIE udaje wyników: zwykły formularz GET prowadzi do
 * kreatora zakupu w panelu (`/dashboard/domains/buy?domain=` — parametr czytany w apps/client-panel …/buy/page.tsx),
 * który sprawdza dostępność i pokazuje cenę rejestracji oraz odnowienia. Cennika domen nie ma w kodzie verris.pl,
 * więc tabela z makiety ([cena]) jest pominięta.
 */
const WYSZUKIWARKA = `${PANEL}/dashboard/domains/buy`;

export const metadata: Metadata = {
  title: 'Domeny — rejestracja i transfer bez pułapek | Verris',
  description:
    'Rejestracja i transfer domen bez automatycznych odnowień. Przypomnienia 30, 14 i 7 dni przed końcem, DNSSEC i kod transferu w panelu.',
  alternates: { canonical: '/domeny' },
};

const KONTROLA: [string, string][] = [
  ['Bez automatycznych odnowień', 'Nic nie pobieramy samo. Przypominamy 30, 14 i 7 dni przed końcem, a odnowienie następuje dopiero po opłaceniu.'],
  ['DNS w panelu', 'Rekordy A, MX, TXT czy CNAME dodajesz w edytorze strefy w panelu Verris.'],
  ['DNSSEC i ukrycie danych', 'Podpisana strefa DNS i ukrycie danych właściciela w WHOIS tam, gdzie pozwala na to rejestr danej końcówki.'],
  ['Kod transferu na żądanie', 'Chcesz odejść? Kod transferu pobierasz w panelu, a blokadę transferu włączasz i zdejmujesz sam.'],
];

const TRANSFER: [string, string][] = [
  ['Pobierz kod transferu', 'Kod AuthInfo dostaniesz u obecnego rejestratora — zwykle w jego panelu.'],
  ['Wpisz domenę i kod w panelu Verris', 'Wybierz transfer w kreatorze domen i opłać go — cenę zobaczysz przed zamówieniem.'],
  ['Potwierdź transfer', 'Jeśli rejestr albo obecny rejestrator poprosi o potwierdzenie mailem, kliknij link w wiadomości.'],
  ['Gotowe', 'Domena jest u nas, a DNS ustawiasz w tym samym panelu co hosting.'],
];

const FAQ: [string, string][] = [
  [
    'Ile kosztuje domena .pl?',
    'Cenę rejestracji i cenę odnowienia pokazujemy obok siebie w kreatorze zakupu w panelu — przed zamówieniem, żebyś znał koszt także w kolejnych latach. Ceny są brutto.',
  ],
  [
    'Czy domena odnowi się sama?',
    'Nie. Zamiast cichego pobierania z karty przypominamy 30, 14 i 7 dni przed wygaśnięciem, a decyzję zostawiamy Tobie.',
  ],
  [
    'Czy mogę mieć domenę u Was, a stronę gdzie indziej?',
    'Tak. Rekordy DNS ustawiasz w panelu i kierujesz domenę, gdzie chcesz.',
  ],
  [
    'Czy muszę przenosić domenę, żeby uruchomić stronę na Verris?',
    'Nie. Wystarczy zmienić rekordy DNS, aby wskazywały na nasze serwery — domena może zostać u obecnego rejestratora. Transfer jest opcjonalny i zrobisz go w dowolnym momencie.',
  ],
  [
    'Jak długo trwa transfer domeny?',
    'To zależy od końcówki i obecnego rejestratora. Jeśli DNS domeny się nie zmienia, strona i poczta działają w tym czasie normalnie.',
  ],
  ['Kto zarządza blokadą transferu?', 'Ty — blokadę transferu włączasz i zdejmujesz sam w panelu.'],
  [
    'Czy rejestrację domeny można cofnąć?',
    'Nie. Rejestracja domeny jest nieodwracalna — informujemy o tym wprost przed zamówieniem, bez ukrytych zapisów.',
  ],
];

const jsonLd = graph(
  serviceSchema({
    name: 'Rejestracja i transfer domen',
    description:
      'Rejestracja, transfer i utrzymanie domen bez automatycznych odnowień. Przypomnienia 30/14/7 dni przed wygaśnięciem, DNSSEC i kod transferu w panelu.',
    path: '/domeny',
  }),
  faqSchema(FAQ),
);

export default function DomenyPage() {
  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Domeny' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Rejestracja domen
            </span>
            <h1>
              Znajdź domenę dla swojej firmy. <span className="mint">Odnowisz ją wtedy, kiedy zechcesz</span>
            </h1>
            <p className="lead">
              Nie przedłużamy domen automatycznie i nie pobieramy pieniędzy bez pytania. Przypominamy 30, 14 i 7 dni przed
              końcem, a decyzja zawsze należy do Ciebie.
            </p>
            <ul className="ticks">
              <li>cena odnowienia widoczna przed zamówieniem</li>
              <li>DNS i DNSSEC w panelu</li>
              <li>kod transferu bez proszenia</li>
            </ul>
          </div>
          <Card className="b-szukaj">
            <form action={WYSZUKIWARKA} method="get">
              <label htmlFor="domena">Sprawdź, czy Twoja domena jest wolna</label>
              <div className="b-szukaj-pole">
                <input
                  id="domena"
                  name="domain"
                  type="text"
                  inputMode="url"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="np. mojafirma.pl"
                  maxLength={63}
                  required
                />
                <button type="submit" className="btn btn-primary" data-event="cta_click" data-cta="domena-szukaj">
                  Sprawdź
                </button>
              </div>
              <p className="b-przypis">
                Dostępność i ceny sprawdzisz w kreatorze domen w panelu Verris — po zalogowaniu albo założeniu konta.
              </p>
            </form>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="b-kontrola">
        <div className="wrap">
          <SectionHead id="b-kontrola" eyebrow="Zasady" title="Domena, nad którą masz pełną kontrolę" />
          <div className="b-grid4">
            {KONTROLA.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="transfer" aria-labelledby="b-transfer">
        <div className="wrap b-split">
          <SectionHead
            id="b-transfer"
            eyebrow="Transfer"
            title="Jak przenieść domenę do Verris?"
            lead={
              <>
                Domena może też zostać u obecnego rejestratora — wtedy wystarczy zmienić DNS. Przenosisz całą stronę?
                Zobacz <Link href="/przenies-strone">darmowe przeniesienie strony</Link>.
              </>
            }
          />
          <ol className="b-kroki">
            {TRANSFER.map(([t, p], i) => (
              <li key={t}>
                <span className="b-kroki-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{t}</h3>
                  <p>{p}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title="Pytania o domeny" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Znajdź domenę dla swojej strony"
        text="Sprawdź dostępność i ceny w panelu — a hosting dołóż w tej samej chwili."
        primaryLabel="Wyszukaj domenę"
        primaryHref={WYSZUKIWARKA}
        secondary={{ label: 'Zobacz hosting', href: '/hosting' }}
      />
    </main>
  );
}

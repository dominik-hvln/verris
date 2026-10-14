import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, Steps, type Step } from '../../components/ui';
import { faqSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

/*
 * /funkcje/statystyki — makieta 14.10 (FunkcjaStatystyki.dc.html). Opisujemy tylko to, co jest w kodzie:
 *  - apps/api/src/analytics-sites/analytics-sites.service.ts — bez cookies, IP i UA tylko do skrótu z dzienną solą
 *    (nie trafiają do bazy), Do Not Track, pomijanie botów, retencja 90 dni, do 25 stron na usługę;
 *    statystyki: odsłony, odwiedzający, seria dzienna, top strony, źródła wejść, urządzenia;
 *  - apps/client-panel/src/app/dashboard/analytics — „Analityka stron”, zakresy 7/30/90 dni, kod `<script defer>`
 *    wklejany w <head>.
 * Świadomie pomijamy „kraje” (nagłówek kraju nie jest ustawiany — PRZEGLAD_LUK 3.9) i „bez danych osobowych”
 * (IP jest przetwarzane przed haszowaniem — zasada z 2026-07-10).
 */

export const metadata: Metadata = {
  title: 'Statystyki strony bez cookies, w cenie hostingu | Verris',
  description:
    'Statystyki odwiedzin wbudowane w hosting: bez cookies i bez zapisu adresów IP. Popularne strony, źródła wejść i urządzenia. W cenie, 45 zł/mies.',
  alternates: { canonical: '/funkcje/statystyki' },
};

const CO_ZOBACZYSZ: [string, string][] = [
  ['Odwiedzający i odsłony', 'Suma i wykres dzień po dniu — za ostatnie 7, 30 albo 90 dni.'],
  ['Najczęściej czytane strony', 'Dziesięć podstron, które przyciągają najwięcej ludzi. Widzisz, co działa, a co nikogo nie obchodzi.'],
  ['Skąd przychodzą', 'Wyszukiwarka, media społecznościowe, newsletter czy wpis na forum — źródła wejść w jednej liście, osobno wejścia bezpośrednie.'],
  ['Urządzenia', 'Ilu ludzi wchodzi z telefonu, ilu z komputera, a ilu z tabletu.'],
];

const ZASADY: string[] = [
  'bez plików cookies i bez zapisu adresów IP w bazie',
  'odwiedzającego rozpoznajemy tylko w obrębie jednej doby, potem nie da się go powiązać',
  'respektujemy ustawienie „Nie śledź” (Do Not Track) w przeglądarce',
  'dane trzymamy 90 dni, potem usuwają się automatycznie',
  'znane boty i roboty indeksujące pomijamy',
  'jeden lekki skrypt ładowany z atrybutem defer — nie blokuje wyświetlania strony',
];

const KROKI: Step[] = [
  { label: '01', title: 'Dodaj stronę', text: 'W panelu otwierasz „Analityka stron”, wybierasz usługę i wpisujesz domenę.' },
  {
    label: '02',
    title: 'Wklej jeden kod',
    text: 'Kopiujesz krótki skrypt i wklejasz go w sekcji <head> strony. W WordPressie zrobisz to wtyczką do wstawiania kodu.',
  },
  { label: '03', title: 'Sprawdzaj ruch', text: 'Pierwsze odsłony pojawią się w panelu, gdy tylko ktoś odwiedzi stronę.' },
];

const FAQ: [string, string][] = [
  [
    'Czy potrzebuję banera zgód dla tych statystyk?',
    'Statystyki Verris nie zapisują cookies ani niczego innego w przeglądarce odwiedzającego, nie przechowują adresów IP i nie śledzą ludzi między stronami, więc nie wymagają zgody na cookies. Jeśli używasz też innych narzędzi, na przykład reklamowych, sprawdź ich wymagania.',
  ],
  [
    'Czy to zastąpi Google Analytics?',
    'Do codziennego sprawdzania ruchu wiele osób nie potrzebuje niczego więcej. Jeśli prowadzisz kampanie reklamowe i liczysz konwersje, możesz używać obu narzędzi naraz.',
  ],
  ['Jak długo trzymacie dane?', '90 dni. Starsze zdarzenia usuwamy automatycznie.'],
  ['Czy statystyki spowalniają stronę?', 'Skrypt jest mały i ładuje się z atrybutem defer, więc nie blokuje wyświetlania strony.'],
  ['Czy statystyki kosztują coś ekstra?', 'Nie. Są w cenie hostingu — możesz dodać do 25 stron na jedną usługę.'],
];

export default function Page() {
  return (
    <main>
      <JsonLd data={faqSchema(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Funkcje', href: '/funkcje' }, { label: 'Statystyki bez cookies' }]} />
            <p className="kicker" style={{ marginTop: 18 }}>
              Statystyki odwiedzin
            </p>
            <h1>Wiesz, kto Cię odwiedza. Bez cookies i bez śledzenia</h1>
            <p className="lead">
              Statystyki są wbudowane w hosting. Nie zapisujemy plików cookies, nie przechowujemy adresów IP i nie
              śledzimy ludzi między stronami — więc nie dokładasz kolejnej pozycji do banera zgód.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="subhero" conv="checkout_intent" plan="hosting">
                Zamów hosting
              </Button>
              <Button href="/funkcje" variant="ghost" cta="subhero-alt">
                Wszystkie funkcje
              </Button>
            </div>
          </div>
          <Card className="c-prev">
            <div className="c-prev-h">
              <span>twojafirma.pl · 30 dni</span>
              <span>bez cookies</span>
            </div>
            <div className="c-prev-b" aria-hidden="true">
              <div className="c-bars">
                {[30, 42, 38, 55, 48, 62, 58, 70, 66, 84, 76, 92, 88, 72].map((h, i) => (
                  <span key={i} className={i === 11 ? 'hot' : undefined} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="c-row">
                <b>/oferta</b>
                <small>najczęściej czytana</small>
              </div>
              <div className="c-row">
                <b>google.com</b>
                <small>główne źródło wejść</small>
              </div>
            </div>
            <div className="c-prev-b" style={{ paddingTop: 0 }}>
              <p className="c-note">Ilustracja widoku z panelu — bez danych prawdziwej strony.</p>
            </div>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="s-co">
        <div className="wrap">
          <SectionHead id="s-co" title="Co zobaczysz w panelu" />
          <div className="duo">
            {CO_ZOBACZYSZ.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="s-dlaczego">
        <div className="wrap split">
          <div>
            <SectionHead id="s-dlaczego" title="Dlaczego bez cookies to dobra wiadomość" />
            <p>
              Banery zgód zabierają pierwsze sekundy wizyty, a spora część ludzi klika „odrzuć”. Wtedy narzędzia oparte
              na cookies widzą tylko część ruchu. Nasze statystyki nie zapisują niczego w przeglądarce, więc działają
              niezależnie od wyboru w banerze, a Ty nie wyświetlasz z ich powodu kolejnego okienka.
            </p>
            <p className="c-honest">
              Jeśli korzystasz z reklam i potrzebujesz pełnego śledzenia konwersji, możesz dalej używać swojego
              narzędzia. Nasze statystyki nie gryzą się z innymi.
            </p>
          </div>
          <Card>
            <ul className="ticks" style={{ gridTemplateColumns: '1fr', marginTop: 0 }}>
              {ZASADY.map((z) => (
                <li key={z}>{z}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="s-jak">
        <div className="wrap">
          <SectionHead id="s-jak" title="Jak włączyć statystyki" />
          <Steps items={KROKI} />
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="s-faq">
        <div className="wrap c-narrow">
          <SectionHead id="s-faq" title="Pytania o statystyki" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="c-note" style={{ marginTop: 18 }}>
            Zobacz też: <Link href="/funkcje">wszystkie funkcje</Link> · <Link href="/funkcje/rodo-i-dpa">RODO i DPA</Link>{' '}
            · <Link href="/hosting">hosting</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Poznaj swoich odwiedzających bez cookies"
        text="Statystyki są w cenie hostingu — 45 zł/mies albo 449 zł/rok brutto. Włączasz je w panelu."
        primaryHref={ZAMOW}
        secondary={{ label: 'Wszystkie funkcje', href: '/funkcje' }}
      />
    </main>
  );
}

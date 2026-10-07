import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, SectionHead, StickyBuy, Steps, type Step } from '../../components/ui';
import { KalkulatorPiku } from '../../components/KalkulatorPiku';
import { PANEL } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Hosting pod sklep i WooCommerce | Verris',
  description:
    'Hosting dla sklepu internetowego z autoskalowaniem — moc rośnie w Black Friday i w szczycie sprzedaży, a po piku zwalnia. SSL, kopie i migracja w cenie. 45 zł/mies lub 449 zł/rok brutto.',
  alternates: { canonical: '/hosting/sklep' },
};

// Ta sama oś i te same liczby co na /hosting (Pricing.tsx, KalkulatorPiku) — tu opowiedziane na przykładzie promocji.
const OS: Step[] = [
  {
    label: 'Zwykły dzień',
    title: 'Sklep pracuje w bazie',
    text: 'Do 2 vCPU i do 8 GB RAM w cenie abonamentu. Dopłata: 0 zł.',
    bar: 33,
  },
  {
    label: 'Start promocji',
    title: 'Ruch rośnie — moc też',
    text: 'System dokłada vCPU i RAM w ciągu minut, do 24 vCPU i 64 GB RAM. Koszyk działa, zamiast zatrzymać się na limicie pakietu.',
    bar: 98,
    accent: true,
  },
  {
    label: 'Po promocji',
    title: 'Powrót do bazy',
    text: 'Nadwyżka znika, naliczanie kończy się w ciągu kilkunastu minut. Płacisz za godziny piku, nie za cały miesiąc.',
    bar: 38,
  },
];

const ZYSKI: { t: string; p: string }[] = [
  { t: 'Moc na żądanie', p: 'Autoskalowanie do 24 vCPU i 64 GB RAM — pik sprzedaży nie kończy się błędem 503.' },
  { t: 'Płacisz za użycie', p: 'Rozliczenie w blokach po 15 minut zamiast najdroższego pakietu „na wszelki wypadek”.' },
  { t: 'SSL w cenie', p: 'Koszyk i płatności po HTTPS bez dopłat.' },
  { t: 'Kopie z odtwarzaniem', p: 'Kopie z 30 dni poza serwerem — wrócisz do stanu sprzed nieudanej aktualizacji wtyczki.' },
  { t: 'Stare wersje PHP', p: 'PHP 7.4–8.3 osobno dla każdej domeny — motyw i wtyczki nie muszą nadążać od pierwszego dnia.' },
  { t: 'Limit kosztów', p: 'Ustawiasz w panelu limit kosztu autoskalowania. Po jego osiągnięciu zasoby przestają rosnąć.' },
];

const FAQ: [string, string][] = [
  [
    'Ile zapłacę za pik sprzedaży?',
    'Dopłata zależy od mocy i czasu trwania piku: 1 vCPU·h = 0,1323 zł, 1 GB RAM·h = 0,0882 zł, naliczanie w blokach po 15 minut. Policzysz ją w kalkulatorze powyżej. Baza (do 2 vCPU i do 8 GB RAM) jest zawsze w abonamencie.',
  ],
  [
    'Czy mogę ograniczyć koszty autoskalowania?',
    'Tak. W panelu ustawiasz limit kosztu autoskalowania — po jego osiągnięciu zasoby przestają rosnąć. Zużycie CPU, RAM i I/O widzisz na wykresach, a dopłaty w historii portfela.',
  ],
  [
    'Czy przeniesiecie mój sklep?',
    'Tak, w ramach bezpłatnej migracji: pliki, bazy danych i pocztę przenosi zespół albo robisz to migratorem w panelu. Stary sklep działa do momentu przełączenia DNS.',
  ],
];

export default function Page() {
  return (
    <main>
      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Sklep' }]} />
            <h1>Sklep, który nie pada w piku sprzedaży</h1>
            <p className="lead">
              Black Friday, wysyłka newslettera, wejście do mediów — właśnie wtedy sklep potrzebuje mocy. Autoskalowanie
              doda ją automatycznie i rozliczy tylko za czas piku.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="hosting">
                Załóż konto
              </Button>
              <Button href="#kalkulator" variant="ghost" cta="subhero-kalkulator">
                Policz koszt piku
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">W abonamencie</h2>
            <dl>
              <div>
                <dt>Procesor</dt>
                <dd>do 2 vCPU</dd>
              </div>
              <div>
                <dt>RAM</dt>
                <dd>do 8 GB</dd>
              </div>
              <div>
                <dt>Dysk NVMe</dt>
                <dd>50 GB</dd>
              </div>
              <div>
                <dt>SSL i migracja</dt>
                <dd>0 zł</dd>
              </div>
            </dl>
            <h2 className="incl-h">W piku, automatycznie</h2>
            <p className="incl-peak">do 24 vCPU · 64 GB RAM · 1000 GB</p>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Szczyt sprzedaży krok po kroku" title="Jak sklep przechodzi przez promocję?" />
          <Steps items={OS} variant="os" />
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap split">
          <SectionHead
            eyebrow="Kalkulator"
            title="Ile kosztuje pik?"
            lead="Przesuń suwaki — liczymy według stawek z cennika. Baza (do 2 vCPU i do 8 GB RAM) jest zawsze w abonamencie."
          />
          <KalkulatorPiku />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead
            eyebrow="Korzyści"
            title="Dlaczego sklep na Verris"
            lead={
              <>
                Prowadzisz sklep na WordPressie z WooCommerce? Zobacz też <Link href="/hosting/wordpress">hosting WordPress</Link>.
              </>
            }
          />
          <div className="grid3">
            {ZYSKI.map((z) => (
              <Card key={z.t}>
                <h3>{z.t}</h3>
                <p>{z.p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="Pytania" title="Częste pytania o hosting dla sklepu" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Przygotuj sklep na sezon"
        text="Przenieś go do Verris za 0 zł i wejdź w pik z zapasem mocy na żądanie."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

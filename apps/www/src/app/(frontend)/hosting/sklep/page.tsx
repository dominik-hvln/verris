import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, Steps, type Step } from '../../components/ui';
import { MobilnyPasek } from '../../components/MobilnyPasek';
import { pobierzCeny } from '@/lib/ceny-api';
import { netto, stawka, zl, zlGrosze, type CenaPakietu } from '@/lib/ceny';
import { pasekHostingu } from '@/lib/proba';
import { ZAMOW } from '@/lib/site';
import { faqSchema, ofertyHostingu, productSchema } from '@/lib/schema';
import { formatZl, kosztPiku, PRZYKLAD_BLACK_FRIDAY } from '@/lib/kalkulator';
import { PHP_ZAKRES, zweryfikowane } from '@/lib/oferta';

// Makieta 14.10, plansza HostingSklep (title z makiety, 55 zn.).
export const metadata: Metadata = {
  title: 'Hosting dla sklepu internetowego i WooCommerce | Verris',
  description:
    'Hosting dla sklepu: dodatkowa moc w Black Friday, kopie bazy zamówień, które przywracasz sam, i zapora WAF. Przeniesienie sklepu gratis.',
  alternates: { canonical: '/hosting/sklep' },
};

// P2-09: ten sam przykład Black Friday co na /hosting i w kalkulatorze /cennik (lib/kalkulator.ts), liczony ze stawek.
const { vcpu: BF_VCPU, ramGb: BF_RAM, godziny: BF_GODZ } = PRZYKLAD_BLACK_FRIDAY;

const NAJWAZNIEJSZE: [string, string][] = [
  ['do 24 vCPU i 64 GB RAM', 'w szczycie sprzedaży, automatycznie'],
  ['SLA 99,5%', 'z rekompensatą według regulaminu'],
  ['kopia przed przywróceniem', 'bazę zamówień przywracasz sam'],
  ['WAF i skaner', 'ochrona sklepu i danych klientów'],
];

const MOMENTY: Step[] = [
  {
    label: 'piątek, 20:00',
    title: 'Promocja ruszyła lepiej, niż zakładałeś',
    text: 'Co minutę sprawdzamy obciążenie konta i dokładamy procesora i pamięci, gdy zaczyna ich brakować. Płacisz tylko za czas szczytu, do limitu z panelu.',
    accent: true,
  },
  {
    label: 'wtorek, 23:40',
    title: 'Aktualizacja wtyczki płatności coś zepsuła',
    text: 'Przywracasz pliki i bazę z ostatniej kopii. Zanim to zrobisz, zapisujemy obecny stan, więc przywrócenie da się cofnąć.',
  },
  {
    label: 'noc, 03:15',
    title: 'Ktoś próbuje włamać się do sklepu',
    text: 'Zapora aplikacji (WAF) zatrzymuje typowe ataki na formularze i wtyczki, a ImunifyAV skanuje pliki w tle. Każde konto działa w osobnej izolacji.',
  },
];

const PLATFORMY = zweryfikowane([
  { t: 'WooCommerce', p: 'Cache LiteSpeed i Redis dla bazy — sklep na WordPressie działa szybko także przy wielu klientach naraz.', po: true },
  { t: 'PrestaShop', p: `Wersję PHP (${PHP_ZAKRES}) dobierasz do sklepu, osobno dla każdej domeny.` },
  { t: 'Inne sklepy na PHP', p: 'SSH w izolowanym środowisku i Node.js dla sklepów, które wymagają więcej narzędzi.', po: true },
  { t: 'Poczta sklepu', p: 'zamowienia@ i sklep@ w Twojej domenie, z aliasami i przekierowaniami.' },
]);

const faqSklepu = (c: CenaPakietu): [string, string][] => [
  [
    'Jaki hosting dla sklepu internetowego wybrać?',
    `Taki, który nie zwalnia przy dużym ruchu, ma kopie z samodzielnym przywracaniem i chroni dane klientów. W Verris to jeden pakiet za ${zl(c.miesiecznie)} miesięcznie brutto (${zl(netto(c.miesiecznie))} netto), z dodatkową mocą na dni szczytu.`,
  ],
  [
    'Co się stanie, gdy w Black Friday ruch wzrośnie kilkukrotnie?',
    'Autoskalowanie dołoży procesora i pamięci — do 24 vCPU i 64 GB RAM — a po szczycie moc wróci do pakietu. Bez limitu płacisz za faktyczne użycie. Limit kosztu na 30 dni ustawisz przy zamówieniu albo w panelu; po jego osiągnięciu zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
  ],
  ['Czy hosting nadaje się dla WooCommerce?', 'Tak. Masz cache LiteSpeed, Redis dla bazy, dyski NVMe i wersję PHP wybraną dla sklepu.'],
  [
    'Czy przeniesiecie mój sklep z innego hostingu?',
    'Tak, za darmo. Pliki, bazę i pocztę kopiujemy sami, a sklep sprzedaje u starego dostawcy, dopóki nie przełączysz domeny. Tuż przed przełączeniem dogrywamy ostatnie zamówienia z bazy: sklep ma wtedy kilka minut przerwy w składaniu zamówień, o wybranej przez Ciebie porze.',
  ],
  [
    'Jak często robicie kopie sklepu?',
    'Codziennie. Szyfrowane kopie z ostatnich 30 dni trzymamy poza serwerem sklepu. Przywracasz sam pliki, bazę albo pocztę z wybranego dnia.',
  ],
];

export default async function Page() {
  const ceny = await pobierzCeny();
  const m = ceny.hosting.miesiecznie;
  const BF = kosztPiku(BF_VCPU, BF_RAM, BF_GODZ, ceny.stawki);
  const FAQ = faqSklepu(ceny.hosting);
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting dla sklepu internetowego Verris',
          description:
            'Hosting dla sklepów WooCommerce i PrestaShop z autoskalowaniem do 24 vCPU i 64 GB RAM, kopiami z 30 dni przywracanymi samodzielnie, zaporą WAF i bezpłatnym przeniesieniem sklepu.',
          path: '/hosting/sklep',
          offers: ofertyHostingu(ceny),
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />

      <section className="subhero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="subhero-inner">
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Dla sklepu' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Hosting dla sklepu internetowego
            </span>
            <h1>Hosting dla sklepu, który nie zawiedzie w Black Friday</h1>
            <p className="lead">
              Każda sekunda ładowania koszyka to porzucone zamówienia. Dlatego sklep dostaje u nas szybki serwer na co
              dzień i dodatkową moc wtedy, gdy klienci przychodzą tłumnie. Dla WooCommerce, PrestaShopu i innych sklepów
              na PHP.
            </p>
            <div className="hero-cta">
              <Button href={ZAMOW} cta="subhero" plan="hosting">
                Zamów hosting dla sklepu
              </Button>
              <Button href="/hosting#pokaz" variant="ghost" cta="subhero-alt">
                Zobacz, jak rośnie moc w szczycie
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="a-band" aria-label="Najważniejsze">
        <ul className="wrap a-params a-params-4">
          {NAJWAZNIEJSZE.map(([b, s]) => (
            <li key={b}>
              <b>{b}</b>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead title="Trzy momenty, w których sklep potrzebuje dobrego hostingu" />
          <Steps items={MOMENTY} variant="os" />
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap">
          <SectionHead title="Działa z Twoim sklepem" />
          <div className="a-grid4">
            {PLATFORMY.map((z) => (
              <Card key={z.t}>
                <h3>{z.t}</h3>
                <p>{z.p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" id="black-friday">
        <div className="wrap a-cennik">
          <div>
            <SectionHead
              title="Ile kosztuje Black Friday na hostingu?"
              lead={`Przykład: sklep przez ${BF_GODZ} godzin potrzebuje ${BF_VCPU} vCPU i ${BF_RAM} GB pamięci więcej niż zwykle. Dopłata za te godziny to ${formatZl(BF)} zł brutto. Przez resztę roku płacisz ${zl(m)} miesięcznie brutto (${zl(netto(m))} netto), zamiast co miesiąc opłacać większy pakiet „na zapas”.`}
            />
            <p>
              <Link href="/cennik#kalkulator">Policz swój przypadek w kalkulatorze →</Link>
            </p>
            <p className="kalk-note">
              ({BF_VCPU * 100}% CPU × {stawka(ceny.stawki.cpu)} zł + {BF_RAM} GB × {stawka(ceny.stawki.ram)} zł) × {BF_GODZ} h ={' '}
              {formatZl(BF)} zł brutto ({formatZl(netto(BF))} zł netto). Naliczanie w blokach po 15 minut.
            </p>
          </div>
          <Card accent>
            <dl className="a-kv">
              <div>
                <dt>Hosting w listopadzie</dt>
                <dd>{zlGrosze(m)}</dd>
              </div>
              <div>
                <dt>Dodatkowa moc ({BF_GODZ} h)</dt>
                <dd>{formatZl(BF)} zł</dd>
              </div>
              <div className="a-kalk-suma">
                <dt>Razem za listopad</dt>
                <dd className="mint">
                  {zlGrosze(m + BF)} <small>brutto ({zlGrosze(netto(m + BF))} netto)</small>
                </dd>
              </div>
              <div>
                <dt>Pozostałe 11 miesięcy</dt>
                <dd>{zl(m)} / mies.</dd>
              </div>
            </dl>
          </Card>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania o hosting dla sklepu" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting/wordpress">Hosting WordPress</Link> · <Link href="/przenies-strone">Przeniesienie sklepu</Link> ·{' '}
            <Link href="/cennik">Cennik</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Przygotuj sklep na najlepszy dzień w roku. Przeniesienie w cenie"
        text="Moc na Black Friday, kopie bazy zamówień i ochrona sklepu. Sklep przeniesiemy za Ciebie: przerwa w zamówieniach to kilka minut, o wybranej porze."
        primaryLabel="Zamów hosting dla sklepu"
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <MobilnyPasek {...pasekHostingu(ceny)} />
    </main>
  );
}

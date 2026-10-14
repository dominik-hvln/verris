import Link from 'next/link';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy, Steps, type Step } from '../../components/ui';
import { ZAMOW } from '@/lib/site';
import { faqSchema, HOSTING_OFFERS, productSchema } from '@/lib/schema';
import { zweryfikowane } from '@/lib/oferta';

// Makieta 14.10, plansza HostingWordpress (title z makiety, 59 zn.).
export const metadata: Metadata = {
  title: 'Hosting WordPress — szybki, z kopiami i stagingiem | Verris',
  description:
    'Hosting WordPress z cache LiteSpeed, wersją testową strony i kopiami, które przywracasz sam. Przeniesienie WordPressa gratis. 45 zł/mies. brutto.',
  alternates: { canonical: '/hosting/wordpress' },
};

type Poz = { t: string; p: ReactNode; po?: boolean };
const SZYBKOSC: Poz[] = zweryfikowane([
  {
    t: 'Cache LiteSpeed',
    p: 'Serwer zapamiętuje gotowe strony, więc kolejny gość nie czeka, aż PHP i baza wszystko policzą od nowa.',
    po: true,
  },
  {
    t: 'Dyski NVMe i Redis',
    p: 'Baza odpowiada szybko nawet przy dużym sklepie, a Redis trzyma w pamięci to, o co WordPress pyta najczęściej.',
    po: true,
  },
  {
    t: 'Nowe i starsze PHP',
    p: 'Wybierasz wersję PHP (7.4–8.3) dla każdej strony osobno. Stara strona na starszym PHP nie blokuje nowej.',
  },
  {
    t: 'Moc na dni z ruchem',
    p: (
      <>
        Gdy wpis trafi na Facebooka albo ruszy reklama, autoskalowanie doda procesora i pamięci na te godziny.{' '}
        <Link href="/hosting#pokaz">Zobacz, jak to działa</Link>.
      </>
    ),
  },
]);

const AKTUALIZACJE: Step[] = [
  {
    label: '1',
    title: 'Widzisz, co wymaga aktualizacji',
    text: 'Panel pokazuje wtyczki i motywy z nowszą wersją i wyróżnia te, w których są znane podatności.',
  },
  {
    label: '2',
    title: 'Sprawdzasz na wersji testowej',
    text: 'Jednym kliknięciem robisz kopię strony do testów (staging). Klienci dalej widzą działającą wersję.',
  },
  {
    label: '3',
    title: 'Publikujesz albo cofasz',
    text: 'Działa? Aktualizujesz stronę. Coś się posypało? Przywracasz kopię z wczoraj, bez pisania do pomocy.',
  },
];

const W_PAKIECIE = zweryfikowane([
  { t: 'instalacja WordPressa jednym kliknięciem' },
  { t: 'wersja testowa strony (staging)' },
  { t: 'SSH i Git dla twórców stron', po: true },
  { t: 'zabezpieczenia wp-config.php i tryb konserwacji z panelu' },
  { t: 'certyfikat SSL dla każdej domeny' },
  { t: 'skaner złośliwego kodu ImunifyAV', po: true },
]);

const PRZENIESIENIE: [string, string][] = [
  ['Koszt przeniesienia', '0 zł'],
  ['Przerwa w działaniu', 'brak — stara strona działa do przełączenia'],
  ['Ty podajesz', 'dostęp do starego hostingu i hasła skrzynek'],
];

const FAQ: [string, string][] = [
  [
    'Jaki hosting dla WordPressa wybrać?',
    'Taki, który ma cache na poziomie serwera (u nas LiteSpeed), szybkie dyski NVMe, aktualne PHP i kopie, które przywracasz sam. Wszystko to jest w naszym pakiecie za 45 zł miesięcznie brutto.',
  ],
  [
    'Ile stron WordPress zmieszczę na jednym koncie?',
    'Nie liczymy stron. Granicą są zasoby konta: 50 GB NVMe, do 8 GB RAM i do 2 vCPU w cenie, a w szczycie autoskalowanie dokłada mocy.',
  ],
  [
    'Czy przeniesiecie mojego WordPressa z innego hostingu?',
    'Tak, za darmo. Podajesz dostęp do starego hostingu, a my kopiujemy pliki, bazę i pocztę. Możesz też użyć migratora w panelu. Stara strona działa, dopóki nie przełączysz domeny.',
  ],
  [
    'Czy mogę testować zmiany bez ryzyka?',
    'Tak. Wersję testową strony tworzysz jednym kliknięciem. A gdy coś pójdzie nie tak na stronie, przywracasz kopię — przed przywróceniem system zapisuje kopię bezpieczeństwa obecnego stanu.',
  ],
  [
    'Czy WooCommerce też będzie działać szybko?',
    'Tak. Dla sklepów mamy osobną stronę z opisem tego, co ważne przy zamówieniach i koszyku — zobacz hosting dla sklepu.',
  ],
];

export default function Page() {
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting WordPress Verris',
          description:
            'Hosting WordPress z autoskalowaniem: instalacja jednym kliknięciem, wersja testowa (staging), kopie z 30 dni przywracane samodzielnie, SSL i przeniesienie strony w cenie.',
          path: '/hosting/wordpress',
          offers: HOSTING_OFFERS,
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'WordPress' }]} />
            <span className="chip" style={{ marginTop: 18 }}>
              Hosting WordPress
            </span>
            <h1>Hosting WordPress, przy którym przestajesz się martwić o stronę</h1>
            <p className="lead">
              Szybki serwer z cache LiteSpeed, ostrzeżenia o wtyczkach z lukami, kopie, które przywracasz sam, i wersja
              testowa strony, na której sprawdzisz nową wtyczkę. Wszystko w jednym pakiecie za 45 zł miesięcznie.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="subhero" plan="hosting">
                Zamów hosting WordPress
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="subhero-alt">
                Przenieś swojego WordPressa za darmo
              </Button>
            </div>
          </div>
          <div className="a-screen a-screen-hero" role="img" aria-label="Przykładowy ekran panelu: WordPress aktualny, dwie wtyczki do aktualizacji, wersja testowa gotowa.">
            <p className="a-screen-title">WordPress · sklep-ogrodowy.pl</p>
            {(
              [
                ['WordPress', 'aktualny'],
                ['Wtyczki do aktualizacji', '2 · w tym 1 z luką'],
                ['Wersja testowa', 'gotowa'],
                ['Cache LiteSpeed', 'włączony'],
              ] as const
            ).map(([a, b]) => (
              <p key={a}>
                <span>{a}</span>
                <span className="mono mint">{b}</span>
              </p>
            ))}
            <small>Przykładowe dane. Ekran poglądowy panelu Verris.</small>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead title="Co sprawia, że WordPress działa u nas szybciej?" />
          <div className="a-grid4">
            {SZYBKOSC.map((z) => (
              <Card key={z.t}>
                <h3>{z.t}</h3>
                <p>{z.p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt">
        <div className="wrap a-cennik">
          <div>
            <SectionHead title="Spokojna głowa przy aktualizacjach" />
            <Steps items={AKTUALIZACJE} variant="lista" />
          </div>
          <Card accent>
            <h3>W pakiecie dla WordPressa</h3>
            <ul className="a-list">
              {W_PAKIECIE.map((i) => (
                <li key={i.t}>{i.t}</li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap a-cennik">
          <SectionHead
            title="Masz już WordPressa gdzie indziej? Przeniesiemy go za Ciebie"
            lead={
              <>
                Podajesz dostęp do starego hostingu. Pliki, bazę i pocztę kopiujemy sami. Stara strona działa, dopóki nie
                przełączysz domeny. Szczegóły znajdziesz na stronie <Link href="/przenies-strone">przeniesienia strony</Link>.
              </>
            }
          />
          <dl className="a-kv">
            {PRZENIESIENIE.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania o hosting WordPress" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting/sklep">Hosting dla sklepu</Link> · <Link href="/funkcje/kopie-zapasowe">Kopie zapasowe</Link> ·{' '}
            <Link href="/cennik">Cennik</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Twój WordPress zasługuje na szybki dom. 45 zł miesięcznie, z przeniesieniem w cenie"
        text="Cache LiteSpeed, kopie, które przywracasz sam, i wersja testowa strony. WordPressa przeniesiemy za Ciebie."
        primaryLabel="Zamów hosting WordPress"
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <StickyBuy />
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy, Steps, type Step } from '../components/ui';
import { ASymulacja } from '../components/ASymulacja';
import { AZakladki, type Zakladka } from '../components/AZakladki';
import { KalkulatorPiku } from '../components/KalkulatorPiku';
import { ZAMOW } from '@/lib/site';
import { faqSchema, HOSTING_OFFERS, productSchema } from '@/lib/schema';
import { SPECYFIKACJA_OPUBLIKOWANA, zweryfikowane } from '@/lib/oferta';
import { formatZl, kosztPiku } from '@/lib/kalkulator';

// Makieta 14.10, plansza Hosting + notatka „seo-hosting” (canvas.json).
export const metadata: Metadata = {
  title: 'Hosting z autoskalowaniem dla stron i sklepów | Verris',
  description:
    'Hosting, który sam dokłada mocy, gdy rośnie ruch, i wraca do 45 zł, gdy jest spokojnie. Zobacz symulację tygodnia sklepu i policz koszt.',
  alternates: { canonical: '/hosting' },
};

const W_CENIE: [string, string, string][] = [
  ['W cenie', 'do 2 vCPU · do 8 GB', 'i 50 GB NVMe'],
  ['W piku do', '24 vCPU · 64 GB', 'i 1000 GB dysku'],
  ['Dostępność', 'SLA 99,5%', 'z rekompensatą'],
  ['Bez limitu', 'stron i skrzynek', 'w ramach zasobów konta'],
];

const JAK: Step[] = [
  {
    label: '01 · włączasz',
    title: 'Jeden przełącznik i limit kosztu',
    text: 'Decydujesz, ile najwyżej możesz dopłacić w miesiącu. Po osiągnięciu limitu zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
  },
  {
    label: '02 · pilnujemy',
    title: 'Moc rośnie razem z ruchem',
    text: 'Co minutę sprawdzamy procesor i pamięć Twojego konta. Gdy zaczyna brakować, dokładamy — strona działa dalej bez przerwy.',
    accent: true,
  },
  {
    label: '03 · oszczędzasz',
    title: 'Po szczycie wracasz do 45 zł',
    text: 'Nie przepłacasz przez cały rok za większy pakiet, który przydaje się kilka dni. Każdy blok z dodatkową mocą i jego koszt widzisz w panelu.',
  },
];

// Scenariusze miesiąca: koszt liczony ze stawek (lib/kalkulator.ts) dla podanej nadwyżki — nie wpisany ręcznie.
type Scenariusz = { id: string; label: string; title: string; text: string; vcpu: number; ram: number; godz: number; piki: number[] };
const SCENARIUSZE: Scenariusz[] = [
  {
    id: 'black-friday',
    label: 'Sklep w Black Friday',
    title: 'Sklep w Black Friday',
    text: 'Przez trzy dni na stronie jest kilka razy więcej osób niż zwykle. Dokładamy procesora i pamięci tylko na te godziny, a w poniedziałek wszystko wraca do normy.',
    vcpu: 4,
    ram: 8,
    godz: 36,
    piki: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, 4, 5, 3, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 'kampania',
    label: 'Kampania reklamowa',
    title: 'Kampania reklamowa w tygodniu',
    text: 'Reklama najlepiej działa wieczorem i wtedy strona potrzebuje więcej mocy. Rano znowu mieści się w pakiecie.',
    vcpu: 2,
    ram: 4,
    godz: 20,
    piki: [0, 0, 0, 0, 1, 2, 1, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  {
    id: 'spokojny',
    label: 'Spokojny miesiąc',
    title: 'Zwykły miesiąc firmy',
    text: 'Strona spokojnie mieści się w pakiecie, więc płacisz 45 zł i nic więcej.',
    vcpu: 0,
    ram: 0,
    godz: 0,
    piki: Array(20).fill(0),
  },
];

const ZAKLADKI: Zakladka[] = SCENARIUSZE.map((s) => {
  const koszt = kosztPiku(s.vcpu, s.ram, s.godz);
  return {
    id: s.id,
    label: s.label,
    panel: (
      <div className="a-tabpanel">
        <div className="a-tabtxt">
          <h3>{s.title}</h3>
          <p>{s.text}</p>
          <dl className="a-kv">
            <div>
              <dt>Godziny piku</dt>
              <dd>{s.godz} h</dd>
            </div>
            {s.godz > 0 && (
              <div>
                <dt>Nadwyżka w piku</dt>
                <dd>
                  +{s.vcpu} vCPU · +{s.ram} GB RAM
                </dd>
              </div>
            )}
            <div>
              <dt>Dopłata w miesiącu (brutto)</dt>
              <dd className="mint">{koszt > 0 ? `${formatZl(koszt)} zł` : '0 zł'}</dd>
            </div>
          </dl>
          <p className="kalk-note">Przykład poglądowy liczony ze stawek z cennika.</p>
        </div>
        <div>
          <div className="a-bars" role="img" aria-label={`Wykres miesiąca: ${s.title}, ${s.godz} godzin piku.`}>
            {s.piki.map((p, i) => (
              <span key={i} style={{ height: `${90 + p * 25}px` }}>
                {p > 0 && <i style={{ height: `${p * 25}px` }} />}
              </span>
            ))}
          </div>
          <p className="a-bars-axis" aria-hidden="true">
            <span>1. dzień</span>
            <span>środek miesiąca</span>
            <span>koniec</span>
          </p>
          <ul className="a-legend">
            <li>
              <i className="l-baza" aria-hidden="true" />
              zasoby w pakiecie
            </li>
            <li>
              <i className="l-pik" aria-hidden="true" />
              pik (dopłata)
            </li>
          </ul>
        </div>
      </div>
    ),
  };
});

type Poz = { t: string; po?: boolean };
const PAKIET: { title: string; items: Poz[] }[] = [
  {
    title: 'Wydajność',
    items: [
      { t: 'LiteSpeed Enterprise z cache', po: true },
      { t: 'dyski NVMe' },
      { t: 'Redis i Memcached dla konta', po: true },
      { t: 'wersja PHP osobno dla każdej domeny' },
    ],
  },
  {
    title: 'Bezpieczeństwo',
    items: [
      { t: 'izolacja kont', po: true },
      { t: 'zapora aplikacji (WAF)', po: true },
      { t: 'skaner ImunifyAV w tle i na żądanie', po: true },
      { t: 'certyfikaty SSL w cenie' },
      { t: 'logowanie dwuskładnikowe i passkeys' },
    ],
  },
  {
    title: 'Kopie i odtwarzanie',
    items: [
      { t: 'szyfrowane kopie poza serwerem z ostatnich 30 dni' },
      { t: 'przywracanie plików, baz i poczty osobno' },
      { t: 'kopia bezpieczeństwa przed przywróceniem' },
      { t: 'codzienna kopia na serwerze, 7 ostatnich' },
    ],
  },
  {
    title: 'Dla deweloperów',
    items: [
      { t: 'SSH w izolowanym środowisku', po: true },
      { t: 'wdrożenia z Git', po: true },
      { t: 'kopia testowa (staging) WordPressa' },
      { t: 'Node.js i Python', po: true },
      { t: 'cron w panelu' },
    ],
  },
].map((g) => ({ ...g, items: zweryfikowane(g.items) }));

const WYBOR: [string, string, string][] = [
  ['Ile zapłacę przy odnowieniu?', 'niska cena pierwszego roku bywa wyraźnie niższa od odnowienia', 'ta sama cena z cennika, przypomnienie przed odnowieniem'],
  ['Co, gdy strona padnie?', 'obietnica bez rekompensaty niewiele daje', 'SLA 99,5% i rekompensata w kredytach według regulaminu'],
  ['Czy przywrócę kopię sam?', 'zgłoszenie do pomocy to godziny przestoju', 'tak — pliki, baza albo poczta z wybranego dnia'],
  ['Gdzie są dane?', 'RODO i umowa powierzenia', 'w UE, umowa powierzenia do akceptacji w panelu'],
];

const FAQ: [string, string][] = [
  [
    'Ile kosztuje hosting z autoskalowaniem?',
    'Pakiet kosztuje 45 zł miesięcznie albo 449 zł za rok brutto. W cenie masz 50 GB NVMe, do 8 GB RAM i do 2 vCPU. Dodatkową moc w piku liczymy według jawnych stawek brutto w blokach po 15 minut, do limitu, który ustawiasz w panelu.',
  ],
  [
    'Czy autoskalowanie może mnie zaskoczyć rachunkiem?',
    'Nie. Ustawiasz miesięczny limit kosztu autoskalowania. Gdy dopłaty go osiągną, zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
  ],
  [
    'Do ilu zasobów rośnie konto w piku?',
    'Do 24 vCPU, 64 GB RAM i 1000 GB dysku. Po spadku ruchu konto wraca do zasobów z pakietu, a naliczanie kończy się w ciągu kilkunastu minut.',
  ],
  [
    'Czy przeniesiecie moją stronę?',
    'Tak, bezpłatnie w ramach zamówienia hostingu — stronę, bazy i pocztę. Stara strona działa, dopóki nie przełączysz domeny.',
  ],
];

export default function HostingPage() {
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Hosting WWW z autoskalowaniem dla stron i sklepów. W cenie 50 GB NVMe, do 8 GB RAM i do 2 vCPU; w piku do 24 vCPU, 64 GB RAM i 1000 GB dysku. Przeniesienie strony i SSL w cenie.',
          path: '/hosting',
          offers: HOSTING_OFFERS,
        })}
      />
      <JsonLd data={faqSchema(FAQ)} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting' }]} />
            <span className="chip" style={{ marginTop: 18 }}>
              Hosting z autoskalowaniem
            </span>
            <h1>Hosting WWW, który nie zwalnia, kiedy przychodzą klienci</h1>
            <p className="lead">
              Reklama zadziałała, ktoś polecił Cię w mediach, ruszyła wyprzedaż — i nagle na stronie jest kilka razy
              więcej osób. U nas nie musisz wtedy w pośpiechu zmieniać pakietu. Dokładamy mocy na te godziny, a gdy ruch
              opadnie, wracasz do zwykłych 45 zł.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="subhero" plan="hosting">
                Zamów hosting
              </Button>
              <Button href="#pokaz" variant="ghost" cta="subhero-pokaz">
                Zobacz, jak to działa
              </Button>
            </div>
          </div>
          <ul className="a-tiles a-tiles-2">
            {W_CENIE.map(([k, v, d]) => (
              <li key={k}>
                <small>{k}</small>
                <b>{v}</b>
                <small>{d}</small>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="pokaz" aria-labelledby="pokaz-tytul">
        <div className="wrap">
          <SectionHead
            id="pokaz-tytul"
            eyebrow="Zobacz na przykładzie"
            title="Zobacz, co się dzieje, gdy Twoja reklama naprawdę zadziała"
            lead="Tydzień zwykłego sklepu internetowego. W czwartek startuje kampania i nagle na stronie jest kilka razy więcej osób. Moc serwera rośnie razem z ruchem, a po szczycie wraca do pakietu. Wyłącz autoskalowanie i porównaj, jak wyglądałby ten sam weekend bez niego."
          />
          <ASymulacja />
        </div>
      </section>

      <section className="sec sec-alt" id="jak">
        <div className="wrap">
          <SectionHead title="Ty ustalasz zasady. Resztą zajmujemy się my" />
          <Steps items={JAK} />
        </div>
      </section>

      <section className="sec" id="scenariusze">
        <div className="wrap">
          <SectionHead title="Ile to kosztuje w prawdziwym miesiącu?" />
          <AZakladki label="Scenariusze" items={ZAKLADKI} />
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap split">
          <SectionHead
            eyebrow="Kalkulator"
            title="Policz swój pik"
            lead="Przesuń suwaki — liczymy według stawek z cennika. Zasoby z pakietu (do 2 vCPU i do 8 GB RAM) są zawsze w abonamencie."
          />
          <KalkulatorPiku />
        </div>
      </section>

      <section className="sec" id="specyfikacja">
        <div className="wrap">
          <SectionHead title="Co dostajesz w pakiecie" />
          <div className="a-grid4">
            {PAKIET.map((g) => (
              <Card key={g.title}>
                <h3>{g.title}</h3>
                <ul className="a-list">
                  {g.items.map((i) => (
                    <li key={i.t}>{i.t}</li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
          {SPECYFIKACJA_OPUBLIKOWANA && (
            <p className="center-cta">
              <Button href="/specyfikacja" variant="ghost">
                Pełna specyfikacja techniczna →
              </Button>
            </p>
          )}
        </div>
      </section>

      <section className="sec sec-alt" id="wybor">
        <div className="wrap">
          <SectionHead
            title="Jak wybrać hosting? Cztery pytania, które warto zadać każdemu dostawcy"
            lead={
              <>
                Pełny przewodnik znajdziesz w artykule <Link href="/jak-wybrac-hosting">Jak wybrać hosting</Link>.
              </>
            }
          />
          <table className="cmp2">
            <thead>
              <tr>
                <th scope="col">Pytanie</th>
                <th scope="col">Dlaczego ważne</th>
                <th scope="col">Verris</th>
              </tr>
            </thead>
            <tbody>
              {WYBOR.map(([q, why, my]) => (
                <tr key={q}>
                  <th scope="row">{q}</th>
                  <td data-label="Dlaczego ważne">{why}</td>
                  <td data-label="Verris" className="vr">
                    {my}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania o hosting z autoskalowaniem" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting/wordpress">Hosting WordPress</Link> · <Link href="/hosting/sklep">Hosting dla sklepu</Link> ·{' '}
            <Link href="/cennik">Cennik</Link> · <Link href="/przenies-strone">Przeniesienie strony</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Daj swojej stronie zapas mocy. Od 45 zł miesięcznie"
        text="Jeden pakiet z mocą w cenie i zapasem na dni, kiedy przychodzi więcej klientów. Przeniesienie strony gratis."
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

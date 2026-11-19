import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead2, Steps, type Step } from '../components/ui';
import { pobierzCeny } from '@/lib/ceny-api';
import { netto, odCeny, zl } from '@/lib/ceny';
import { ctaProby } from '@/lib/proba';
import { pobierzOferteMarki } from '@/lib/kreator-marki-api';
import { cenaBruttoNetto, ileMarek, ileMiesiecy, ileSerii, ileZmianAi, TMVIEW, type OfertaMarki } from '@/lib/kreator-marki';
import { faqSchema, graph, serviceSchema } from '@/lib/schema';

/*
 * Paczka 130 – strona produktu Kreator marki. Istnieje tylko, gdy moduł jest włączony dla wszystkich w panelu admina
 * (GET /public/oferta/kreator-marki → `dostepny: true`); inaczej 404, brak w sitemapie i brak linków w menu.
 * Limity i ceny wyłącznie z API (lib/kreator-marki), ceny hostingu z lib/ceny – bez kwot wpisanych w kod.
 * Ton: forma „Ty”, konkret. Bez obietnic „unikalne / zastrzeżone / gotowe do rejestracji”: logo z kreatora nie jest
 * znakiem towarowym, a sprawdzenie w TMview i rejestracja to decyzja i obowiązek klienta (Regulamin 1.4.0 §13b,
 * docs/legal/drafts/terms.md).
 */
export const metadata: Metadata = {
  title: 'Kreator logo i marki w cenie hostingu | Verris',
  description:
    'Kreator marki Verris: logo w wektorze, kolory, kroje i stopka e-mail dla Twojej firmy. Logo od razu trafia na stronę z Kreatora stron. W cenie hostingu.',
  alternates: { canonical: '/kreator-marki' },
};

function sciezki(o: OfertaMarki): Step[] {
  return [
    {
      label: '01',
      title: 'Nowa marka',
      text: 'Podajesz nazwę, branżę i jedno zdanie o firmie, wybierasz charakter i kolory. Dostajesz sześć kierunków logo, a potem zmieniasz kolor, krój i układ na żywo – bez czekania na AI i bez zużywania limitu.',
    },
    {
      label: '02',
      title: 'Mam już logo – Key Visual',
      text: `Wgrywasz logo (SVG, PDF, PNG albo JPG, do ${o.maksRozmiarWgraniaMb} MB) i potwierdzasz, że masz do niego prawa. Logo zostaje bez zmian – budujemy z niego paletę, wzór i materiały do sieci i druku.`,
    },
    {
      label: '03',
      title: 'Odświeżenie logo',
      text: 'Masz logo, które się zestarzało? Dostajesz trzy kierunki: ewolucję, odświeżenie i nowy kierunek. Przy każdym widzisz, co zostaje, a co się zmienia.',
      accent: true,
    },
  ];
}

const W_CENIE: string[] = [
  'Logo w wektorze (SVG) w wersjach: kolor, jednobarwna, negatyw i biała – w układzie poziomym, pionowym i jako sam znak',
  'PNG i PDF wektorowy do dokumentów i druku',
  'Favicon i ikony aplikacji (180, 192 i 512 px)',
  'Kroje pisma z licencją, która pozwala używać ich komercyjnie',
  'Zasady marki: pole ochronne, minimalne rozmiary, paleta ze sprawdzonym kontrastem',
  'Stopka e-mail w HTML dla skrzynek w Twojej domenie',
  'Logo, kolory i kroje na stronie z Kreatora stron – jednym kliknięciem',
];

function pakiet(o: OfertaMarki): string[] {
  return [
    `${ileSerii(o.pakiet.serie)} i ${ileZmianAi(o.pakiet.zmianyAi)} do wykorzystania`,
    'Księga znaku w PDF – jak używać logo, kolorów i krojów',
    'Wizytówka w PDF do druku: spad 3 mm, linie cięcia i odpowiedniki kolorów CMYK',
    'Papier firmowy',
    'Grafiki do mediów społecznościowych: post, story, okładka Facebooka, baner LinkedIn',
    'Wzór z Twojego znaku do tła, opakowań i materiałów',
    `Nowe szablony materiałów przez ${ileMiesiecy(o.pakiet.aktualizacjeSzablonowMies)}`,
  ];
}

const UCZCIWIE: { tytul: string; tekst: string }[] = [
  {
    tytul: 'Logo z kreatora to nie znak zastrzeżony',
    tekst:
      'Ochronę znaku daje dopiero rejestracja w Urzędzie Patentowym RP (Polska) albo w EUIPO (Unia Europejska). To osobna procedura – zgłaszasz znak sam albo z rzecznikiem patentowym.',
  },
  {
    tytul: 'Sprawdź nazwę i znak w TMview',
    tekst:
      'Zanim zamówisz szyld czy wizytówki, sprawdź w bezpłatnej bazie TMview, czy ktoś nie ma podobnego znaku dla podobnych usług. Pokażemy Ci, jak to zrobić. Nie robimy badania prawnego i nie gwarantujemy, że podobnego znaku nikt nie używa.',
  },
  {
    tytul: 'Bez „logo jak znana marka”',
    tekst: 'Nie przygotujemy logo na wzór cudzej marki. Opis, który prosi o styl konkretnej firmy, kreator odrzuci – to chroni Ciebie przed sporem o podobieństwo.',
  },
  {
    tytul: 'AI pomaga, ale nie rysuje z niczego',
    tekst:
      'Znaki powstają z biblioteki kształtów zaprojektowanej w Verris, a AI dobiera do nich parametry, kroje i kolory. Pliki mają w opisie informację, że powstały z pomocą AI.',
  },
];

function faq(o: OfertaMarki, hostingOd: string): [string, string][] {
  const h = o.wCenieHostingu;
  return [
    [
      'Czy kreator logo jest płatny?',
      `Nie. Kreator marki jest w cenie hostingu (${hostingOd}): ${ileMarek(h.marek)} na koncie, ${ileSerii(h.seriiMies)} i ${ileZmianAi(h.zmianAiMies)} miesięcznie. Płatne są tylko jednorazowe dodatki: Pakiet marki z materiałami do druku i sieci (${cenaBruttoNetto(o.pakiet.brutto)}) i kolejna marka na koncie (${cenaBruttoNetto(o.drugaMarka.brutto)}).`,
    ],
    [
      'Jakie pliki dostanę?',
      'Logo w SVG w kilku wersjach (kolor, jednobarwna, negatyw, biała), PNG i PDF wektorowy, favicon z ikonami aplikacji, kroje z licencją i stopkę e-mail w HTML. Pliki pobierasz jako ZIP i zostają u Ciebie.',
    ],
    [
      'Do kogo należą prawa do logo?',
      'Do pobranego logo i materiałów dostajesz bezterminową licencję niewyłączną bez ograniczeń terytorialnych. Możesz ich używać w firmie, zmieniać je, przekazać pliki drukarni lub agencji i zgłosić logo jako znak towarowy. Licencji nie wypowiemy – zostaje także po zakończeniu hostingu (Regulamin §13b).',
    ],
    [
      'Czy mogę zarejestrować logo jako znak towarowy?',
      'Możesz zgłosić je do Urzędu Patentowego RP albo do EUIPO. Najpierw sprawdź w TMview, czy nie ma podobnych znaków dla podobnych usług. Rejestracja nie oznacza, że nikt nie zgłosi sprzeciwu – urzędy nie sprawdzają same wszystkich wcześniejszych znaków.',
    ],
    [
      'Mam już logo. Co mogę z nim zrobić?',
      `Wgrać je (SVG, PDF, PNG albo JPG, do ${o.maksRozmiarWgraniaMb} MB) i zbudować na nim materiały – logo zostaje bez zmian. Możesz też wybrać odświeżenie: dostaniesz trzy kierunki i zobaczysz, co się zmienia.`,
    ],
    [
      'Czy logo pojawi się na mojej stronie?',
      'Tak, jeśli masz stronę z Kreatora stron. Logo trafia do nagłówka i stopki, kolory i kroje do motywu, a favicon do przeglądarki. Gdy zmienisz markę później, strona nie zmieni się sama – zobaczysz propozycję zmian z podglądem.',
    ],
    [
      'Czy wydrukuję wizytówki z tych plików?',
      'Wizytówka z Pakietu marki to PDF wektorowy ze spadem i liniami cięcia. Kolory zapisujemy w RGB z podanymi odpowiednikami CMYK – przed drukiem poproś drukarnię o sprawdzenie pliku i wydruk próbny.',
    ],
    [
      'Czy mogę mieć drugą markę na koncie?',
      `Tak. Druga i każda kolejna marka kosztuje ${cenaBruttoNetto(o.drugaMarka.brutto)} jednorazowo.`,
    ],
    [
      'Czy mogę odstąpić od zakupu Pakietu marki?',
      'Pakiet marki i kolejną markę udostępniamy od razu po zapłacie. Przy zakupie zgadzasz się na to i potwierdzasz, że z chwilą udostępnienia tracisz prawo odstąpienia od umowy w tym zakresie – potwierdzenie dostaniesz e-mailem. Od umowy hostingu możesz odstąpić w ciągu 14 dni na zasadach Regulaminu.',
    ],
  ];
}

export default async function Page() {
  const oferta = await pobierzOferteMarki();
  // Moduł wyłączony w panelu admina albo nie dla wszystkich – strony nie ma.
  if (!oferta) notFound();
  const ceny = await pobierzCeny();
  const cta = ctaProby(ceny);
  const hostingOd = `${odCeny(ceny.hosting)} brutto, ${zl(netto(ceny.hosting.miesiecznie))} netto`;
  const FAQ = faq(oferta, hostingOd);
  const h = oferta.wCenieHostingu;

  const jsonLd = graph(
    serviceSchema({
      name: 'Kreator marki Verris – kreator logo dla firm',
      description:
        'Kreator logo i marki w cenie hostingu Verris: logo w wektorze w kilku wersjach, paleta, kroje, favicon i stopka e-mail. Jednorazowy Pakiet marki z materiałami do druku i sieci.',
      path: '/kreator-marki',
      offers: [
        {
          '@type': 'Offer',
          price: oferta.pakiet.brutto.toFixed(2),
          priceCurrency: 'PLN',
          availability: 'https://schema.org/InStock',
          description: 'Pakiet marki, płatność jednorazowa, cena brutto',
        },
      ],
    }),
    faqSchema(FAQ),
  );

  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Kreator marki' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Kreator marki
            </span>
            <h1>
              Logo dla Twojej firmy, <span className="mint">w cenie hostingu</span>
            </h1>
            <p className="lead">
              To kreator logo i całej marki: opisujesz firmę, wybierasz jeden z sześciu kierunków i dopracowujesz kolor, krój i układ na
              żywo. Dostajesz logo w wektorze, kolory, kroje i stopkę e-mail – a logo od razu trafia na Twoją stronę.
            </p>
            <div className="hero2-cta">
              <Button href={cta.href} cta="subhero" conv="checkout_intent" plan="hosting">
                {cta.label}
              </Button>
              <Button href="#pakiet" variant="ghost" cta="subhero-alt">
                Co jest w Pakiecie marki
              </Button>
            </div>
            <p className="hero2-fine">Kreator marki jest w hostingu {hostingOd}.</p>
          </div>
          <Card className="incl">
            <h2 className="incl-h">W cenie hostingu</h2>
            <dl>
              <div>
                <dt>Marki na koncie</dt>
                <dd>{h.marek}</dd>
              </div>
              <div>
                <dt>Serie propozycji</dt>
                <dd>{h.seriiMies} / mies.</dd>
              </div>
              <div>
                <dt>Zmiany AI</dt>
                <dd>{h.zmianAiMies} / mies.</dd>
              </div>
              <div>
                <dt>Logo, favicon, kroje, stopka</dt>
                <dd>tak</dd>
              </div>
            </dl>
            <h2 className="incl-h">Pakiet marki</h2>
            <dl>
              <div>
                <dt>Jednorazowo</dt>
                <dd>
                  {zl(oferta.pakiet.brutto)} <span>({zl(netto(oferta.pakiet.brutto))} netto)</span>
                </dd>
              </div>
            </dl>
            <p>Ceny brutto. To nie abonament – pliki zostają u Ciebie.</p>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="km-jak">
        <div className="wrap">
          <SectionHead2
            id="km-jak"
            eyebrow="Jak to działa"
            title="Trzy ścieżki – zależnie od tego, z czym przychodzisz"
            lead="Wszystko robisz w panelu Verris. Zmiana koloru, kroju i układu działa od razu i nie zużywa limitu AI."
          />
          <Steps items={sciezki(oferta)} />
        </div>
      </section>

      <section className="sec sec-alt" id="w-cenie" aria-labelledby="km-cena">
        <div className="wrap">
          <SectionHead2
            id="km-cena"
            eyebrow="W cenie hostingu"
            title="Co dostajesz bez dopłat"
            lead={`${ileMarek(h.marek)} na koncie, ${ileSerii(h.seriiMies)} i ${ileZmianAi(h.zmianAiMies)} miesięcznie. Limity odnawiają się 1. dnia miesiąca.`}
          />
          <ul className="ticks">
            {W_CENIE.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="pakiet" aria-labelledby="km-pakiet">
        <div className="wrap">
          <SectionHead2
            id="km-pakiet"
            eyebrow="Pakiet marki"
            title={`Materiały do druku i sieci: ${cenaBruttoNetto(oferta.pakiet.brutto)}`}
            lead="Płacisz raz, bez abonamentu. Pliki pobierasz i zostają u Ciebie."
          />
          <ul className="ticks">
            {pakiet(oferta).map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <p>
            Druga i każda kolejna marka na koncie: {cenaBruttoNetto(oferta.drugaMarka.brutto)} jednorazowo.
            {oferta.pakietWKreatorzeProRocznym ? ' Z Kreatorem Pro opłacanym rocznie Pakiet marki masz w cenie.' : ''}
          </p>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="km-prawo">
        <div className="wrap">
          <SectionHead2
            id="km-prawo"
            eyebrow="Uczciwie o prawie"
            title="Logo a znak towarowy"
            lead="Kilka rzeczy, które warto wiedzieć, zanim zamówisz szyld, wizytówki albo zgłosisz znak do urzędu."
          />
          <div className="grid3">
            {UCZCIWIE.map((z) => (
              <Card key={z.tytul}>
                <h3>{z.tytul}</h3>
                <p>{z.tekst}</p>
              </Card>
            ))}
          </div>
          <p>
            <a href={TMVIEW} rel="noopener noreferrer" target="_blank">
              Otwórz TMview – bazę znaków towarowych
            </a>
          </p>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead2 eyebrow="FAQ" title="Pytania o Kreator marki" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/kreator-stron">Kreator stron</Link> · <Link href="/hosting">Hosting z autoskalowaniem</Link> ·{' '}
            <Link href="/cennik">Cennik</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Zamów hosting i zrób logo jeszcze dziś"
        text="Kreator marki jest w panelu od pierwszego dnia – logo, kolory i stopka e-mail w jednym miejscu, razem ze stroną i pocztą."
        primaryLabel={cta.label}
        primaryHref={cta.href}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
    </main>
  );
}

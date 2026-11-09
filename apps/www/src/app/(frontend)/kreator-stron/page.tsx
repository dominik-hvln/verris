import Link from 'next/link';
import type { Metadata } from 'next';
import { Accordion, Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead2, Steps, type Step } from '../components/ui';
import { MobilnyPasek } from '../components/MobilnyPasek';
import { pobierzCeny } from '@/lib/ceny-api';
import { cenaPakietu, netto, odCeny, zl, type Ceny } from '@/lib/ceny';
import { ctaProby, pasekHostingu } from '@/lib/proba';
import { DNI_LINKU_PODGLADU, ileLubBezLimitu, JEZYKI_KREATORA_PRO, LIMITY_KREATORA, PRZYKLADY_STRON } from '@/lib/kreator';
import { faqSchema, graph, serviceSchema } from '@/lib/schema';

/*
 * Paczka 123 – strona produktu Verris Kreator. Treść tylko z tego, co jest w kodzie (stan 8.11.2026):
 *  - limity wersji: libs/kreator/src/plany.ts (przepisane w lib/kreator.ts, zgodność pilnuje kreator.spec.ts),
 *  - AI nie wymyśla opinii, cen ani danych: libs/kreator/src/ai/master-prompt.ts i ai/odczyt.ts (walidacja odpowiedzi),
 *  - publikacja, kopia cudzych plików, wycofanie, ZIP, link podglądu 7 dni: apps/api/src/kreator/publikacja.service.ts,
 *  - koniec Pro: apps/client-panel/src/lib/kreator.ts (SKUTKI_KONCA_PRO),
 *  - zdjęcia: wgrywanie (JPEG, PNG, WebP, AVIF) i biblioteki Openverse / Pixabay (apps/api/src/kreator/biblioteka).
 *  - wersje językowe (Pro, paczka 124): libs/kreator/src/jezyki.ts, render (hreflang, przełącznik), ai/tlumaczenie.ts.
 * Celowo bez: przejścia na WordPressa (nie ma go jeszcze w publikacji).
 * Ceny wyłącznie z lib/ceny (GET /plans: verris-hosting i kreator-pro) – bez kwot wpisanych na sztywno.
 */
export const metadata: Metadata = {
  title: 'Kreator stron z AI w cenie hostingu | Verris',
  description:
    'Verris Kreator: opisujesz firmę, AI układa stronę, a Ty poprawiasz tekst i zdjęcia na podglądzie i publikujesz na swojej domenie. W cenie hostingu.',
  alternates: { canonical: '/kreator-stron' },
};

const H = LIMITY_KREATORA.hosting;
const P = LIMITY_KREATORA.pro;
const T = LIMITY_KREATORA.proba;

const KROKI: Step[] = [
  {
    label: '01',
    title: 'Opisujesz firmę',
    text: 'Wybierasz rodzaj strony, podajesz nazwę i branżę, a potem kilka zdań o tym, co robisz i dla kogo. Telefon, adres, godziny i ceny – tylko jeśli chcesz je pokazać.',
  },
  {
    label: '02',
    title: 'AI proponuje stronę',
    text: 'Układ sekcji, teksty, kolory i fonty dopasowane do branży i tonu, który wybierzesz. Z Kreatorem Pro jedna generacja daje trzy różne propozycje.',
  },
  {
    label: '03',
    title: 'Poprawiasz na stronie',
    text: 'Klikasz w tekst na podglądzie i piszesz. Zdjęcie wgrywasz albo wybierasz z biblioteki i ustawiasz kadr. Sekcje przesuwasz, ukrywasz albo zmieniasz poleceniem dla AI.',
  },
  {
    label: '04',
    title: 'Publikujesz na domenie',
    text: 'Jednym przyciskiem wysyłasz stronę na hosting swojej domeny. Formularz kontaktowy działa od razu, a publikację możesz wycofać.',
    accent: true,
  },
];

/** Tabela „co w cenie hostingu, a co w Pro”: [funkcja, w cenie hostingu, Kreator Pro]. Liczby z lib/kreator. */
function wiersze(): [string, string, string][] {
  return [
    ['Strony na koncie', ileLubBezLimitu(H.stron, 'strona', 'strony', 'stron'), ileLubBezLimitu(P.stron, 'strona', 'strony', 'stron')],
    ['Podstrony w jednej stronie', `do ${H.podstron}`, ileLubBezLimitu(P.podstron, 'podstrona', 'podstrony', 'podstron')],
    ['Generacje strony przez AI', `${H.generacjiMies} miesięcznie`, `${P.generacjiMies} miesięcznie`],
    ['Zmiany AI (sekcja, ton, przegląd)', `${H.zmianAiMies} miesięcznie`, `${P.zmianAiMies} miesięcznie`],
    [
      'Propozycje projektu z jednej generacji',
      ileLubBezLimitu(H.wariantyGeneracji, 'propozycja', 'propozycje', 'propozycji'),
      ileLubBezLimitu(P.wariantyGeneracji, 'propozycja', 'propozycje', 'propozycji'),
    ],
    ['Edycja tekstu i zdjęć na stronie, formularz kontaktowy', 'tak', 'tak'],
    ['Publikacja na Twojej domenie i pobranie ZIP', 'tak', 'tak'],
    ['Interakcje i animacje', 'podstawowe', 'karuzele, powiększanie zdjęć, paralaksa, animowany nagłówek'],
    ['Katalog produktów z cenami', 'nie', 'tak'],
    ['Blog', 'nie', 'tak'],
    ['SEO', 'podstawowe', 'pełne: dane strukturalne FAQ, produktów i artykułów, przegląd SEO przez AI'],
    [
      'Wersje językowe',
      H.wielojezycznosc ? 'tak' : 'nie',
      P.wielojezycznosc ? `do ${JEZYKI_KREATORA_PRO.length} dodatkowych: ${JEZYKI_KREATORA_PRO.join(', ')} – tłumaczenie AI i przełącznik języka` : 'nie',
    ],
    ['Znak „Stworzone w Verris Kreator” w stopce', 'standardowy', 'dyskretny'],
  ];
}

function zasady(): { tytul: string; tekst: string }[] {
  return [
    {
      tytul: 'AI nie wymyśla faktów',
      tekst:
        'Ceny, dane kontaktowe i godziny biorą się tylko z tego, co wpiszesz. Opinii klientów, ocen, liczby klientów ani nagród AI nie dopisze – opinie dodajesz sam. Czego nie podasz, tego na stronie nie będzie.',
    },
    {
      tytul: 'Strona to zwykłe pliki HTML',
      tekst:
        'Opublikowana strona to pliki HTML, CSS i zdjęcia na Twoim hostingu – bez bazy danych i wtyczek do aktualizowania. Po opłaceniu hostingu pobierzesz ją jako ZIP.',
    },
    {
      tytul: 'Nic nie nadpiszemy po cichu',
      tekst:
        'Jeśli w katalogu domeny jest już inna strona, pokażemy jej pliki i zapytamy, czy ją zastąpić – obecne pliki trafią do kopii. Wycofanie publikacji przywraca je albo usuwa pliki kreatora.',
    },
    {
      tytul: 'Okres próbny – tylko podgląd',
      tekst: `W okresie próbnym hostingu zbudujesz ${T.stron === 1 ? 'jedną stronę' : ileLubBezLimitu(T.stron, 'stronę', 'strony', 'stron')} i zobaczysz ją pod linkiem podglądu ważnym ${DNI_LINKU_PODGLADU} dni, niewidocznym dla wyszukiwarek. Własną domenę i ZIP włączysz po opłaceniu hostingu.`,
    },
  ];
}

function faq(c: Ceny): [string, string][] {
  return [
    [
      'Czy kreator stron jest płatny?',
      `Nie. Verris Kreator jest w cenie hostingu: ${ileLubBezLimitu(H.stron, 'strona', 'strony', 'stron')}, do ${H.podstron} podstron w każdej, ${H.generacjiMies} generacje i ${H.zmianAiMies} zmian AI miesięcznie. Płatny jest tylko dodatek Kreator Pro: ${cenaPakietu(c.kreatorPro)}.`,
    ],
    [
      'Czy potrzebuję własnej domeny?',
      `Do publikacji tak – stronę wysyłasz na hosting domeny dodanej do Twojej usługi. W okresie próbnym hostingu zobaczysz ją pod linkiem podglądu ważnym ${DNI_LINKU_PODGLADU} dni, który możesz odnowić.`,
    ],
    [
      'Czy AI może wymyślić opinie klientów albo ceny?',
      'Nie. Ceny i dane kontaktowe biorą się tylko z Twojego opisu, a opinie klientów dodajesz sam. Odpowiedź AI z wymyśloną opinią nie przejdzie kontroli i nie trafi na stronę.',
    ],
    [
      'Mam już stronę na tej domenie. Co się z nią stanie?',
      'Przed publikacją pokażemy pliki, które są w katalogu domeny, i zapytamy, czy je zastąpić. Obecne pliki trafią do kopii, a wycofanie publikacji je przywróci.',
    ],
    [
      'Skąd wezmę zdjęcia?',
      'Wgrasz własne (JPEG, PNG, WebP albo AVIF – dane z aparatu, np. lokalizację, usuwamy) albo wybierzesz zdjęcie z bibliotek, takich jak Openverse i Pixabay, z podanym autorem i licencją. W każdym zdjęciu ustawisz punkt, który ma zostać w kadrze.',
    ],
    [
      'Czy mogę pobrać stronę?',
      'Tak. Po opłaceniu hostingu pobierzesz stronę jako ZIP ze zwykłymi plikami HTML, CSS i zdjęciami.',
    ],
    [
      'Jak kupić Kreator Pro?',
      `W panelu, na karcie Kreator stron. Płacisz ${zl(c.kreatorPro.miesiecznie)} miesięcznie albo ${zl(c.kreatorPro.rocznie)} za rok brutto (${zl(netto(c.kreatorPro.miesiecznie))} albo ${zl(netto(c.kreatorPro.rocznie))} netto) – z portfela, BLIK-iem, przelewem albo kartą. Kreator Pro wymaga opłaconego hostingu Verris i działa na wszystkich stronach konta.`,
    ],
    [
      'Co się stanie, gdy zrezygnuję z Kreatora Pro?',
      'Opublikowane strony działają dalej. Elementy Pro, takie jak karuzele, katalog produktów i blog, znikną przy następnej publikacji – edytor pokaże wcześniej, co się zmieni.',
    ],
  ];
}

/** Oferty schema.org abonamentu Kreator Pro (ceny brutto z API, jak na stronie). */
function oferty(c: Ceny) {
  return [
    { '@type': 'Offer', price: c.kreatorPro.miesiecznie.toFixed(2), priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Kreator Pro, rozliczenie miesięczne, cena brutto' },
    { '@type': 'Offer', price: c.kreatorPro.rocznie.toFixed(2), priceCurrency: 'PLN', availability: 'https://schema.org/InStock', description: 'Kreator Pro, rozliczenie roczne, cena brutto' },
  ];
}

export default async function Page() {
  const ceny = await pobierzCeny();
  const kp = ceny.kreatorPro;
  const cta = ctaProby(ceny);
  const FAQ = faq(ceny);

  const jsonLd = graph(
    serviceSchema({
      name: 'Verris Kreator – kreator stron z AI',
      description:
        'Kreator stron firmowych z AI w cenie hostingu Verris: strona z opisu firmy, edycja tekstu i zdjęć na podglądzie, publikacja na własnej domenie, ZIP do pobrania. Dodatek Kreator Pro z wyższymi limitami.',
      path: '/kreator-stron',
      offers: oferty(ceny),
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
            <Breadcrumbs items={[{ label: 'Hosting', href: '/hosting' }, { label: 'Kreator stron' }]} />
            <span className="eyebrow" style={{ marginTop: 18 }}>
              Verris Kreator
            </span>
            <h1>
              Strona firmowa z AI, <span className="mint">w cenie hostingu</span>
            </h1>
            <p className="lead">
              Opisujesz firmę własnymi słowami, a AI układa z tego stronę: sekcje, teksty i kolory. Poprawiasz ją, klikając
              w tekst na podglądzie, i publikujesz na swojej domenie. Bez osobnej opłaty za kreator.
            </p>
            <div className="hero2-cta">
              <Button href={cta.href} cta="subhero" conv="checkout_intent" plan="hosting">
                {cta.label}
              </Button>
              <Button href="#przyklady" variant="ghost" cta="subhero-alt">
                Zobacz przykładowe strony
              </Button>
            </div>
            <p className="hero2-fine">
              Kreator jest w hostingu {odCeny(ceny.hosting)} brutto ({zl(netto(ceny.hosting.miesiecznie))} netto). Więcej stron
              i funkcji daje dodatek Kreator Pro.
            </p>
          </div>
          <Card className="incl">
            <h2 className="incl-h">W cenie hostingu</h2>
            <dl>
              <div>
                <dt>Strony na koncie</dt>
                <dd>{H.stron}</dd>
              </div>
              <div>
                <dt>Podstrony w stronie</dt>
                <dd>do {H.podstron}</dd>
              </div>
              <div>
                <dt>Generacje AI</dt>
                <dd>{H.generacjiMies} / mies.</dd>
              </div>
              <div>
                <dt>Zmiany AI</dt>
                <dd>{H.zmianAiMies} / mies.</dd>
              </div>
              <div>
                <dt>Własna domena i ZIP</dt>
                <dd>tak</dd>
              </div>
            </dl>
            <h2 className="incl-h">Kreator Pro</h2>
            <dl>
              <div>
                <dt>Miesięcznie</dt>
                <dd>
                  {zl(kp.miesiecznie)} <span className="krt-netto">({zl(netto(kp.miesiecznie))} netto)</span>
                </dd>
              </div>
              <div>
                <dt>Za rok</dt>
                <dd>
                  {zl(kp.rocznie)} <span className="krt-netto">({zl(netto(kp.rocznie))} netto)</span>
                </dd>
              </div>
            </dl>
            <p className="krt-przypis">Ceny brutto. Kreator Pro kupisz w panelu po opłaceniu hostingu.</p>
          </Card>
        </div>
      </section>

      <section className="sec" aria-labelledby="krt-jak">
        <div className="wrap krt-kroki">
          <SectionHead2
            id="krt-jak"
            eyebrow="Jak to działa"
            title="Od opisu firmy do strony na Twojej domenie"
            lead="Nie musisz znać się na projektowaniu ani na kodzie. Wszystko robisz w panelu Verris, w jednym edytorze."
          />
          <Steps items={KROKI} />
        </div>
      </section>

      <section className="sec sec-alt" id="w-cenie" aria-labelledby="krt-cena">
        <div className="wrap">
          <SectionHead2
            id="krt-cena"
            eyebrow="W cenie hostingu i w Pro"
            title="Co dostajesz bez dopłat, a co daje Kreator Pro"
            lead={`Kreator Pro to dodatek do hostingu: ${cenaPakietu(kp)}. Działa na wszystkich stronach konta.`}
          />
          <table className="cmp2 krt-tabela">
            <caption className="krt-sr">Porównanie Verris Kreatora w cenie hostingu i Kreatora Pro</caption>
            <thead>
              <tr>
                <th scope="col">Funkcja</th>
                <th scope="col">W cenie hostingu</th>
                <th scope="col">Kreator Pro</th>
              </tr>
            </thead>
            <tbody>
              {wiersze().map(([f, h, p]) => (
                <tr key={f}>
                  <th scope="row">{f}</th>
                  <td data-label="W cenie hostingu">{h}</td>
                  <td data-label="Kreator Pro" className="vr">
                    {p}
                  </td>
                </tr>
              ))}
              <tr>
                <th scope="row">Cena</th>
                <td data-label="W cenie hostingu">0 zł – w hostingu {odCeny(ceny.hosting)} brutto</td>
                <td data-label="Kreator Pro" className="vr">
                  {zl(kp.miesiecznie)}/mies. albo {zl(kp.rocznie)}/rok brutto ({zl(netto(kp.miesiecznie))} albo{' '}
                  {zl(netto(kp.rocznie))} netto)
                </td>
              </tr>
            </tbody>
          </table>
          <p className="krt-przypis">
            Limity AI odnawiają się 1. dnia każdego miesiąca, nieudana generacja ich nie zużywa, a ręczna edycja jest bez limitu. Elementy Pro zobaczysz w edytorze jako podgląd z oznaczeniem „Pro” – bez Pro
            publikacja zastępuje je wersją podstawową i wcześniej pokazuje, co się zmieni.
          </p>
        </div>
      </section>

      <section className="sec" id="przyklady" aria-labelledby="krt-przyklady">
        <div className="wrap">
          <SectionHead2
            id="krt-przyklady"
            eyebrow="Przykładowe strony"
            title="Tak wyglądają strony z Verris Kreatora"
            lead="Górne części stron wygenerowanych w kreatorze dla czterech fikcyjnych firm. Przy każdej widzisz, czy korzysta z elementów Pro."
          />
          <ul className="krt-przyklady">
            {PRZYKLADY_STRON.map((p) => (
              <li key={p.plik}>
                <figure className="krt-zrzut">
                  <div className="krt-zrzut-pasek" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                  </div>
                  {/* Gotowe WebP w public/kreator (640 i 1280 px) – bez optymalizacji next/image. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/kreator/${p.plik}-640.webp`}
                    srcSet={`/kreator/${p.plik}-640.webp 640w, /kreator/${p.plik}-1280.webp 1280w`}
                    sizes="(min-width: 1320px) 640px, (min-width: 768px) 50vw, 100vw"
                    width={640}
                    height={520}
                    loading="lazy"
                    decoding="async"
                    alt={p.alt}
                  />
                  <figcaption>
                    <strong>{p.firma}</strong>
                    <span className="krt-wersja">{p.wersja}</span>
                    <span className="krt-fikcja">Przykład – firma fikcyjna</span>
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="krt-zasady">
        <div className="wrap">
          <SectionHead2
            id="krt-zasady"
            eyebrow="Uczciwe zasady"
            title="Twoja strona, Twoje dane, Twoje pliki"
            lead="Kilka rzeczy, które kreator robi zawsze – niezależnie od wersji."
          />
          <ul className="krt-zasady">
            {zasady().map((z) => (
              <li key={z.tytul} className="card">
                <h3>{z.tytul}</h3>
                <p>{z.tekst}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead2 eyebrow="FAQ" title="Pytania o Verris Kreator" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting">Hosting z autoskalowaniem</Link> · <Link href="/cennik">Cennik</Link> ·{' '}
            <Link href="/domeny">Domeny</Link>
          </p>
        </div>
      </section>

      <CTABand
        title="Zamów hosting i zbuduj stronę jeszcze dziś"
        text="Kreator stron jest w panelu od pierwszego dnia – opisujesz firmę, poprawiasz to, co zaproponuje AI, i publikujesz na swojej domenie."
        primaryLabel={cta.label}
        primaryHref={cta.href}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
      <MobilnyPasek {...pasekHostingu(ceny)} />
    </main>
  );
}

import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Accordion, Breadcrumbs, Button, CTABand, JsonLd, SectionHead } from '../../components/ui';
import { PORADNIKI, poradnik } from '@/lib/poradniki';
import { faqSchema, graph, howToSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';

/*
 * Poradnik przeprowadzki (makieta 14.10, plansza Poradnik). Przełącznik paneli z makiety = osobne strony
 * według rodzaju starego panelu (lib/poradniki.ts), każda linkuje do pozostałych i kończy się CTA.
 */
export const dynamicParams = false;

export function generateStaticParams() {
  return PORADNIKI.map((p) => ({ zrodlo: p.slug }));
}

type Props = { params: Promise<{ zrodlo: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const p = poradnik((await params).zrodlo);
  if (!p) return {};
  return {
    title: p.title,
    description: p.description,
    alternates: { canonical: `/przenies-strone/${p.slug}` },
  };
}

const ZANIM_WYPOWIESZ = [
  'Poczekaj, aż domena wskazuje na Verris, a nowa poczta przychodzi bez problemu — po zmianie DNS zwykle trwa to od kilkunastu minut do kilku godzin, wyjątkowo do 48 godzin.',
  'Sprawdź formularze kontaktowe i płatności w sklepie.',
  'Pobierz ze starego panelu faktury i dane, których możesz potrzebować.',
  'Dopiero potem wyłącz odnawianie u starego dostawcy.',
];

export default async function Page({ params }: Props) {
  const p = poradnik((await params).zrodlo);
  if (!p) notFound();
  const sciezka = `/przenies-strone/${p.slug}`;

  const jsonLd = graph(
    howToSchema({
      name: p.h1,
      description: p.description,
      path: sciezka,
      steps: p.kroki.map((k) => ({ name: k.tytul, text: k.tekst })),
    }),
    faqSchema(p.faq),
  );

  return (
    <main>
      <JsonLd data={jsonLd} />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap">
          <div className="b-hero">
            <Breadcrumbs items={[{ label: 'Przeniesienie strony', href: '/przenies-strone' }, { label: p.krotko }]} />
            <span className="eyebrow">Poradnik przeprowadzki</span>
            <h1>{p.h1}</h1>
            <p className="lead">{p.lead}</p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="hero" conv="checkout_intent" plan="hosting">
                Przenieś stronę za 0 zł
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="hero-jak">
                Jak działa przeprowadzka
              </Button>
            </div>
          </div>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <ul className="b-fakty" aria-label="W skrócie">
            <li>
              <strong>Twój czas:</strong> kilka minut na podanie dostępu
            </li>
            <li>
              <strong>Przerwa w działaniu:</strong> stara strona działa do przełączenia
            </li>
            <li>
              <strong>Koszt:</strong> 0 zł w cenie hostingu
            </li>
          </ul>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-panel">
        <div className="wrap">
          <SectionHead
            id="b-panel"
            eyebrow="Twój obecny hosting"
            title="Jaki panel ma Twój obecny hosting?"
            lead="Wybierz panel, a pokażemy, co przygotować. Nie wiesz, jaki masz? Wpisz domenę w kreatorze przeprowadzki — podpowiemy adres starego serwera."
          />
          <nav aria-label="Poradniki według panelu">
            <ul className="b-panele">
              {PORADNIKI.map((x) => (
                <li key={x.slug}>
                  <Link href={`/przenies-strone/${x.slug}`} aria-current={x.slug === p.slug ? 'page' : undefined}>
                    {x.krotko}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="b-ramka" style={{ marginTop: 18 }}>
            <h3>Przeprowadzka {p.zrodlo}: co przygotować</h3>
            <p>{p.wykrywamy}</p>
            <ol>
              {p.przygotuj.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="b-kroki">
        <div className="wrap narrow">
          <SectionHead id="b-kroki" eyebrow="Krok po kroku" title={`${p.h1} — ${p.kroki.length} kroków`} />
          <ol className="b-kroki">
            {p.kroki.map((k, i) => (
              <li key={k.tytul} id={`krok-${i + 1}`}>
                <span className="b-kroki-n" aria-hidden="true">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <h3>{k.tytul}</h3>
                  <p>{k.tekst}</p>
                </div>
              </li>
            ))}
          </ol>
          <p className="b-przypis">
            Gdyby coś się zablokowało, przeprowadzkę przejmie nasz zespół. Wolisz od razu oddać ją w nasze ręce?{' '}
            <Link href="/kontakt">Napisz do nas</Link> — przygotujemy ją, a Ty zatwierdzisz start w panelu. To też jest w
            cenie hostingu.
          </p>
        </div>
      </section>

      <section className="sec sec-alt" aria-labelledby="b-dodatkowo">
        <div className="wrap narrow">
          <SectionHead id="b-dodatkowo" eyebrow="Dla spokoju" title="Zanim wypowiesz stary hosting" />
          <ul className="ticks">
            {ZANIM_WYPOWIESZ.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
          <div className="b-ramka" style={{ marginTop: 22 }}>
            <h3>Własna kopia — opcjonalnie</h3>
            <p>{p.wlasnaKopia}</p>
          </div>
        </div>
      </section>

      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead eyebrow="FAQ" title={`Pytania o przeprowadzkę ${p.zrodlo}`} />
          <Accordion items={p.faq.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="b-przypis">
            Inne poradniki:{' '}
            {PORADNIKI.filter((x) => x.slug !== p.slug).map((x, i, arr) => (
              <span key={x.slug}>
                <Link href={`/przenies-strone/${x.slug}`}>przeprowadzka {x.zrodlo}</Link>
                {i < arr.length - 1 ? ', ' : '.'}
              </span>
            ))}
          </p>
        </div>
      </section>

      <CTABand
        title="Przeprowadzka bez stresu i bez kosztów"
        text="Podaj dostęp, a resztą zajmiemy się my. Stara strona działa do chwili przełączenia domeny."
        primaryLabel="Przenieś za darmo"
        primaryHref={ZAMOW}
        secondary={{ label: 'Cennik hostingu', href: '/cennik' }}
      />
    </main>
  );
}

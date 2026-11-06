import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Breadcrumbs, Button, CTABand, JsonLd, SectionHead, SectionHead2, Steps, type Step } from '../components/ui';
import { MobilnyPasek } from '../components/MobilnyPasek';
import { KartyUslug, Poradniki } from '../components/KartyUslug';
import { PasRozmowy } from '../components/PasRozmowy';
import { HostingSpecyfikacja } from '../components/HostingSpecyfikacja';
import { pobierzCeny } from '@/lib/ceny-api';
import { GODZIN_W_MIESIACU, kosztMocy, netto, nettoStawki, stawka, zl, zlGrosze, type Ceny } from '@/lib/ceny';
import { ctaProby, pasekHostingu } from '@/lib/proba';
import { sekcjeWidoczne } from '@/lib/specyfikacja';
import { ASymulacja } from '../components/ASymulacja';
import { AZakladki, type Zakladka } from '../components/AZakladki';
import { KalkulatorPiku } from '../components/KalkulatorPiku';
import { faqSchema, ofertyHostingu, productSchema } from '@/lib/schema';
import { SPECYFIKACJA_OPUBLIKOWANA } from '@/lib/oferta';
import { PRZYKLAD_BLACK_FRIDAY } from '@/lib/kalkulator';

// Makieta 14.10, plansza Hosting + notatka „seo-hosting” (canvas.json).
// Opis bez kwoty: ceny bierzemy z API (lib/ceny-api.ts), a metadane zostają statyczne.
export const metadata: Metadata = {
  title: 'Hosting z autoskalowaniem dla stron i sklepów | Verris',
  description:
    'Hosting, który sam dokłada mocy, gdy rośnie ruch, i wraca do ceny pakietu, gdy jest spokojnie. Zobacz symulację tygodnia sklepu i policz koszt.',
  alternates: { canonical: '/hosting' },
};

const W_CENIE: [string, string, string][] = [
  ['Limity w cenie', '2 vCPU · 8 GB RAM', 'i 50 GB NVMe'],
  ['W piku do', '24 vCPU · 64 GB', 'i 1000 GB dysku'],
  ['Dostępność', 'SLA 99,5%', 'z rekompensatą'],
  ['Bez limitu', 'stron i skrzynek', 'w ramach zasobów konta'],
];

const jak = (ceny: Ceny): Step[] => [
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
    title: `Po szczycie wracasz do ${zl(ceny.hosting.miesiecznie)}`,
    text: 'Nie przepłacasz przez cały rok za większy pakiet, który przydaje się kilka dni. Każdy blok z dodatkową mocą i jego koszt widzisz w panelu.',
  },
];

// Scenariusze miesiąca: koszt liczony ze stawek (lib/kalkulator.ts) dla podanej nadwyżki — nie wpisany ręcznie.
type Scenariusz = { id: string; label: string; title: string; text: string; vcpu: number; ram: number; godz: number; piki: number[] };
const scenariusze = (ceny: Ceny): Scenariusz[] => [
  {
    id: 'black-friday',
    label: 'Sklep w Black Friday',
    title: 'Sklep w Black Friday',
    text: 'Przez trzy dni na stronie jest kilka razy więcej osób niż zwykle. Dokładamy procesora i pamięci tylko na te godziny, a w poniedziałek wszystko wraca do normy.',
    vcpu: PRZYKLAD_BLACK_FRIDAY.vcpu,
    ram: PRZYKLAD_BLACK_FRIDAY.ramGb,
    godz: PRZYKLAD_BLACK_FRIDAY.godziny,
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
    text: `Strona spokojnie mieści się w pakiecie, więc płacisz ${zl(ceny.hosting.miesiecznie)} i nic więcej.`,
    vcpu: 0,
    ram: 0,
    godz: 0,
    piki: Array(20).fill(0),
  },
];

const zakladki = (ceny: Ceny): Zakladka[] =>
  scenariusze(ceny).map((s) => {
  const koszt = kosztMocy(ceny.stawki, s.vcpu, s.ram, 0, s.godz);
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
              <dt>Dopłata w miesiącu</dt>
              <dd className="mint">
                {koszt > 0 ? `${zlGrosze(koszt)} (${zlGrosze(netto(koszt))} netto)` : '0 zł'}
              </dd>
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


// Makieta 1.11: „Sześć pytań do każdego dostawcy” — odpowiedzi Verris mają pokrycie w regulaminie/specyfikacji;
// „Często” to ogólny wzorzec rynku, bez nazw konkurentów.
const pytania = (ceny: Ceny): { kat: string; q: string; my: string; rynek: string }[] => [
  {
    kat: 'Cena',
    q: 'Ile zapłacę w drugim roku?',
    my: `Cenę z cennika, podaną z góry: ${zl(ceny.hosting.rocznie)} brutto (${zl(netto(ceny.hosting.rocznie))} netto) — tyle samo co za pierwszy rok. Przy pierwszym zakupie dostajesz jeszcze kredyty na autoskalowanie.`,
    rynek: 'Często: cena odnowienia drobnym drukiem, kilka razy wyższa.',
  },
  { kat: 'Ruch', q: 'Co, gdy przyjdzie dużo klientów?', my: 'Moc rośnie sama; limit kosztu ustawiasz, jeśli chcesz.', rynek: 'Często: zmiana na droższy pakiet.' },
  { kat: 'Kopie', q: 'Czy sam przywrócę stronę?', my: 'Tak, z każdego z ostatnich 30 dni: pliki, bazy i pocztę.', rynek: 'Często: przez zgłoszenie albo za opłatą.' },
  { kat: 'Dostępność', q: 'Co, jeśli strona nie działa?', my: '99,5% w umowie i automatyczna rekompensata w kredytach, do całej opłaty za miesiąc.', rynek: 'Często: deklaracja bez rekompensaty.' },
  { kat: 'Domena', q: 'Czy domena odnowi się sama?', my: 'Nie. Odnawiasz wtedy, kiedy chcesz.', rynek: 'Często: automatyczne pobranie z karty.' },
  { kat: 'RODO', q: 'Jak podpiszę umowę powierzenia?', my: 'Akceptujesz ją w panelu, bez papierów.', rynek: 'Często: na wniosek, mailem.' },
];

const faq = (ceny: Ceny): [string, string][] => [
  [
    'Ile kosztuje hosting z autoskalowaniem?',
    `Pakiet kosztuje ${zl(ceny.hosting.miesiecznie)} miesięcznie albo ${zl(ceny.hosting.rocznie)} za rok brutto (${zl(netto(ceny.hosting.miesiecznie))} albo ${zl(netto(ceny.hosting.rocznie))} netto). W cenie masz 50 GB NVMe oraz limit 8 GB RAM i 2 vCPU. Z autoskalowaniem limity rosną do 1000 GB dysku, 64 GB RAM i 24 vCPU, a dodatkową moc liczymy według jawnych stawek brutto w blokach po 15 minut, do limitu, który ustawiasz w panelu.`,
  ],
  [
    'Ile mogę zapłacić za autoskalowanie?',
    'Autoskalowanie włączasz sam. Bez limitu płacisz za faktyczne użycie dodatkowej mocy. Limit kosztu na 30 dni (suma dopłat z ostatnich 30 dni) możesz ustawić przy zamówieniu i zmienić w panelu: gdy dopłaty go osiągną, zasoby wracają do pakietu, a Ty dostajesz powiadomienie.',
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

export default async function HostingPage() {
  const ceny = await pobierzCeny();
  const cta = ctaProby(ceny);
  const FAQ = faq(ceny);
  const st = ceny.stawki;
  const dyskMies = st.dysk * GODZIN_W_MIESIACU;
  const przyklad = kosztMocy(st, 2, 4, 0, 3);
  return (
    <main>
      <JsonLd
        data={productSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Hosting WWW z autoskalowaniem dla stron i sklepów. W cenie 50 GB NVMe oraz limit 8 GB RAM i 2 vCPU; z autoskalowaniem do 1000 GB dysku, 64 GB RAM i 24 vCPU. Przeniesienie strony i SSL w cenie.',
          path: '/hosting',
          offers: ofertyHostingu(ceny),
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
              opadnie, wracasz do zwykłych {zl(ceny.hosting.miesiecznie)} miesięcznie brutto (
              {zl(netto(ceny.hosting.miesiecznie))} netto).
            </p>
            <div className="hero2-cta">
              <Button href={cta.href} cta="subhero" conv="checkout_intent" plan="hosting">
                {cta.label}
              </Button>
              <Button href="#parametry" variant="ghost" cta="subhero-parametry">
                Zobacz parametry
              </Button>
            </div>
            <p className="h-fine">{cta.proba ? 'Bez karty · ' : ''}przeniesienie strony w cenie · cena odnowienia znana z góry</p>
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
          <SectionHead2
            id="pokaz-tytul"
            eyebrow="Zobacz na przykładzie"
            title="Zobacz, co się dzieje, gdy Twoja reklama naprawdę zadziała"
            lead="Tydzień zwykłego sklepu internetowego. W czwartek startuje kampania i nagle na stronie jest kilka razy więcej osób. Moc serwera rośnie razem z ruchem, a po szczycie wraca do pakietu. Wyłącz autoskalowanie i porównaj, jak wyglądałby ten sam weekend bez niego."
          />
          <ASymulacja cenaMiesieczna={ceny.hosting.miesiecznie} />
        </div>
      </section>

      <section className="sec sec-alt" id="jak">
        <div className="wrap">
          <SectionHead2 eyebrow="Jak to działa" title="Ty ustalasz zasady. Resztą zajmujemy się my" />
          <Steps items={jak(ceny)} />
        </div>
      </section>

      <section className="sec" id="scenariusze">
        <div className="wrap">
          <SectionHead2 eyebrow="Przykłady" title="Ile to kosztuje w prawdziwym miesiącu?" />
          <AZakladki label="Scenariusze" items={zakladki(ceny)} />
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap split">
          <SectionHead
            eyebrow="Kalkulator"
            title="Policz swój pik"
            lead="Przesuń suwaki — liczymy według stawek z cennika. Limity z pakietu (2 vCPU i 8 GB RAM) są zawsze w abonamencie."
          />
          <KalkulatorPiku stawki={st} />
        </div>
      </section>

      <section className="sec" id="parametry" aria-labelledby="parametry-tytul">
        <div className="wrap">
          <SectionHead2
            id="parametry-tytul"
            eyebrow="Parametry"
            title="Wszystko, co jest w pakiecie"
            lead="Pełna lista bez gwiazdek. Te same dane są na stronie specyfikacji."
          />
          <HostingSpecyfikacja brutto={sekcjeWidoczne(st)} netto={sekcjeWidoczne(st, true)} />
          {SPECYFIKACJA_OPUBLIKOWANA && (
            <p className="hspec-pelna">
              <Link href="/specyfikacja">Pełna specyfikacja →</Link>
            </p>
          )}
        </div>
      </section>

      <section className="sec sec-alt" id="dodatki" aria-labelledby="dodatki-tytul">
        <div className="wrap">
          <SectionHead2
            id="dodatki-tytul"
            eyebrow="Za co dopłacasz"
            title="Płatne dodatki, wszystkie w jednym miejscu"
            lead="Podstawy są w cenie. Płacisz tylko za to, co sam włączysz. Ceny brutto i netto obok siebie."
          />
          {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- A3-13: przewijany w bok obszar musi dostać fokus (WCAG 2.1.1, axe scrollable-region-focusable) */}
          <div className="hdod-wrap" role="region" aria-label="Płatne dodatki" tabIndex={0}>
            <table className="hdod">
              <thead>
                <tr>
                  <th scope="col">Dodatek</th>
                  <th scope="col">Kiedy płacisz</th>
                  <th scope="col">Brutto</th>
                  <th scope="col">Netto</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">Dodatkowy procesor</th>
                  <td>tylko w szczycie, do limitu, który ustawisz</td>
                  <td>{stawka(st.cpu)} zł za 1% CPU/h</td>
                  <td>{stawka(nettoStawki(st.cpu))} zł</td>
                </tr>
                <tr>
                  <th scope="row">Dodatkowa pamięć RAM</th>
                  <td>tylko w szczycie</td>
                  <td>{stawka(st.ram)} zł za 1 GB/h</td>
                  <td>{stawka(nettoStawki(st.ram))} zł</td>
                </tr>
                <tr>
                  <th scope="row">Więcej miejsca na dysku</th>
                  <td>ponad 50 GB, do 1000 GB, za czas użycia</td>
                  <td>
                    {stawka(st.dysk)} zł za 1 GB/h
                    <small>
                      ok. {zlGrosze(dyskMies)} za 1 GB/mies.; +50 GB na miesiąc: ok. {zlGrosze(dyskMies * 50)}
                    </small>
                  </td>
                  <td>
                    {stawka(nettoStawki(st.dysk))} zł
                    <small>
                      ok. {zlGrosze(nettoStawki(dyskMies))}; ok. {zlGrosze(nettoStawki(dyskMies * 50))}
                    </small>
                  </td>
                </tr>
                <tr>
                  <th scope="row">Domena</th>
                  <td>przy rejestracji i odnowieniu, bez automatycznego pobrania</td>
                  <td colSpan={2}>
                    według <Link href="/domeny">cennika domen</Link>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <ul className="hprz">
            <li>
              <span>Zwykły miesiąc firmy</span>
              <b>{zl(ceny.hosting.miesiecznie)}</b>
              <span>{zl(netto(ceny.hosting.miesiecznie))} netto · bez dopłat</span>
            </li>
            <li>
              <span>Kampania: 3 h z +2 vCPU i +4 GB RAM</span>
              <b>
                {zl(ceny.hosting.miesiecznie)} + {zlGrosze(przyklad)}
              </b>
              <span>
                {zl(netto(ceny.hosting.miesiecznie))} + {zlGrosze(netto(przyklad))} netto
              </span>
            </li>
            <li>
              <span>Limit kosztu, który ustawiasz</span>
              <b>np. 30 zł</b>
              <span>powyżej moc nie rośnie</span>
            </li>
          </ul>
        </div>
      </section>

      <section className="sec" id="wybor" aria-labelledby="wybor-tytul">
        <div className="wrap">
          <SectionHead2
            id="wybor-tytul"
            eyebrow="Zanim wybierzesz"
            title="Sześć pytań do każdego dostawcy"
            lead={
              <>
                Zadaj je każdemu hostingowi, który rozważasz. Nasze odpowiedzi są pod spodem; szczegóły zasad są w
                regulaminie. Pełny przewodnik: <Link href="/jak-wybrac-hosting">Jak wybrać hosting</Link>.
              </>
            }
          />
          <ol className="hpyt">
            {pytania(ceny).map((p, i) => (
              <li key={p.q}>
                <p className="kicker mono">
                  {String(i + 1).padStart(2, '0')} · {p.kat.toUpperCase()}
                </p>
                <h3>{p.q}</h3>
                <p className="hpyt-my">{p.my}</p>
                <p className="hpyt-rynek">{p.rynek}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="sec sec-alt" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania o hosting z autoskalowaniem" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
          <p className="center-cta">
            <Link href="/hosting/wordpress">Hosting WordPress</Link> · <Link href="/hosting/sklep">Hosting dla sklepu</Link> ·{' '}
            <Link href="/cennik">Cennik</Link> · <Link href="/przenies-strone">Przeniesienie strony</Link>
          </p>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <KartyUslug />
          <Poradniki />
        </div>
      </section>

      <PasRozmowy />

      <CTABand
        title={`Daj swojej stronie zapas mocy. Od ${zl(ceny.hosting.miesiecznie)} miesięcznie`}
        text="Jeden pakiet z mocą w cenie i zapasem na dni, kiedy przychodzi więcej klientów. Przeniesienie strony gratis."
        primaryLabel={cta.label}
        primaryHref={cta.href}
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <MobilnyPasek {...pasekHostingu(ceny)} />
    </main>
  );
}

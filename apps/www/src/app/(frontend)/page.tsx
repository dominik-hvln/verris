import type { Metadata } from 'next';
import Link from 'next/link';
import { Activity, ChartColumn, FileText, Globe, History, ShieldCheck, Zap } from 'lucide-react';
import type { ReactNode } from 'react';
import { Accordion, Button, Card, CTABand, JsonLd, SectionHead2 } from './components/ui';
import { KartyUslug, Poradniki } from './components/KartyUslug';
import { MobilnyPasek } from './components/MobilnyPasek';
import { PasRozmowy } from './components/PasRozmowy';
import { PasekDostepnosci } from './components/PasekDostepnosci';
import { PrzelacznikCeny } from './components/PrzelacznikCeny';
import { HeroPodglad, type DaneHeroPodgladu } from './_glowna/HeroPodglad';
import { PanelPodglad, type ZakladkaPanelu } from './_glowna/PanelPodglad';
import { STYL_GLOWNEJ } from './_glowna/styl';
import { pobierzCeny } from '@/lib/ceny-api';
import { ADRES_SPRZEDAWCY, SPRZEDAWCA } from '@/lib/sprzedawca';
import {
  GODZIN_W_MIESIACU,
  kosztMocy,
  miesiecznieZRocznej,
  netto,
  nettoStawki,
  stawka,
  zl,
  zlGrosze,
  type Ceny,
} from '@/lib/ceny';
import { pobierzDostepnosc, procent } from '@/lib/dostepnosc';
import { ctaProby, okresProbny, pasekHostingu } from '@/lib/proba';
import { organization, ORG_ID, SITE, faqSchema, productSchema, ofertyHostingu } from '@/lib/schema';
import { plForm } from '@/lib/pl';
import { LEGAL, ZAMOW } from '@/lib/site';

// Makieta „verris.pl — rozbudowa treści” (1.11.2026), plansza Main z poprawkami z komentarzy.
// Ceny wyłącznie z API (lib/ceny-api.ts) — w tym pliku nie ma kwot wpisanych na sztywno.
export const metadata: Metadata = {
  title: 'Hosting WWW i WordPress z autoskalowaniem | Verris',
  description:
    'Szybki polski hosting dla firm i sklepów: LiteSpeed, NVMe, kopie, które przywracasz sam, i darmowe przeniesienie strony. Cena odnowienia znana z góry.',
  alternates: { canonical: '/' },
};

/** Przykład w hero: kampania 20:00–23:00, +2 vCPU i +4 GB RAM przez 3 h, przy przykładowym limicie kosztu. */
const PIK_HERO = { vcpu: 2, ram: 4, godziny: 3 };
/** Przykład w panelu („Pik wczoraj 19:40–21:10”): +2 vCPU i +4 GB RAM przez 1,5 h. */
const PIK_PANEL = { vcpu: 2, ram: 4, godziny: 1.5 };
const PRZYKLADOWY_LIMIT = 30;
/** Dysk ponad pakiet w przykładzie dopłat: +50 GB przez cały miesiąc. */
const PRZYKLAD_DYSKU_GB = 50;

function daneHero(c: Ceny): DaneHeroPodgladu {
  const doplata = kosztMocy(c.stawki, PIK_HERO.vcpu, PIK_HERO.ram, 0, PIK_HERO.godziny);
  const razem = c.hosting.miesiecznie + doplata;
  const r = c.hosting.rocznie;
  const mies = miesiecznieZRocznej(c.hosting);
  return {
    pakiet: zlGrosze(c.hosting.miesiecznie),
    doplata: zlGrosze(doplata),
    razem: zlGrosze(razem),
    razemNetto: zlGrosze(netto(razem)),
    limitProcent: (doplata / PRZYKLADOWY_LIMIT) * 100,
    limitOpis: `wykorzystano ${zlGrosze(doplata)} z limitu ${zl(PRZYKLADOWY_LIMIT)}, który ustawiłeś`,
    rok: zl(r),
    rokNetto: zl(netto(r)),
    miesiecznie: zl(mies),
    miesiecznieNetto: zl(netto(mies)),
    trzyLata: zl(3 * r),
    trzyLataNetto: zl(netto(3 * r)),
  };
}

const ZAKLADKI_PANELU: ZakladkaPanelu[] = [
  {
    id: 'pulpit',
    label: 'Pulpit',
    title: 'Stan strony w jednym miejscu',
    text: 'Po zalogowaniu widzisz, czy strona działa, ile zasobów zużywa i kiedy powstała ostatnia kopia.',
    points: ['czy strona działa i czy SSL jest aktywny', 'zużycie dysku, pamięci i procesora', 'ostatnia kopia i najbliższa płatność'],
    href: '/hosting',
    link: 'Więcej o hostingu',
  },
  {
    id: 'autoskalowanie',
    label: 'Autoskalowanie',
    title: 'Zasoby rosną, kiedy rośnie ruch',
    text: 'W piku konto dostaje więcej procesora i pamięci, a po nim wraca do zasobów z pakietu. Limit kosztu ustawiasz sam.',
    points: ['do 24 vCPU i 64 GB RAM', 'dopłata tylko za czas piku, w blokach po 15 minut', 'limit kosztu autoskalowania w panelu'],
    href: '/funkcje/autoskalowanie',
    link: 'Jak działa autoskalowanie',
  },
  {
    id: 'kopie',
    label: 'Kopie',
    title: 'Przywracasz sam, z wybranego dnia',
    text: 'Wybierasz datę i co przywrócić: pliki, bazę albo pocztę. Przed przywróceniem zapisujemy kopię bieżącego stanu.',
    points: ['pliki, bazy i poczta osobno', 'kopia bezpieczeństwa przed przywróceniem', 'szyfrowane kopie poza serwerem z ostatnich 30 dni'],
    href: '/funkcje/kopie-zapasowe',
    link: 'Jak działają kopie',
  },
  {
    id: 'przeniesienie',
    label: 'Przeniesienie',
    title: 'Przeniesienie strony krok po kroku',
    text: 'Podajesz dostęp do starego hostingu, a my kopiujemy pliki, bazy i pocztę. Stara strona działa, dopóki nie przełączysz domeny.',
    points: ['pliki, bazy danych i poczta', 'podgląd strony przed zmianą DNS', 'bezpłatnie, w ramach zamówienia hostingu'],
    href: '/przenies-strone',
    link: 'Jak działa przeniesienie',
  },
  {
    id: 'poczta',
    label: 'Poczta',
    title: 'Poczta w Twojej domenie',
    text: 'Skrzynki, aliasy i przekierowania w jednym panelu. Webmail otwierasz z panelu bez osobnego logowania.',
    points: ['skrzynki bez limitu liczby, w ramach zasobów konta', 'aliasy i przekierowania', 'webmail z logowaniem z panelu'],
    href: '/poczta',
    link: 'Więcej o poczcie',
  },
  {
    id: 'statystyki',
    label: 'Statystyki',
    title: 'Odwiedziny bez plików cookies',
    text: 'Liczba odwiedzin, źródła ruchu i najczęściej czytane strony, w panelu, bez cookies na Twojej stronie.',
    points: ['odwiedziny, źródła i strony wejścia', 'bez plików cookies', 'w cenie hostingu'],
    href: '/funkcje/statystyki',
    link: 'Jak działają statystyki',
  },
];

const KARTY: { ikona: ReactNode; t: string; p: string; etykiety: string[]; href: string; link: string }[] = [
  {
    ikona: <Zap aria-hidden="true" />,
    t: 'Szybka strona to więcej zamówień',
    p: 'LiteSpeed z cache dla WordPressa i WooCommerce, dyski NVMe i Redis. Strona ładuje się szybko także wtedy, gdy odwiedza ją naraz wiele osób.',
    etykiety: ['LiteSpeed', 'NVMe', 'Redis'],
    href: '/funkcje/autoskalowanie',
    link: 'Autoskalowanie',
  },
  {
    ikona: <ShieldCheck aria-hidden="true" />,
    t: 'Śpisz spokojnie, strona pracuje',
    p: 'Każde konto działa w osobnej izolacji, zapora aplikacji (WAF) zatrzymuje typowe ataki, a ImunifyAV skanuje pliki w tle.',
    etykiety: ['WAF', 'ImunifyAV', 'izolacja kont'],
    href: '/specyfikacja',
    link: 'Zabezpieczenia',
  },
  {
    ikona: <History aria-hidden="true" />,
    t: 'Aktualizacja coś zepsuła? Wróć do wczoraj',
    p: 'Przywracasz pliki, bazę albo pocztę z wybranego dnia. Zanim to zrobisz, zapisujemy kopię obecnego stanu, na wszelki wypadek.',
    etykiety: ['30 dni', 'poza serwerem', 'szyfrowane'],
    href: '/funkcje/kopie-zapasowe',
    link: 'Kopie zapasowe',
  },
  {
    ikona: <ChartColumn aria-hidden="true" />,
    t: 'Wiesz, kto Cię odwiedza. Bez cookies',
    p: 'Liczba odwiedzin, źródła ruchu i najczęściej czytane strony w panelu. Statystyki działają bez plików cookies.',
    etykiety: ['bez cookies', 'bez banera', 'w cenie'],
    href: '/funkcje/statystyki',
    link: 'Statystyki',
  },
];

const CECHY: [string, string[]][] = [
  ['Moc', ['limity: 50 GB NVMe, 8 GB RAM, 2 vCPU', 'w szczycie do 24 vCPU i 64 GB RAM', 'dysk do 1000 GB, gdy potrzebujesz więcej', 'LiteSpeed z cache, Redis']],
  ['Bezpieczeństwo', ['kopie z ostatnich 30 dni', 'zapora WAF i skaner', 'SSL dla każdej domeny']],
  ['Poczta i domeny', ['skrzynki bez limitu liczby', 'SPF, DKIM, DMARC w panelu', 'ukrycie danych w WHOIS']],
  ['Wygoda', ['przeniesienie za 0 zł', 'wersja testowa WordPressa', 'statystyki bez cookies']],
];

const KROKI: { n: string; t: string; p: string; kto: string; akcent?: boolean }[] = [
  { n: '1', t: 'Wybierasz domenę', p: 'Sprawdzamy, gdzie dziś jest strona i jaki panel ma stary hosting.', kto: 'TY · 1 min' },
  { n: '2', t: 'Podajesz dostęp', p: 'Login do cPanel, Plesk albo FTP. Hasła szyfrujemy i kasujemy po przeniesieniu.', kto: 'TY · kilka minut' },
  { n: '3', t: 'Kopiujemy dane', p: 'Pliki, bazy i skrzynki. Każdy etap widzisz w panelu na żywo.', kto: 'MY · zwykle 15–90 min' },
  { n: '4', t: 'Przełączasz, kiedy chcesz', p: 'Sprawdzasz stronę na adresie testowym i dopiero wtedy przełączasz domenę.', kto: 'TY · 1 klik', akcent: true },
];

const CZASY: [string, string, string][] = [
  ['TWÓJ CZAS', 'ok. 5 min', 'wybór domeny, dostęp i jedno kliknięcie na koniec'],
  ['STRONA FIRMOWA DO 1 GB', '15–30 min', 'pliki, baza i kilka skrzynek pocztowych'],
  ['SKLEP 1–10 GB', '30–90 min', 'duża baza, tysiące zdjęć produktów'],
  ['PRZERWA W DZIAŁANIU', '0 min', 'stara strona działa, aż sam przełączysz domenę'],
];

const DOKUMENTY: [string, string][] = [
  ['Regulamin', `${LEGAL}/terms`],
  ['Polityka prywatności', `${LEGAL}/privacy`],
  ['Umowa powierzenia (DPA)', `${LEGAL}/dpa`],
  ['Podprocesorzy', `${LEGAL}/privacy`],
];

function faq(c: Ceny): [string, string][] {
  const m = c.hosting.miesiecznie;
  const r = c.hosting.rocznie;
  const lista: [string, string][] = [];
  const cta = ctaProby(c);
  if (cta.proba) {
    lista.push([
      `Jak działa ${cta.dni} ${plForm(cta.dni, 'dzień', 'dni', 'dni')} za darmo?`,
      `Zakładasz konto bez karty i przez ${cta.dni} ${plForm(cta.dni, 'dzień', 'dni', 'dni')} korzystasz z panelu i przeniesienia strony. W czasie próby wysyłka poczty ma niższy limit, nie rejestrujesz domen i nie włączasz dodatkowej mocy. Po próbie opłacasz hosting albo konto zostaje zawieszone.`,
    ]);
  }
  lista.push(
    [
      'Jaki hosting wybrać dla WordPressa albo sklepu WooCommerce?',
      `Taki, który ma cache LiteSpeed, szybkie dyski NVMe i zapas mocy na dni z większym ruchem. W Verris masz to w jednym pakiecie za ${zl(m)} miesięcznie brutto (${zl(netto(m))} netto), a w szczycie strona dostaje dodatkową moc automatycznie — do 24 vCPU i 64 GB RAM.`,
    ],
    [
      'Czy cena wzrośnie przy odnowieniu?',
      `Odnowienie idzie po cenie z cennika (dziś ${zl(m)}/mies. albo ${zl(r)}/rok brutto), którą znasz przed zakupem. Przy pierwszym zakupie pierwszy rok albo miesiąc kosztuje mniej (rabat na start) — kwotę po rabacie widzisz przed zapłatą. Przed odnowieniem wyślemy przypomnienie e-mail, a z odnowienia zrezygnujesz w panelu w każdej chwili, bez opłat.`,
    ],
    [
      'Jak przenieść stronę na nowy hosting i ile to kosztuje?',
      'U nas nic. Podajesz dostęp do starego hostingu, a stronę, bazę i pocztę kopiujemy za Ciebie — albo robisz to sam migratorem w panelu. Stara strona działa, dopóki nie przełączysz domeny.',
    ],
    [
      'Co to jest autoskalowanie hostingu?',
      'To dodatkowa moc, która włącza się sama, gdy na stronie robi się tłoczno, na przykład po starcie reklamy. Co minutę sprawdzamy obciążenie konta i w razie potrzeby dokładamy procesora i pamięci. Płacisz tylko za czas z dodatkową mocą, w blokach po 15 minut, do limitu z panelu.',
    ],
    [
      'Gdzie są moje dane?',
      'W Unii Europejskiej, zgodnie z RODO. Kopie trzymamy poza serwerem strony, a listę podwykonawców znajdziesz w dokumentach.',
    ],
    ['Jak dostanę fakturę?', 'Fakturę VAT po każdej płatności znajdziesz w panelu, a powiadomienie o niej dostajesz e-mailem.'],
  );
  return lista;
}

function jsonLd(c: Ceny, pytania: [string, string][]) {
  return {
    '@context': 'https://schema.org',
    '@graph': [
      organization,
      { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Verris', inLanguage: 'pl-PL', publisher: { '@id': ORG_ID } },
      {
        ...productSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Hosting WWW i WordPress z autoskalowaniem. W cenie 50 GB NVMe oraz limit 8 GB RAM i 2 vCPU; z autoskalowaniem limity rosną do 1000 GB dysku, 64 GB RAM i 24 vCPU. Przeniesienie strony i SSL w cenie, SLA 99,5% z rekompensatą.',
          path: '/',
          offers: ofertyHostingu(c),
        }),
        '@context': undefined,
      },
      { ...faqSchema(pytania), '@context': undefined },
    ],
  };
}

function Ok() {
  return (
    <span className="gl-ok" aria-hidden="true">
      ✓
    </span>
  );
}

function Stopka({ opis, link, href }: { opis: string; link: string; href: string }) {
  return (
    <div className="gl-stopka">
      <span>{opis}</span>
      {href.startsWith('/') ? <Link href={href}>{link} →</Link> : <a href={href}>{link} →</a>}
    </div>
  );
}

export default async function HomePage() {
  const [ceny, dostepnosc] = await Promise.all([pobierzCeny(), pobierzDostepnosc()]);
  const cta = ctaProby(ceny);
  const proba = okresProbny(ceny);
  const m = ceny.hosting.miesiecznie;
  const r = ceny.hosting.rocznie;
  const s = ceny.stawki;
  const pytania = faq(ceny);
  const doplataPiku = kosztMocy(s, PIK_PANEL.vcpu, PIK_PANEL.ram, 0, PIK_PANEL.godziny);
  const dyskMiesiac = s.dysk * GODZIN_W_MIESIACU;

  return (
    <main>
      <style href="verris-glowna" precedence="medium">
        {STYL_GLOWNEJ}
      </style>
      <JsonLd data={jsonLd(ceny, pytania)} />

      {/* HERO */}
      <section className="hero2 gl-hero">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap gl-hero-grid">
          <div>
            <p className="kicker" style={{ margin: 0 }}>
              Hosting WWW i WordPress z autoskalowaniem
            </p>
            <h1>Hosting, przy którym Twoja strona nadąża za klientami</h1>
            <p className="lead">
              Kiedy reklama zadziała albo ruszy promocja, serwer sam dokłada mocy. Po szczycie wracasz do {zl(m)}. Stronę
              przeniesiemy za Ciebie.
            </p>
            <ul className="gl-punkty">
              <li>
                <Ok />
                Moc rośnie do 24 vCPU i 64 GB RAM, tylko na czas ruchu
              </li>
              <li>
                <Ok />
                Cena odnowienia znana z góry: cena z cennika
              </li>
              <li>
                <Ok />
                Przeniesienie strony, bazy i poczty za 0 zł
              </li>
            </ul>
            <div className="gl-cta">
              <Button href={cta.href} cta="hero" plan="hosting">
                {cta.label}
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="hero-migracja">
                Przenieś stronę za 0 zł
              </Button>
            </div>
            <p className="gl-drobne">
              {proba ? 'Bez karty. Po próbie ' : 'Ceny brutto: '}
              {zl(m)}/mies. brutto ({zl(netto(m))} netto) albo {zl(r)}/rok brutto ({zl(netto(r))} netto). Odnowienie po
              cenie z cennika.
            </p>
          </div>
          <HeroPodglad dane={daneHero(ceny)} />
        </div>
      </section>

      {/* LICZBY DO SPRAWDZENIA */}
      <section className="sec" aria-label="Liczby, które możesz sprawdzić" style={{ paddingTop: 0 }}>
        <div className="wrap">
          <div className="gl-liczby">
            {dostepnosc?.d30 != null && (
              <div className="gl-liczba">
                <strong>{procent(dostepnosc.d30)}</strong>
                <span>dostępność w ostatnich 30 dniach</span>
                <a href="https://status.verris.pl">na żywo ze status.verris.pl →</a>
              </div>
            )}
            <div className="gl-liczba">
              <strong>99,5%</strong>
              <span>dostępności w umowie, z rekompensatą</span>
              <Link href="/funkcje/sla">zasady SLA →</Link>
            </div>
            <div className="gl-liczba">
              <strong>30 dni</strong>
              <span>kopii poza serwerem, przywracasz sam</span>
              <Link href="/funkcje/kopie-zapasowe">jak działają kopie →</Link>
            </div>
            <div className="gl-liczba">
              <strong>0 zł</strong>
              <span>za przeniesienie strony, bazy i poczty</span>
              <Link href="/przenies-strone">jak działa przeniesienie →</Link>
            </div>
          </div>
        </div>
      </section>

      {/* ZAJRZYJ DO PANELU */}
      <section className="sec" id="panel">
        <div className="wrap">
          <SectionHead2
            eyebrow="Zajrzyj do panelu, zanim kupisz"
            title="Sprawy, o które zwykle piszesz do pomocy, załatwisz sam w minutę"
            lead="Przywrócenie kopii, nowa skrzynka, sprawdzenie, czemu strona zwolniła. Bez czekania na odpowiedź i bez szukania po menu. Kliknij zakładkę i zobacz."
          />
          <PanelPodglad
            zakladki={ZAKLADKI_PANELU}
            platnosc={zl(m)}
            doplataPiku={zlGrosze(doplataPiku)}
            doplataPikuNetto={zlGrosze(netto(doplataPiku))}
          />
        </div>
      </section>

      {/* RZECZY, KTÓRE DOCENISZ */}
      <section className="sec" id="funkcje">
        <div className="wrap">
          <SectionHead2
            eyebrow="Dlaczego Verris"
            title="Rzeczy, które docenisz w najgorszym możliwym momencie"
            lead="Rzeczy, o których nie myślisz na co dzień, a które ratują dzień, kiedy coś pójdzie nie tak."
          />
          <div className="gl-karty n4">
            {KARTY.map((k) => (
              <Card key={k.t} className="gl-karta">
                <span className="gl-ik">{k.ikona}</span>
                <h3>{k.t}</h3>
                <p>{k.p}</p>
                <div className="gl-etyk">
                  {k.etykiety.map((e) => (
                    <span key={e}>{e}</span>
                  ))}
                </div>
                <div className="gl-stopka">
                  <Link href={k.href}>{k.link} →</Link>
                </div>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CENNIK */}
      <section className="sec sec-alt" id="cennik">
        <div className="wrap">
          <SectionHead2
            eyebrow="Cennik"
            title="Jeden pakiet. Cenę odnowienia znasz z góry"
            lead="Nie wybierasz między pakietami. Dostajesz wszystko, a za dodatkową moc płacisz tylko wtedy, gdy strona jej naprawdę potrzebuje."
          />
          <div className="gl-cennik">
            <Card accent className="gl-cena">
              <PrzelacznikCeny cena={ceny.hosting} nazwa="Hosting Verris z autoskalowaniem" />
              {proba && (
                <div className="gl-proba">
                  <b>
                    {cta.dni} {plForm(cta.dni, 'dzień', 'dni', 'dni')} za darmo, bez karty
                  </b>
                  <span>
                    Pełny panel i przeniesienie strony. W czasie próby: wysyłka do 100 maili na dobę, bez rejestracji domen i bez
                    dodatkowej mocy.
                  </span>
                </div>
              )}
              <Button href={cta.href} cta="home-cennik" plan="hosting">
                {cta.label}
              </Button>
              {proba ? (
                <Link href={ZAMOW} className="gl-alt">
                  albo zamów od razu
                </Link>
              ) : (
                <Link href="/cennik" className="gl-alt">
                  Pełny cennik i kalkulator →
                </Link>
              )}
            </Card>
            <div style={{ display: 'grid', gap: 16, minWidth: 0 }}>
              <div className="gl-cechy">
                {CECHY.map(([t, lista]) => (
                  <Card key={t} className="gl-cecha">
                    <h3>{t}</h3>
                    <ul>
                      {lista.map((x) => (
                        <li key={x}>
                          <Ok />
                          {x}
                        </li>
                      ))}
                    </ul>
                  </Card>
                ))}
              </div>
              <Card className="gl-tabela">
                <h3>Płatne dodatki</h3>
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Dodatek</th>
                      <th scope="col">Cena brutto</th>
                      <th scope="col">Cena netto</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      <th scope="row">
                        Dodatkowa moc w szczycie
                        <small>tylko w szczycie, do limitu, który ustawisz</small>
                      </th>
                      <td>
                        {stawka(s.ram)} zł za 1 GB RAM/h · {stawka(s.cpu)} zł za 1% CPU/h
                      </td>
                      <td>
                        {stawka(nettoStawki(s.ram))} zł · {stawka(nettoStawki(s.cpu))} zł
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">
                        Więcej miejsca na dysku
                        <small>ponad 50 GB, do 1000 GB, tylko za czas użycia</small>
                      </th>
                      <td>
                        {stawka(s.dysk)} zł za 1 GB/h
                        <small>
                          ok. {zlGrosze(dyskMiesiac)} za 1 GB/mies. · +{PRZYKLAD_DYSKU_GB} GB przez cały miesiąc: ok.{' '}
                          {zlGrosze(dyskMiesiac * PRZYKLAD_DYSKU_GB)}
                        </small>
                      </td>
                      <td>
                        {stawka(nettoStawki(s.dysk))} zł
                        <small>
                          ok. {zlGrosze(nettoStawki(dyskMiesiac))} · ok. {zlGrosze(nettoStawki(dyskMiesiac * PRZYKLAD_DYSKU_GB))}
                        </small>
                      </td>
                    </tr>
                    <tr>
                      <th scope="row">Domena</th>
                      <td colSpan={2}>
                        według{' '}
                        {/* A3-15: link w tekście tabeli odróżniony nie tylko kolorem. */}
                        <Link href="/domeny" style={{ textDecoration: 'underline', textUnderlineOffset: 3 }}>
                          cennika domen
                        </Link>
                        , rejestracja i odnowienie obok siebie
                      </td>
                    </tr>
                  </tbody>
                </table>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* PRZENIESIENIE */}
      <section className="sec" id="migracja">
        <div className="wrap">
          <SectionHead2
            eyebrow="Przeniesienie strony · 0 zł"
            title="Przeprowadzka, przy której stara strona działa do końca"
            lead="Ty poświęcasz kilka minut na podanie dostępu. Resztę robimy my, a domenę przełączasz dopiero wtedy, gdy sprawdzisz nową stronę."
          />
          <ol className="gl-kroki">
            {KROKI.map((k) => (
              <li key={k.n}>
                <Card className="gl-krok" accent={k.akcent}>
                  <span className="gl-mono" aria-hidden="true">
                    {k.n}
                  </span>
                  <h3>{k.t}</h3>
                  <p>{k.p}</p>
                  <span className="gl-kto">{k.kto}</span>
                </Card>
              </li>
            ))}
          </ol>
          <Card className="gl-czasy">
            {CZASY.map(([e, w, o]) => (
              <div key={e} className="gl-czas">
                <small>{e}</small>
                <strong>{w}</strong>
                <span>{o}</span>
              </div>
            ))}
          </Card>
          <p className="gl-orient">
            Czasy kopiowania są orientacyjne: zależą od rozmiaru strony i poczty oraz od szybkości starego serwera.
            Przeniesienie przez samo FTP i duże skrzynki pocztowe trwają dłużej. Postęp każdego etapu widzisz w panelu na
            bieżąco.
          </p>
          <div className="gl-ramki">
            <Card className="gl-ramka">
              <div>
                <b>Kończy Ci się hosting?</b>
                <span>Zacznij przeniesienie dziś. Napisz, do kiedy masz opłacony stary hosting, a ustawimy kolejność.</span>
              </div>
              <Button href="/przenies-strone" cta="home-migracja-pilna">
                Przenieś pilnie
              </Button>
            </Card>
            <Card className="gl-ramka">
              <div>
                <b>Wolisz zrobić to sam?</b>
                <span>Poradniki krok po kroku dla cPanel, Plesk i FTP.</span>
              </div>
              <Button href="/przenies-strone#poradniki" variant="ghost" cta="home-poradniki">
                Zobacz poradniki
              </Button>
            </Card>
          </div>
        </div>
      </section>

      {/* ZASADY */}
      <section className="sec sec-alt" id="zasady">
        <div className="wrap">
          <SectionHead2
            eyebrow="Zasady"
            title="Zasady, które znasz przed zakupem"
            lead="Jesteśmy nową marką, więc nie prosimy, żebyś wierzył nam na słowo. Przy każdej zasadzie podajemy, w którym dokumencie ją sprawdzisz, zanim cokolwiek zapłacisz."
          />
          <div className="gl-zasady">
            <Card className="gl-zasada">
              <div className="gl-zasada-g">
                <span className="gl-ik">
                  <ShieldCheck aria-hidden="true" />
                </span>
                <h3>Strona nie działała? Dostajesz rekompensatę</h3>
              </div>
              <p>Gwarantujemy 99,5% dostępności w miesiącu. Poniżej tego oddajemy część opłaty:</p>
              <div className="gl-sla">
                {[
                  ['5%', 'poniżej 99,5%'],
                  ['25%', 'poniżej 99%'],
                  ['50%', 'poniżej 95%'],
                  ['100%', 'poniżej 90%'],
                ].map(([a, b]) => (
                  <div key={a}>
                    <b>{a}</b>
                    <span>{b}</span>
                  </div>
                ))}
              </div>
              <p className="gl-mini">Rekompensatę przyznajemy w kredytach automatycznie, bez wniosku, na zasadach z regulaminu.</p>
              <Stopka opis="Regulamin, §15: dostępność i rekompensaty" link="Czytaj" href={`${LEGAL}/terms`} />
            </Card>
            <Card className="gl-zasada">
              <div className="gl-zasada-g">
                <span className="gl-ik">
                  <Activity aria-hidden="true" />
                </span>
                <h3>Nie ukrywamy awarii</h3>
              </div>
              <p>Każde zakłócenie widać publicznie, z czasem trwania.{dostepnosc ? ' Tak wyglądały dni od uruchomienia pomiarów:' : ''}</p>
              {dostepnosc && <PasekDostepnosci dane={dostepnosc} />}
              <Stopka opis="Sprawdzisz sam, bez logowania" link="status.verris.pl" href="https://status.verris.pl" />
            </Card>
            <Card className="gl-zasada">
              <div className="gl-zasada-g">
                <span className="gl-ik">
                  <Globe aria-hidden="true" />
                </span>
                <h3>Domena nie przedłuży się bez Ciebie</h3>
              </div>
              <p>
                Nie pobieramy pieniędzy za domenę automatycznie. Przypominamy 30, 14 i 7 dni przed końcem, a odnawiasz jednym
                kliknięciem w panelu, kiedy sam zdecydujesz.
              </p>
              <div className="gl-etyk">
                <span>cena odnowienia widoczna przed zakupem</span>
                <span>kod transferu na żądanie</span>
              </div>
              <Stopka opis="Regulamin, §12: domeny" link="Jak to działa" href="/funkcje/domeny-bez-auto-odnowien" />
            </Card>
            <Card className="gl-zasada">
              <div className="gl-zasada-g">
                <span className="gl-ik">
                  <FileText aria-hidden="true" />
                </span>
                <h3>RODO bez papierologii</h3>
              </div>
              <p>
                Umowę powierzenia akceptujesz w panelu. Lista podprocesorów i regulamin są publiczne, napisane prostym językiem.
                Dane trzymamy w Unii Europejskiej.
              </p>
              <div className="gl-etyk">
                <span>dane w UE</span>
                <span>rodo@verris.pl</span>
                <span>DPA online</span>
              </div>
              <Stopka opis="Umowa powierzenia i lista podprocesorów" link="Dokumenty" href="/dokumenty" />
            </Card>
          </div>
          <Card className="gl-firma">
            <div className="gl-firma-kto">
              <small>KTO ŚWIADCZY USŁUGĘ</small>
              <b>{SPRZEDAWCA.nazwa}</b>
              <span>
                {ADRES_SPRZEDAWCY} · NIP {SPRZEDAWCA.nip} · REGON {SPRZEDAWCA.regon} · {SPRZEDAWCA.email}
              </span>
            </div>
            <ul className="gl-dokumenty">
              {DOKUMENTY.map(([t, h]) => (
                <li key={t}>
                  <a href={h}>
                    <b>{t}</b>
                    <span>aktualna wersja i historia zmian</span>
                  </a>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </section>

      {/* INNE USŁUGI + PORADNIKI */}
      <section className="sec">
        <div className="wrap">
          <KartyUslug />
          <Poradniki />
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" id="faq">
        <div className="wrap gl-faq">
          <div className="gl-faq-g">
            <p className="kicker" style={{ margin: 0 }}>
              FAQ
            </p>
            <h2>Pytania, które słyszymy najczęściej</h2>
            <p>
              Nie ma tu Twojego pytania? <a href="#porozmawiajmy">Poproś o telefon</a> albo <Link href="/kontakt">napisz do nas</Link>.
            </p>
          </div>
          <Accordion items={pytania.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <PasRozmowy temat="ogolny" />

      <CTABand
        title="Przenieś stronę dziś. Cenę odnowienia znasz już teraz"
        text="Przeniesienie strony, poczty i bazy w cenie. Stara strona działa do momentu, w którym sam przełączysz domenę."
        primaryLabel={cta.label}
        primaryHref={cta.href}
        secondary={{ label: 'Przenieś stronę za 0 zł', href: '/przenies-strone' }}
      />
      <MobilnyPasek {...pasekHostingu(ceny)} />
    </main>
  );
}

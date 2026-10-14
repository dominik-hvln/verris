import type { Metadata } from 'next';
import Link from 'next/link';
import { AKalkulator } from './components/AKalkulator';
import { AZakladki, type Zakladka } from './components/AZakladki';
import { Accordion, Button, Card, CTABand, JsonLd, SectionHead, StickyBuy, Steps, type Step } from './components/ui';
import { organization, ORG_ID, SITE, HOSTING_OFFERS, faqSchema, productSchema } from '@/lib/schema';
import { formatZl, kosztPiku } from '@/lib/kalkulator';
import { ZAMOW } from '@/lib/site';

// Makieta 14.10, plansza Main + notatka „seo-glowna” (canvas.json).
export const metadata: Metadata = {
  title: 'Hosting WWW i WordPress z autoskalowaniem | Verris',
  description:
    'Szybki polski hosting dla firm i sklepów: LiteSpeed, NVMe, kopie, które przywracasz sam, i darmowe przeniesienie strony. Od 45 zł/mies. brutto.',
  alternates: { canonical: '/' },
};

// Przykład w zakładce „Autoskalowanie”: dwa dodatkowe procesory wirtualne i 4 GB pamięci przez 1,5 h (ze stawek, nie wpisane).
const PRZYKLAD_ZAKLADKA = formatZl(kosztPiku(2, 4, 1.5));

const PARAMETRY: [string, string][] = [
  ['SLA 99,5%', 'z rekompensatą, warunki w regulaminie'],
  ['50 GB NVMe', 'do 8 GB RAM i do 2 vCPU w cenie'],
  ['do 24 vCPU', 'i 64 GB RAM w piku'],
  ['LiteSpeed', 'cache dla WordPressa i WooCommerce'],
  ['Po polsku', 'pomoc, panel, regulamin i umowy'],
];

type Tab = { id: string; label: string; title: string; text: string; points: string[]; href: string; link: string; rows: [string, string][] };
const TABS: Tab[] = [
  {
    id: 'pulpit',
    label: 'Pulpit',
    title: 'Stan strony w jednym miejscu',
    text: 'Po zalogowaniu widzisz, czy strona działa, ile zasobów zużywa i kiedy powstała ostatnia kopia.',
    points: ['czy strona działa i czy SSL jest aktywny', 'zużycie dysku, pamięci i procesora', 'ostatnia kopia i najbliższa płatność'],
    href: '/hosting',
    link: 'Więcej o hostingu',
    rows: [
      ['sklep-ogrodowy.pl', 'działa'],
      ['Ostatnia kopia', 'dziś 03:10'],
      ['Certyfikat SSL', 'aktywny'],
      ['Następna płatność', '45 zł'],
    ],
  },
  {
    id: 'autoskalowanie',
    label: 'Autoskalowanie',
    title: 'Zasoby rosną, kiedy rośnie ruch',
    text: 'W piku konto dostaje więcej procesora i pamięci, a po nim wraca do zasobów z pakietu. Limit kosztu ustawiasz sam.',
    points: ['do 24 vCPU i 64 GB RAM', 'dopłata tylko za czas piku, w blokach po 15 minut', 'limit kosztu autoskalowania w panelu'],
    href: '/hosting',
    link: 'Jak działa autoskalowanie',
    rows: [
      ['Autoskalowanie', 'włączone'],
      ['Limit kosztu / mies.', '30 zł'],
      ['Pik wczoraj', '19:40–21:10'],
      ['Dopłata za ten pik', `${PRZYKLAD_ZAKLADKA} zł`],
    ],
  },
  {
    id: 'kopie',
    label: 'Kopie',
    title: 'Przywracasz sam, z wybranego dnia',
    text: 'Wybierasz datę i co przywrócić: pliki, bazę albo pocztę. Przed przywróceniem zapisujemy kopię bieżącego stanu.',
    points: ['pliki, bazy i poczta osobno', 'kopia bezpieczeństwa przed przywróceniem', 'szyfrowane kopie poza serwerem z ostatnich 30 dni'],
    href: '/funkcje/kopie-zapasowe',
    link: 'Jak działają kopie',
    rows: [
      ['14.10 03:10', 'pełna'],
      ['13.10 03:10', 'pełna'],
      ['12.10 03:10', 'pełna'],
      ['Przywróć bazę sklepu', 'wybierz →'],
    ],
  },
  {
    id: 'przeniesienie',
    label: 'Przeniesienie',
    title: 'Przeniesienie strony krok po kroku',
    text: 'Podajesz dostęp do starego hostingu, a my kopiujemy pliki, bazy i pocztę. Stara strona działa, dopóki nie przełączysz domeny.',
    points: ['pliki, bazy danych i poczta', 'podgląd strony przed zmianą DNS', 'bezpłatnie, w ramach zamówienia hostingu'],
    href: '/przenies-strone',
    link: 'Jak działa przeniesienie',
    rows: [
      ['Pliki', '100%'],
      ['Baza wp_sklep', '100%'],
      ['Poczta biuro@', '64%'],
      ['Przełączenie domeny', 'czeka na Ciebie'],
    ],
  },
  {
    id: 'poczta',
    label: 'Poczta',
    title: 'Poczta w Twojej domenie',
    text: 'Skrzynki, aliasy i przekierowania w jednym panelu. Webmail otwierasz z panelu bez osobnego logowania.',
    points: ['skrzynki bez limitu liczby, w ramach zasobów konta', 'aliasy i przekierowania', 'webmail z logowaniem z panelu'],
    href: '/poczta',
    link: 'Więcej o poczcie',
    rows: [
      ['biuro@sklep-ogrodowy.pl', '0,4 / 1 GB'],
      ['zamowienia@', 'alias → biuro@'],
      ['Webmail', 'zaloguj z panelu'],
      ['SPF, DKIM, DMARC', 'ustawione'],
    ],
  },
  {
    id: 'statystyki',
    label: 'Statystyki',
    title: 'Odwiedziny bez plików cookies',
    text: 'Liczba odwiedzin, źródła ruchu i najczęściej czytane strony — w panelu, bez cookies na Twojej stronie.',
    points: ['odwiedziny, źródła i strony wejścia', 'bez plików cookies', 'w cenie hostingu'],
    href: '/funkcje/statystyki',
    link: 'Jak działają statystyki',
    rows: [
      ['Odwiedziny dziś', '1 284'],
      ['Źródło nr 1', 'Google'],
      ['Najczęstsze wejście', '/sklep/nasiona'],
      ['Cookies', 'brak'],
    ],
  },
];

const ZAKLADKI: Zakladka[] = TABS.map((t) => ({
  id: t.id,
  label: t.label,
  panel: (
    <div className="a-tabpanel">
      <div className="a-tabtxt">
        <h3>{t.title}</h3>
        <p>{t.text}</p>
        <ul className="a-list">
          {t.points.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <Link href={t.href}>{t.link} →</Link>
      </div>
      <div className="a-screen" role="img" aria-label={`Przykładowy ekran panelu: ${t.title.toLowerCase()}.`}>
        <span className="a-dots" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        {t.rows.map(([a, b]) => (
          <p key={a}>
            <span>{a}</span>
            <span className="mono mint">{b}</span>
          </p>
        ))}
        <small>Przykładowe dane. Ekran poglądowy panelu Verris.</small>
      </div>
    </div>
  ),
}));

const FUNKCJE: { t: string; p: string; href: string; link: string }[] = [
  {
    t: 'Szybka strona to więcej zamówień',
    p: 'LiteSpeed z cache dla WordPressa i WooCommerce, dyski NVMe i Redis. Strona ładuje się szybko także wtedy, gdy odwiedza ją naraz wiele osób.',
    href: '/hosting',
    link: 'Jak działa autoskalowanie',
  },
  {
    t: 'Śpisz spokojnie, strona pracuje',
    p: 'Każde konto działa w osobnej izolacji, zapora aplikacji (WAF) zatrzymuje typowe ataki, a ImunifyAV skanuje pliki w tle.',
    href: '/specyfikacja',
    link: 'Co dokładnie chroni Twoją stronę',
  },
  {
    t: 'Aktualizacja coś zepsuła? Wróć do wczoraj',
    p: 'Przywracasz pliki, bazę albo pocztę z wybranego dnia. Zanim to zrobisz, zapisujemy kopię obecnego stanu, na wszelki wypadek.',
    href: '/funkcje/kopie-zapasowe',
    link: 'Zobacz, jak to wygląda',
  },
  {
    t: 'Wiesz, kto Cię odwiedza. Bez cookies',
    p: 'Liczba odwiedzin, źródła ruchu i najczęściej czytane strony w panelu. Statystyki działają bez plików cookies.',
    href: '/funkcje/statystyki',
    link: 'Jak działają statystyki',
  },
];

const PRZENIESIENIE: Step[] = [
  { label: '01', title: 'Wybierz domenę', text: 'Tę, którą chcesz przenieść — z listy domen Twojego konta.' },
  { label: '02', title: 'Podaj dostęp', text: 'Login do starego panelu albo FTP i hasła skrzynek. Wystarczy formularz w panelu.' },
  { label: '03', title: 'Kopiujemy dane', text: 'Pliki, bazy i pocztę. Stara strona działa w tym czasie normalnie.' },
  { label: '04', title: 'Przełącz, kiedy chcesz', text: 'Najpierw sprawdzasz stronę, potem zmieniasz DNS. Decyzja należy do Ciebie.' },
];

const ZASADY: [string, string][] = [
  [
    'Strona nie działała? Dostajesz rekompensatę',
    'SLA 99,5% dostępności w miesiącu. Gdy dostępność spadnie poniżej, przyznajemy rekompensatę w kredytach — na wniosek, na zasadach z regulaminu.',
  ],
  ['Domena nie przedłuży się bez Ciebie', 'Przypominamy 30, 14 i 7 dni przed końcem, a odnawiasz wtedy, kiedy sam zdecydujesz.'],
  [
    'RODO bez papierologii',
    'Umowę powierzenia danych akceptujesz w panelu. Listę firm, z którymi współpracujemy, znajdziesz w dokumentach.',
  ],
  ['Nie ukrywamy awarii', 'Publiczna strona statusu pokazuje dostępność usług i każdą przerwę, z opisem.'],
];

const FAQ: [string, string][] = [
  [
    'Jaki hosting wybrać dla WordPressa albo sklepu WooCommerce?',
    'Taki, który ma cache LiteSpeed, szybkie dyski NVMe i zapas mocy na dni z większym ruchem. W Verris masz to w jednym pakiecie za 45 zł miesięcznie brutto, a w szczycie strona dostaje dodatkową moc automatycznie — do 24 vCPU i 64 GB RAM.',
  ],
  [
    'Czy cena wzrośnie przy odnowieniu?',
    'Nie ma taniego pierwszego okresu. Odnowienie idzie po cenie z cennika (dziś 45 zł/mies. albo 449 zł/rok brutto). Przed odnowieniem wyślemy przypomnienie e-mail, a z odnowienia zrezygnujesz w panelu w każdej chwili, bez opłat.',
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
];

const homeJsonLd = {
  '@context': 'https://schema.org',
  '@graph': [
    organization,
    { '@type': 'WebSite', '@id': `${SITE}/#website`, url: `${SITE}/`, name: 'Verris', inLanguage: 'pl-PL', publisher: { '@id': ORG_ID } },
    { ...productSchema({
      name: 'Hosting Verris z autoskalowaniem',
      description:
        'Hosting WWW i WordPress z autoskalowaniem. W cenie 50 GB NVMe, do 8 GB RAM i do 2 vCPU; w piku do 24 vCPU, 64 GB RAM i 1000 GB dysku. Przeniesienie strony i SSL w cenie, SLA 99,5% z rekompensatą.',
      path: '/',
      offers: HOSTING_OFFERS,
    }), '@context': undefined },
    { ...faqSchema(FAQ), '@context': undefined },
  ],
};

export default function HomePage() {
  return (
    <main>
      <JsonLd data={homeJsonLd} />

      {/* HERO */}
      <section className="hero2">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <span className="chip">Polski hosting dla firm, sklepów i WordPressa</span>
            <h1>Hosting, przy którym Twoja strona nadąża za klientami</h1>
            <p className="lead">
              Szybki hosting stron, sklepów i WordPressa. Kiedy na stronę wpada więcej klientów, dostaje więcej mocy.
              Kiedy coś pójdzie nie tak, sam przywracasz wczorajszą kopię. A za rok płacisz tyle samo co dziś.
            </p>
            <div className="hero2-cta">
              <Button href={ZAMOW} cta="hero" plan="hosting">
                Zacznij od 45 zł/mies.
              </Button>
              <Button href="/przenies-strone" variant="ghost" cta="hero-migracja">
                Przeniesiemy Twoją stronę za darmo
              </Button>
            </div>
            <p className="hero2-fine">
              Ceny brutto. Rocznie 449 zł (ok. 37 zł/mies.). Odnowienie po tej samej cenie — bez taniego pierwszego roku
              i drogiego drugiego.
            </p>
          </div>

          <div className="card a-hero-panel">
            <div className="a-hero-top">
              <p>Twój panel · sklep-ogrodowy.pl</p>
              <p className="mono mint">● działa</p>
            </div>
            <div className="a-tiles">
              <div>
                <small>CPU</small>
                <b>2 → 6 vCPU</b>
                <small className="mint">pik o 19:40</small>
              </div>
              <div>
                <small>RAM</small>
                <b>do 8 GB</b>
                <small>w pakiecie</small>
              </div>
              <div>
                <small>Kopia</small>
                <b>dziś 03:10</b>
                <small>przywróć sam</small>
              </div>
            </div>
            <svg
              viewBox="0 0 520 150"
              role="img"
              aria-label="Przykładowy wykres: obciążenie rośnie wieczorem, zasoby dobierają się automatycznie i wracają do zasobów z pakietu."
              className="a-curve"
            >
              <line x1="0" y1="110" x2="520" y2="110" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
              <text x="4" y="104" fill="#93A29A" fontSize="11" fontFamily="JetBrains Mono, monospace">
                zasoby w cenie pakietu
              </text>
              <path
                d="M0 120 C60 118 100 116 140 112 C190 104 220 70 260 40 C290 22 320 26 350 60 C380 96 420 112 520 116 L520 150 L0 150 Z"
                fill="rgba(52,229,160,0.10)"
              />
              <path
                d="M0 120 C60 118 100 116 140 112 C190 104 220 70 260 40 C290 22 320 26 350 60 C380 96 420 112 520 116"
                fill="none"
                stroke="#34E5A0"
                strokeWidth="3"
              />
              <text x="236" y="20" fill="#F4F4EE" fontSize="12">
                więcej klientów — więcej mocy
              </text>
            </svg>
            <Link href="/hosting#pokaz" className="a-link">
              Zobacz animację: tydzień sklepu z reklamą →
            </Link>
          </div>
        </div>
      </section>

      <section className="a-band" aria-label="Najważniejsze parametry">
        <ul className="wrap a-params">
          {PARAMETRY.map(([b, s]) => (
            <li key={b}>
              <b>{b}</b>
              <span>{s}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* PANEL */}
      <section className="sec" id="panel">
        <div className="wrap">
          <SectionHead
            eyebrow="Zajrzyj do panelu, zanim kupisz"
            title="Sprawy, o które zwykle piszesz do pomocy, załatwisz sam w minutę"
            lead="Przywrócenie kopii, nowa skrzynka, sprawdzenie, czemu strona zwolniła — bez czekania na odpowiedź i bez szukania po menu. Kliknij zakładkę i zobacz."
          />
          <AZakladki label="Funkcje panelu" items={ZAKLADKI} />
        </div>
      </section>

      {/* FUNKCJE */}
      <section className="sec" id="funkcje">
        <div className="wrap">
          <SectionHead title="Rzeczy, które docenisz w najgorszym możliwym momencie" />
          <div className="a-grid4">
            {FUNKCJE.map((f) => (
              <Card key={f.t}>
                <h3>{f.t}</h3>
                <p>{f.p}</p>
                <Link href={f.href}>{f.link} →</Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CENNIK */}
      <section className="sec sec-alt" id="cennik">
        <div className="wrap a-cennik">
          <div>
            <SectionHead
              eyebrow="Cennik"
              title="Twoja strona ma lepsze i gorsze dni. Rachunek też powinien"
              lead="W zwykły dzień płacisz 45 zł za miesiąc i nic więcej. Gdy wyprzedaż albo reklama ściągnie tłum, dokładamy mocy na te godziny i tylko za nie płacisz — do limitu, który sam ustawisz. Sprawdź, ile to może być:"
            />
            <AKalkulator wariant="krotki" />
          </div>
          <div className="card card-accent a-price">
            <h3>Hosting Verris z autoskalowaniem</h3>
            <p className="price-big2">
              45 zł<span> / mies. brutto</span>
            </p>
            <p>albo 449 zł / rok brutto — ta sama cena przy odnowieniu</p>
            <ul className="a-list">
              <li>50 GB NVMe, do 8 GB RAM i do 2 vCPU w cenie</li>
              <li>bez limitu stron, skrzynek i transferu (w ramach zasobów konta i zasad uczciwego korzystania)</li>
              <li>certyfikaty SSL, kopie z 30 dni i przeniesienie strony w cenie</li>
            </ul>
            <Button href={ZAMOW} cta="home-cennik" plan="hosting" className="btn-block">
              Zamów hosting
            </Button>
            <Link href="/cennik" className="a-link">
              Pełny cennik i kalkulator →
            </Link>
          </div>
        </div>
      </section>

      {/* PRZENIESIENIE */}
      <section className="sec" id="migracja">
        <div className="wrap">
          <SectionHead
            eyebrow="Przeniesienie strony"
            title="Przeprowadzka bez stresu. Stara strona działa, dopóki nie powiesz „przełączamy”"
          />
          <Steps items={PRZENIESIENIE} />
          <p className="center-cta">
            <Button href="/przenies-strone" cta="migracja">
              Zobacz, jak działa przeniesienie
            </Button>
          </p>
        </div>
      </section>

      {/* ZASADY */}
      <section className="sec sec-alt" id="zasady">
        <div className="wrap a-cennik">
          <SectionHead
            title="Zasady, które znasz przed zakupem"
            lead="Jesteśmy nową marką, więc nie prosimy, żebyś wierzył nam na słowo. Wszystko, co tu obiecujemy, jest zapisane w regulaminie i specyfikacji. Przeczytasz je, zanim cokolwiek zapłacisz."
          />
          <div className="a-grid2">
            {ZASADY.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="sec" id="faq">
        <div className="wrap narrow">
          <SectionHead title="Pytania, które słyszymy najczęściej" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Przenieś stronę dziś. Za rok zapłacisz tyle samo"
        text="Przeniesienie strony, poczty i bazy w cenie. Stara strona działa do momentu, w którym sam przełączysz domenę."
        secondary={{ label: 'Jak działa przeniesienie', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

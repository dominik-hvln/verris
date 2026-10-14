import type { Metadata } from 'next';
import Link from 'next/link';
import { Accordion, Card, CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';
import { faqSchema, SITE } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';
import { SPEC_PO_WERYFIKACJI } from '@/lib/oferta';

/*
 * /funkcje — makieta 14.10 (Funkcje.dc.html). Każda karta ma pokrycie w /specyfikacja, lib/features.ts albo
 * w kodzie produktu (statystyki: apps/api/src/analytics-sites). Karty zależne od weryfikacji na węźle (`po`)
 * znikają razem z SPEC_PO_WERYFIKACJI.
 */

export const metadata: Metadata = {
  title: 'Funkcje hostingu: kopie, SSL, WAF, statystyki | Verris',
  description:
    'Co dostajesz w hostingu Verris: autoskalowanie, kopie z 30 dni, SSL, WAF, statystyki bez cookies i SLA 99,5%. Jeden pakiet, 45 zł/mies brutto.',
  alternates: { canonical: '/funkcje' },
};

type Funkcja = { tag: string; title: string; text: string; href: string; more: string; po?: boolean };

const GRUPY: { title: string; id: string; items: Funkcja[] }[] = [
  {
    title: 'Moc i szybkość',
    id: 'moc',
    items: [
      {
        tag: 'do 24 vCPU · 64 GB RAM',
        title: 'Autoskalowanie',
        text: 'Gdy ruch rośnie, serwer dokłada procesora i pamięci. Po szczycie zasoby wracają do pakietu, a dopłatę ograniczasz własnym limitem.',
        href: '/funkcje/autoskalowanie',
        more: 'Jak to działa',
      },
      {
        tag: 'LiteSpeed Enterprise',
        title: 'LiteSpeed i dyski NVMe',
        text: 'Szybki serwer WWW z pamięcią podręczną i dyski NVMe — także dla stron otwieranych w telefonie.',
        href: '/specyfikacja',
        more: 'Parametry',
        po: true,
      },
      {
        tag: 'w cenie',
        title: 'Redis i Memcached',
        text: 'Osobna instancja dla Twojego konta, dostępna tylko przez gniazdo UNIX. Przydaje się WordPressowi i sklepom.',
        href: '/specyfikacja',
        more: 'Szczegóły',
        po: true,
      },
    ],
  },
  {
    title: 'Spokój i bezpieczeństwo',
    id: 'bezpieczenstwo',
    items: [
      {
        tag: '30 dni wstecz',
        title: 'Kopie zapasowe',
        text: 'Codzienna kopia na serwerze i szyfrowana kopia z 30 dni poza nim. Przywracasz sam z panelu, bez zgłoszenia.',
        href: '/funkcje/kopie-zapasowe',
        more: 'Kopie zapasowe',
      },
      {
        tag: 'ModSecurity · ImunifyAV',
        title: 'Zapora WAF i skaner',
        text: 'Reguły OWASP CRS zatrzymują typowe ataki na aplikacje, a ImunifyAV szuka złośliwego kodu w tle i na żądanie.',
        href: '/specyfikacja',
        more: 'Zabezpieczenia',
        po: true,
      },
      {
        tag: '0 zł',
        title: 'Certyfikaty SSL',
        text: 'Let’s Encrypt dla każdej domeny, także wildcard. Odnawia się automatycznie i nie płacisz za to osobno.',
        href: '/funkcje/ssl',
        more: 'SSL',
      },
      {
        tag: 'osobne limity',
        title: 'Izolacja kont',
        text: 'Twoje konto ma własne limity CPU, RAM i procesów oraz osobny system plików. Inne konta na serwerze go nie obciążą.',
        href: '/specyfikacja',
        more: 'Izolacja',
        po: true,
      },
    ],
  },
  {
    title: 'Wygoda na co dzień',
    id: 'wygoda',
    items: [
      {
        tag: 'bez cookies',
        title: 'Statystyki odwiedzin',
        text: 'Widzisz, skąd przychodzą ludzie i co czytają. Bez plików cookies i bez zapisywania adresów IP.',
        href: '/funkcje/statystyki',
        more: 'Statystyki',
      },
      {
        tag: 'staging w cenie',
        title: 'WordPress jednym kliknięciem',
        text: 'Instalacja z panelu i kopia testowa (staging), na której sprawdzisz zmiany przed wprowadzeniem ich na stronę.',
        href: '/hosting/wordpress',
        more: 'Hosting WordPress',
      },
      {
        tag: '0 zł',
        title: 'Przeniesienie strony',
        text: 'Przenosimy stronę, bazy i pocztę. Stara strona działa, dopóki nie przełączysz domeny.',
        href: '/przenies-strone',
        more: 'Przeprowadzka',
      },
      {
        tag: 'do 100 GB',
        title: 'Poczta w domenie',
        text: 'Skrzynki do 100 GB, webmail z logowaniem z panelu, filtr antyspamowy i przekierowania.',
        href: '/poczta',
        more: 'Poczta',
      },
      {
        tag: 'bez auto-odnowień',
        title: 'Domeny bez cichych odnowień',
        text: 'Nic nie pobieramy bez Twojej decyzji. Przypominamy 30, 14 i 7 dni przed wygaśnięciem.',
        href: '/funkcje/domeny-bez-auto-odnowien',
        more: 'Domeny',
      },
      {
        tag: 'PHP 7.4–8.3',
        title: 'PHP, Node.js i Python',
        text: 'Wersja PHP osobno dla każdej domeny, aplikacje Node.js i Python uruchamiane z panelu, SSH i Git.',
        href: '/specyfikacja',
        more: 'Technologie',
        po: true,
      },
    ],
  },
];

const GWARANCJE: { tag: string; title: string; text: string; href: string; more: string }[] = [
  {
    tag: 'SLA',
    title: 'SLA 99,5% z rekompensatą',
    text: 'Gdy dostępność w miesiącu spadnie poniżej 99,5%, na wniosek przysługuje rekompensata od 5% do 100% opłaty — tak stoi w regulaminie.',
    href: '/funkcje/sla',
    more: 'Zasady SLA',
  },
  {
    tag: 'RODO',
    title: 'Komplet dokumentów RODO',
    text: 'Umowę powierzenia akceptujesz w panelu, a listę podprocesorów masz zawsze pod ręką. Dane w UE.',
    href: '/funkcje/rodo-i-dpa',
    more: 'RODO i DPA',
  },
  {
    tag: 'cena',
    title: 'Ta sama cena przy odnowieniu',
    text: 'Nie ma taniego pierwszego roku. 45 zł/mies albo 449 zł/rok brutto — dziś i przy odnowieniu.',
    href: '/cennik',
    more: 'Cennik',
  },
];

const FAQ: [string, string][] = [
  [
    'Czy któreś funkcje są płatne osobno?',
    'Funkcje z tej strony są w cenie hostingu. Osobno płacisz za rejestrację domen oraz za autoskalowanie, gdy ruch przekroczy pakiet — najwyżej do limitu kosztu, który sam ustawiasz w panelu.',
  ],
  [
    'Czy mogę mieć kilka stron na jednym koncie?',
    'Tak. Liczba stron, domen, skrzynek i baz nie jest ograniczona. Ograniczają je tylko zasoby konta.',
  ],
  [
    'Czy dostanę pomoc przy konfiguracji?',
    'Tak. Piszesz do nas, odpowiadamy zwykle w ciągu dnia roboczego. Przeniesienie strony możemy zrobić za Ciebie w cenie hostingu.',
  ],
];

export default function Page() {
  const grupy = GRUPY.map((g) => ({ ...g, items: g.items.filter((f) => SPEC_PO_WERYFIKACJI || !f.po) }));
  const lista = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Funkcje hostingu Verris',
    itemListElement: grupy
      .flatMap((g) => g.items)
      .map((f, i) => ({ '@type': 'ListItem', position: i + 1, name: f.title, url: `${SITE}${f.href}` })),
  };
  return (
    <main>
      <JsonLd data={lista} />
      <JsonLd data={faqSchema(FAQ)} />
      <SubHero
        eyebrow="Funkcje hostingu"
        title="Wszystko, co trzyma Twoją stronę w formie. Bez dopłat za podstawy"
        lead="Kopie, certyfikaty, statystyki, ochrona przed atakami i moc, która rośnie razem z ruchem. U nas to nie są dodatki z osobnym cennikiem, tylko część jednego pakietu."
        crumbs={[{ label: 'Funkcje' }]}
        primary={{ label: 'Zobacz cennik', href: '/cennik' }}
        secondary={{ label: 'Pełna specyfikacja', href: '/specyfikacja' }}
      />

      {grupy.map((g, i) => (
        <section className={`sec${i % 2 ? ' sec-alt' : ''}`} key={g.id} aria-labelledby={`f-${g.id}`}>
          <div className="wrap">
            <SectionHead title={g.title} id={`f-${g.id}`} />
            <div className="grid3">
              {g.items.map((f) => (
                <Link className="c-fcard" href={f.href} key={f.title}>
                  <span className="c-tag">{f.tag}</span>
                  <h3>{f.title}</h3>
                  <p>{f.text}</p>
                  <span className="c-more">{f.more} →</span>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ))}

      <section className="sec sec-alt" aria-labelledby="f-gwarancje">
        <div className="wrap">
          <SectionHead title="Gwarancje zapisane w umowie" id="f-gwarancje" />
          <div className="grid3">
            {GWARANCJE.map((g) => (
              <Card key={g.title}>
                <span className="c-tag">{g.tag}</span>
                <h3>{g.title}</h3>
                <p>{g.text}</p>
                <Link href={g.href}>{g.more} →</Link>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec" aria-labelledby="f-faq">
        <div className="wrap c-narrow">
          <SectionHead title="Częste pytania" id="f-faq" />
          <Accordion items={FAQ.map(([q, a], i) => ({ title: q, body: <p>{a}</p>, open: i === 0 }))} />
        </div>
      </section>

      <CTABand
        title="Wszystkie te funkcje dostajesz w jednym pakiecie"
        text="45 zł miesięcznie albo 449 zł za rok brutto. Bez wersji Pro, Max i Ultra."
        primaryHref={ZAMOW}
        secondary={{ label: 'Zobacz cennik', href: '/cennik' }}
      />
    </main>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';
import { Breadcrumbs, Button, Card, CTABand, JsonLd, SectionHead, SpecTable, StickyBuy, Steps, type SpecGroup, type Step } from '../components/ui';
import { KalkulatorPiku } from '../components/KalkulatorPiku';
import { PANEL } from '@/lib/site';
import { serviceSchema, HOSTING_OFFERS } from '@/lib/schema';
import { SPEC_PO_WERYFIKACJI, zweryfikowane } from '@/lib/oferta';

export const metadata: Metadata = {
  title: 'Hosting z autoskalowaniem — 45 zł/mies | Verris',
  description:
    'Hosting współdzielony z autoskalowaniem. Baza 50 GB NVMe, do 8 GB RAM, do 2 vCPU — skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł, bez limitu stron i skrzynek. 45 zł/mies lub 449 zł/rok brutto.',
  alternates: { canonical: '/hosting' },
};

const OS: Step[] = [
  {
    label: '08:00 — zwykły dzień',
    title: 'Strona pracuje w bazie',
    text: 'Do 2 vCPU i do 8 GB RAM w cenie abonamentu. Dopłata: 0 zł.',
    bar: 33,
  },
  {
    label: '14:00 — start kampanii',
    title: 'Ruch rośnie — moc też',
    text: 'System dokłada vCPU i RAM w ciągu minut. Strona działa szybko, zamiast zatrzymać się na limicie pakietu.',
    bar: 98,
    accent: true,
  },
  {
    label: '16:30 — po kampanii',
    title: 'Powrót do bazy',
    text: 'Nadwyżka znika, naliczanie kończy się w ciągu kilkunastu minut. Płacisz za 2,5 godziny, nie za cały miesiąc.',
    bar: 38,
  },
];

const ZASADY: [string, string][] = [
  ['Limit kosztów', 'Ustawiasz limit kosztu autoskalowania w panelu. Po jego osiągnięciu zasoby przestają rosnąć.'],
  ['Wszystko na wykresach', 'CPU, RAM i I/O na bieżąco w panelu, z powiadomieniami. Widzisz, kiedy był pik i ile kosztował.'],
  ['Rozliczenie z portfela', 'Dopłaty schodzą z salda konta w blokach po 15 minut. Każdy blok widzisz w historii.'],
];

const ZYSKI: { t: string; p: string; link?: [string, string] }[] = [
  {
    t: 'Szybki WordPress',
    p: SPEC_PO_WERYFIKACJI
      ? 'LiteSpeed Enterprise z cache, Redis dla konta i dyski NVMe. Staging jednym kliknięciem.'
      : 'Dyski NVMe, PHP osobno dla każdej domeny, instalacja jednym kliknięciem i kopia testowa (staging).',
    link: ['Hosting WordPress', '/hosting/wordpress'],
  },
  {
    t: 'Sklep gotowy na Black Friday',
    p: 'Moc rośnie z ruchem — do 24 vCPU i 64 GB RAM — zamiast kończyć się na limicie pakietu w środku promocji.',
    link: ['Hosting dla sklepu', '/hosting/sklep'],
  },
  {
    t: 'Spokojna głowa',
    p: SPEC_PO_WERYFIKACJI
      ? 'Kopie z 30 dni poza serwerem, skaner ImunifyAV, WAF i izolacja kont.'
      : 'Kopie z 30 dni poza serwerem, samodzielne przywracanie i kopia bezpieczeństwa przed przywróceniem.',
  },
  { t: 'Wszystko w jednym panelu', p: 'Strony, poczta, domeny, DNS i kopie — po polsku, bez przełączania się między narzędziami.' },
  { t: 'Dla agencji i freelancerów', p: 'Bez limitu stron, subkonta z uprawnieniami dla klientów i współpracowników, tokeny API.', link: ['Program resellerski', '/reseller'] },
  { t: 'Uczciwa umowa', p: 'SLA 99,5% z rekompensatą, cena odnowienia równa cenie z cennika.' },
];

// Wiersze z /specyfikacja w grupach z makiety; `po: true` — czeka na weryfikację na węźle (lib/oferta.ts).
type Wiersz = { k: string; v: string; po?: boolean };
const SPEC: { title: string; rows: Wiersz[] }[] = [
  {
    title: 'Zasoby',
    rows: [
      { k: 'Dysk NVMe', v: '50 GB, autoskalowanie do 1000 GB' },
      { k: 'RAM', v: 'do 8 GB, w piku do 64 GB' },
      { k: 'Procesor', v: 'do 2 vCPU, w piku do 24 vCPU' },
      { k: 'Transfer', v: 'bez limitu' },
      { k: 'Strony, domeny, skrzynki, bazy', v: 'bez limitu liczbowego' },
    ],
  },
  {
    title: 'Serwer i języki',
    rows: [
      { k: 'Panel', v: 'panel Verris po polsku' },
      { k: 'Serwer WWW', v: 'LiteSpeed Enterprise', po: true },
      { k: 'PHP', v: '7.4, 8.0, 8.1, 8.2, 8.3 — osobno dla każdej domeny' },
      { k: 'WordPress', v: 'instalacja jednym kliknięciem, kopia testowa (staging)' },
      { k: 'Node.js i Python', v: 'aplikacje uruchamiane z panelu', po: true },
      { k: 'SSH i Git', v: 'izolowane środowisko, wdrożenia z repozytorium', po: true },
      { k: 'Cron', v: 'harmonogram zadań w panelu' },
    ],
  },
  {
    title: 'Bazy danych i cache',
    rows: [
      { k: 'MariaDB', v: 'phpMyAdmin z automatycznym logowaniem, zdalny dostęp' },
      { k: 'PostgreSQL', v: 'PostgreSQL 16, do 5 baz na konto', po: true },
      { k: 'Redis i Memcached', v: 'osobna instancja dla konta', po: true },
    ],
  },
  {
    title: 'Bezpieczeństwo',
    rows: [
      { k: 'Izolacja kont', v: 'własne limity i osobny system plików', po: true },
      { k: 'Skaner złośliwego oprogramowania', v: 'ImunifyAV — w tle i na żądanie', po: true },
      { k: 'Zapora aplikacji (WAF)', v: 'ModSecurity z regułami OWASP CRS', po: true },
      { k: 'SSL', v: "Let's Encrypt, także wildcard; własny certyfikat" },
      { k: 'Konto', v: 'logowanie dwuskładnikowe, passkeys, subkonta, tokeny API' },
    ],
  },
  {
    title: 'Poczta',
    rows: [
      { k: 'Skrzynki', v: 'domyślnie 1 GB, do 100 GB na skrzynkę' },
      { k: 'Webmail', v: 'z automatycznym logowaniem z panelu' },
      { k: 'Wysyłka', v: 'do 1000 wiadomości na dobę z konta' },
      { k: 'Uwierzytelnianie', v: 'SPF, DKIM, DMARC', po: true },
      { k: 'Kalendarz i kontakty', v: 'CalDAV i CardDAV', po: true },
    ],
  },
  {
    title: 'Kopie i gwarancje',
    rows: [
      { k: 'Kopia na serwerze', v: 'codziennie, 7 ostatnich' },
      { k: 'Kopia poza serwerem', v: 'szyfrowana, z każdego z ostatnich 30 dni' },
      { k: 'SLA', v: '99,5% w miesiącu, rekompensata na wniosek' },
      { k: 'Centrum danych', v: 'Niemcy lub Finlandia (EOG)' },
    ],
  },
];
const GRUPY: SpecGroup[] = SPEC.map((g) => ({ title: g.title, rows: zweryfikowane(g.rows).map((r): [string, string] => [r.k, r.v]) }));

export default function HostingPage() {
  return (
    <main>
      <JsonLd
        data={serviceSchema({
          name: 'Hosting z autoskalowaniem',
          description:
            'Hosting współdzielony z autoskalowaniem CPU/RAM/dysku. Baza 50 GB NVMe, do 8 GB RAM, do 2 vCPU; skalowanie do 1000 GB, 64 GB RAM, 24 vCPU. Migracja i SSL za 0 zł.',
          path: '/hosting',
          offers: HOSTING_OFFERS,
        })}
      />

      <section className="hero2 hero2-sub">
        <div className="bg-pat" aria-hidden="true" />
        <div className="wrap hero2-grid">
          <div>
            <Breadcrumbs items={[{ label: 'Hosting' }]} />
            <h1>Hosting stron, który sam dopasowuje moc do ruchu</h1>
            <p className="lead">
              Jeden pakiet zamiast tabeli dziesięciu wariantów. Baza w abonamencie, autoskalowanie w piku, jawne stawki
              za nadwyżkę i limit kosztów, który ustawiasz sam.
            </p>
            <div className="hero2-cta">
              <Button href={PANEL} cta="subhero" conv="checkout_intent" plan="hosting">
                Zamów — 449 zł/rok
              </Button>
              <Button href="#kalkulator" variant="ghost" cta="subhero-kalkulator">
                Policz dopłatę za pik
              </Button>
            </div>
          </div>
          <Card className="incl">
            <h2 className="incl-h">W abonamencie</h2>
            <dl>
              <div>
                <dt>Dysk NVMe</dt>
                <dd>50 GB</dd>
              </div>
              <div>
                <dt>RAM</dt>
                <dd>do 8 GB</dd>
              </div>
              <div>
                <dt>Procesor</dt>
                <dd>do 2 vCPU</dd>
              </div>
              <div>
                <dt>Strony, skrzynki, transfer</dt>
                <dd>bez limitu</dd>
              </div>
            </dl>
            <h2 className="incl-h">W piku, automatycznie</h2>
            <p className="incl-peak">do 24 vCPU · 64 GB RAM · 1000 GB</p>
          </Card>
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Autoskalowanie krok po kroku" title="Jak to działa?" />
          <Steps items={OS} variant="os" />
          <div className="grid3">
            {ZASADY.map(([t, p]) => (
              <Card key={t}>
                <h3>{t}</h3>
                <p>{p}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="kalkulator">
        <div className="wrap split">
          <SectionHead
            eyebrow="Kalkulator"
            title="Ile kosztuje pik?"
            lead="Przesuń suwaki — liczymy według stawek z cennika. Baza (do 2 vCPU i do 8 GB RAM) jest zawsze w abonamencie."
          />
          <KalkulatorPiku />
        </div>
      </section>

      <section className="sec">
        <div className="wrap">
          <SectionHead eyebrow="Korzyści" title="Co zyskujesz?" />
          <div className="grid3">
            {ZYSKI.map((z) => (
              <Card key={z.t}>
                <h3>{z.t}</h3>
                <p>{z.p}</p>
                {z.link && <Link href={z.link[1]}>{z.link[0]} →</Link>}
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="sec sec-alt" id="spec">
        <div className="wrap">
          <SectionHead eyebrow="Specyfikacja techniczna" title="Wszystkie parametry w jednym miejscu" />
          <SpecTable groups={GRUPY} />
        </div>
      </section>

      <CTABand
        title="45 zł/mies albo 449 zł/rok. Bez gwiazdek."
        text="Migracja w cenie. Odnowienie po tej samej cenie."
        secondary={{ label: 'Jak działa migracja', href: '/przenies-strone' }}
      />
      <StickyBuy />
    </main>
  );
}

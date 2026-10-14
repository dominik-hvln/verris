import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SPEC_PO_WERYFIKACJI, SPECYFIKACJA_OPUBLIKOWANA } from '@/lib/oferta';
import { HOSTING_OFFERS, productSpecSchema } from '@/lib/schema';
import { ZAMOW } from '@/lib/site';
import { CTABand, JsonLd, SectionHead, SubHero } from '../components/ui';

export const metadata: Metadata = {
  title: 'Parametry hostingu: zasoby, PHP, kopie, SLA | Verris',
  description:
    'Specyfikacja hostingu Verris: 50 GB NVMe, do 8 GB RAM, autoskalowanie do 24 vCPU, LiteSpeed, PHP 7.4–8.3, kopie z 30 dni i SLA 99,5%. 45 zł/mies.',
  alternates: { canonical: '/specyfikacja' },
};

/**
 * PB-07 — publiczna specyfikacja pakietu, układ z makiety 14.10 (Specyfikacja.dc.html). Każdy wiersz ma pokrycie
 * w macierzy audytu (audyt/dane/macierz.csv). Wiersze `poWeryfikacji` pokazujemy tylko przy SPEC_PO_WERYFIKACJI
 * (lib/oferta.ts). Lokalizacji centrów danych nie podajemy (brief 14.10: „dane w UE”).
 */

type Wiersz = [parametr: string, wartosc: string, poWeryfikacji?: boolean];

const SEKCJE: { tytul: string; id: string; wiersze: Wiersz[] }[] = [
  {
    tytul: 'Zasoby',
    id: 'zasoby',
    wiersze: [
      ['Dysk na start', '50 GB NVMe'],
      ['Pamięć RAM na start', 'do 8 GB'],
      ['Procesor na start', 'do 2 vCPU'],
      ['Autoskalowanie', 'w szczycie do 24 vCPU, 64 GB RAM i 1000 GB dysku, potem powrót do pakietu'],
      ['Stawki autoskalowania (brutto)', '0,001323 zł za 1% CPU/h · 0,0882 zł za 1 GB RAM/h · 0,0008 zł za 1 GB dysku/h, naliczane w blokach 15 minut'],
      ['Limit kosztu autoskalowania', 'ustawiasz sam w panelu'],
      ['Transfer', 'bez limitu'],
      ['Strony, domeny, skrzynki, bazy, konta FTP', 'bez limitu liczbowego — ograniczają je tylko zasoby konta'],
    ],
  },
  {
    tytul: 'Oprogramowanie serwera',
    id: 'oprogramowanie',
    wiersze: [
      ['Panel', 'panel Verris po polsku'],
      ['Serwer WWW', 'LiteSpeed Enterprise', true],
      ['Izolacja kont', 'własne limity CPU, RAM i procesów oraz osobny system plików dla każdego konta', true],
      ['PHP', '7.4, 8.0, 8.1, 8.2, 8.3 — wersja osobno dla każdej domeny'],
      ['PHP w podkatalogu', 'inna wersja dla wybranego katalogu strony', true],
      ['Rozszerzenia PHP i php.ini', 'przełączniki w panelu', true],
      ['MariaDB', 'bazy MySQL/MariaDB, phpMyAdmin z automatycznym logowaniem, zdalny dostęp'],
      ['PostgreSQL', 'PostgreSQL 16, do 5 baz na konto', true],
      ['Redis i Memcached', 'osobna instancja dla konta, dostęp tylko przez gniazdo UNIX', true],
      ['Node.js i Python', 'aplikacje uruchamiane z panelu', true],
      ['WordPress', 'instalacja jednym kliknięciem, kopia testowa (staging)'],
      ['Cron', 'zadania harmonogramu w panelu'],
      ['FTP', 'konta FTP'],
      ['FTPS', 'wymuszone szyfrowanie połączeń FTP', true],
      ['SSH i Git', 'SSH w izolowanym środowisku, wdrożenia z repozytorium Git', true],
      ['Optymalizacja obrazów', 'bezstratna kompresja JPG i PNG z panelu', true],
    ],
  },
  {
    tytul: 'Bezpieczeństwo',
    id: 'bezpieczenstwo',
    wiersze: [
      ['Zapora aplikacji (WAF)', 'ModSecurity z regułami OWASP CRS', true],
      ['Skaner złośliwego oprogramowania', 'ImunifyAV — skan w tle i na żądanie', true],
      ['Ochrona DDoS', 'filtrowanie L3/L4 w sieci centrum danych i limity połączeń na serwerze WWW', true],
      ['Bezpieczeństwo konta', 'logowanie dwuskładnikowe, klucze dostępu (passkeys), subkonta z uprawnieniami, tokeny API'],
    ],
  },
  {
    tytul: 'Domeny, SSL i poczta',
    id: 'domeny-poczta',
    wiersze: [
      ['SSL', "Let's Encrypt, także wildcard, odnawiany automatycznie; możliwość wgrania własnego certyfikatu"],
      ['DNS', 'własne serwery nazw Verris albo zewnętrzny DNS'],
      ['DNSSEC', 'podpisywanie strefy', true],
      ['Webmail', 'z automatycznym logowaniem z panelu'],
      ['Skrzynki', 'domyślnie 1 GB, do 100 GB na skrzynkę'],
      ['Wysyłka', 'do 1000 wiadomości na dobę z konta'],
      ['Funkcje poczty', 'przekierowania, autoresponder, catch-all, filtr SpamAssassin, sprawdzanie list RBL'],
      ['SPF, DKIM, DMARC', 'rekordy uwierzytelniania poczty', true],
      ['Kalendarz i kontakty', 'CalDAV i CardDAV dla każdej skrzynki', true],
    ],
  },
  {
    tytul: 'Kopie i gwarancje',
    id: 'kopie-gwarancje',
    wiersze: [
      ['Kopia na serwerze', 'codziennie, 7 ostatnich kopii'],
      ['Samodzielne przywracanie', 'pliki, bazy danych i poczta — z panelu, bez zgłoszenia'],
      ['Kopia poza serwerem', 'szyfrowana, z każdego z ostatnich 30 dni', true],
      ['Kopia bezpieczeństwa przed przywróceniem', 'domyślnie włączona', true],
      ['Dane', 'w Unii Europejskiej (EOG)'],
      ['SLA', 'dostępność 99,5% w miesiącu kalendarzowym'],
      ['Rekompensata', 'na wniosek: 5% opłaty poniżej 99,5%, 25% poniżej 99%, 50% poniżej 95%, 100% poniżej 90%'],
      ['Monitoring', 'wykresy CPU, RAM i I/O, powiadomienia, publiczna strona statusu'],
      ['Migracja', 'przeniesienie strony, baz i poczty w cenie'],
    ],
  },
];

export default function Page() {
  if (!SPECYFIKACJA_OPUBLIKOWANA) notFound();
  const sekcje = SEKCJE.map((s) => ({ ...s, wiersze: s.wiersze.filter(([, , po]) => SPEC_PO_WERYFIKACJI || !po) }));
  return (
    <main>
      <JsonLd
        data={productSpecSchema({
          name: 'Hosting Verris z autoskalowaniem',
          description:
            'Jeden pakiet hostingu: 50 GB NVMe, do 8 GB RAM i do 2 vCPU, autoskalowanie do 24 vCPU, 64 GB RAM i 1000 GB dysku.',
          path: '/specyfikacja',
          properties: sekcje.flatMap((s) => s.wiersze.map(([k, v]): [string, string] => [k, v])),
          offers: HOSTING_OFFERS,
        })}
      />
      <SubHero
        eyebrow="Specyfikacja"
        title="Wszystkie parametry. Bez gwiazdek i drobnego druku"
        lead="Jeden pakiet, jedna specyfikacja. Jeśli czegoś tu nie ma, napisz — odpowiemy wprost, czy to mamy."
        crumbs={[{ label: 'Specyfikacja' }]}
        primary={{ label: 'Zamów hosting', href: ZAMOW, conv: 'checkout_intent', plan: 'hosting' }}
        secondary={{ label: 'Porównaj z cennikiem', href: '/cennik' }}
      />
      {sekcje.map((s, i) => (
        <section className={`sec${i % 2 ? ' sec-alt' : ''}`} key={s.id} aria-labelledby={`sp-${s.id}`}>
          <div className="wrap c-narrow">
            <SectionHead id={`sp-${s.id}`} title={s.tytul} />
            <div className="c-tablewrap">
              <table className="c-spec">
                <thead>
                  <tr>
                    <th scope="col">Parametr</th>
                    <th scope="col">Wartość</th>
                  </tr>
                </thead>
                <tbody>
                  {s.wiersze.map(([p, w]) => (
                    <tr key={p}>
                      <th scope="row">{p}</th>
                      <td>{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}
      <CTABand
        title="Parametry się zgadzają? Zacznij od przeprowadzki"
        text="45 zł/mies albo 449 zł/rok brutto, ta sama cena przy odnowieniu. Przeniesienie strony robimy za Ciebie."
        primaryHref={ZAMOW}
        secondary={{ label: 'Wszystkie funkcje', href: '/funkcje' }}
      />
    </main>
  );
}

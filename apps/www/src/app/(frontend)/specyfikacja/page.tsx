import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SPECYFIKACJA_OPUBLIKOWANA } from '@/lib/oferta';
import { SubHero, CTABand } from '../components/ui';
import { RevealInit } from '../components/RevealInit';

export const metadata: Metadata = {
  title: 'Specyfikacja techniczna hostingu | Verris',
  description:
    'Pełna specyfikacja pakietu hostingu Verris: zasoby i autoskalowanie, oprogramowanie serwera, poczta, kopie zapasowe, infrastruktura i SLA — bez gwiazdek.',
  alternates: { canonical: '/specyfikacja' },
};

/**
 * PB-07 — publiczna specyfikacja pakietu. Każdy wiersz ma pokrycie w macierzy audytu (audyt/dane/macierz.csv).
 * Wiersze `poWeryfikacji` są zrobione w kodzie, ale czekają na sprawdzenie na pierwszym węźle (wezel.csv) —
 * pokazujemy je dopiero, gdy przełączymy SPEC_PO_WERYFIKACJI na true (decyzja właściciela po D3).
 */
const SPEC_PO_WERYFIKACJI = false;

type Wiersz = [parametr: string, wartosc: string, poWeryfikacji?: boolean];

const SEKCJE: { tytul: string; wiersze: Wiersz[] }[] = [
  {
    tytul: 'Zasoby',
    wiersze: [
      ['Dysk', '50 GB'],
      ['Pamięć RAM', 'do 8 GB'],
      ['Procesor', 'do 2 vCPU'],
      ['Autoskalowanie', 'do 24 vCPU, 64 GB RAM i 1000 GB dysku — zasoby rosną w piku i wracają do bazy po nim'],
      ['Stawki autoskalowania (brutto)', '0,001323 zł za 1% CPU/h · 0,0882 zł za 1 GB RAM/h · 0,0008 zł za 1 GB dysku/h, naliczane w blokach 15 minut'],
      ['Limit kosztu autoskalowania', 'ustawiasz sam w panelu'],
      ['Transfer', 'bez limitu'],
      ['Strony, domeny, skrzynki, bazy, konta FTP', 'bez limitu liczbowego — ograniczają je tylko zasoby konta'],
    ],
  },
  {
    tytul: 'Oprogramowanie serwera',
    wiersze: [
      ['Panel', 'panel Verris po polsku'],
      ['System', 'CloudLinux — izolacja kont (LVE, CageFS)', true],
      ['Serwer WWW', 'LiteSpeed Enterprise', true],
      ['PHP', '7.4, 8.0, 8.1, 8.2, 8.3 — wersja osobno dla każdej domeny'],
      ['PHP w podkatalogu', 'inna wersja dla wybranego katalogu strony', true],
      ['Rozszerzenia PHP i php.ini', 'przełączniki w panelu', true],
      ['MariaDB', 'bazy MySQL/MariaDB, phpMyAdmin z automatycznym logowaniem, zdalny dostęp'],
      ['PostgreSQL', 'PostgreSQL 16, do 5 baz na konto', true],
      ['Redis i Memcached', 'osobna instancja dla konta, dostęp tylko przez gniazdo UNIX', true],
      ['Node.js i Python', 'aplikacje przez CloudLinux Selector', true],
      ['WordPress', 'instalacja jednym kliknięciem, kopia testowa (staging)'],
      ['Cron', 'zadania harmonogramu w panelu'],
      ['FTP', 'konta FTP'],
      ['FTPS', 'wymuszone szyfrowanie połączeń FTP', true],
      ['SSH i Git', 'SSH w izolowanym środowisku, wdrożenia z repozytorium Git', true],
      ['Zapora aplikacji (WAF)', 'ModSecurity z regułami OWASP CRS', true],
      ['Skaner złośliwego oprogramowania', 'ImunifyAV — skan w tle i na żądanie', true],
      ['Optymalizacja obrazów', 'bezstratna kompresja JPG i PNG z panelu', true],
    ],
  },
  {
    tytul: 'Domeny, SSL i DNS',
    wiersze: [
      ['SSL', "Let's Encrypt, także wildcard, odnawiany automatycznie; możliwość wgrania własnego certyfikatu"],
      ['DNS', 'własne serwery nazw Verris albo zewnętrzny DNS'],
      ['DNSSEC', 'podpisywanie strefy', true],
    ],
  },
  {
    tytul: 'Poczta',
    wiersze: [
      ['Webmail', 'z automatycznym logowaniem z panelu'],
      ['Skrzynki', 'domyślnie 1 GB, do 100 GB na skrzynkę'],
      ['Wysyłka', 'do 1000 wiadomości na dobę z konta'],
      ['Funkcje', 'przekierowania, autoresponder, catch-all, filtr SpamAssassin, sprawdzanie list RBL'],
      ['SPF, DKIM, DMARC', 'rekordy uwierzytelniania poczty', true],
      ['Kalendarz i kontakty', 'CalDAV i CardDAV dla każdej skrzynki', true],
    ],
  },
  {
    tytul: 'Kopie zapasowe',
    wiersze: [
      ['Kopia na serwerze', 'codziennie, 7 ostatnich kopii'],
      ['Samodzielne przywracanie', 'pliki, bazy danych i poczta — z panelu, bez zgłoszenia'],
      ['Kopia poza serwerem', 'szyfrowana, z każdego z ostatnich 30 dni', true],
      ['Kopia bezpieczeństwa przed przywróceniem', 'domyślnie włączona', true],
    ],
  },
  {
    tytul: 'Infrastruktura i gwarancje',
    wiersze: [
      ['Centrum danych', 'Hetzner, Niemcy lub Finlandia (EOG) — region serwera widzisz w panelu'],
      ['Ochrona DDoS', 'filtrowanie L3/L4 w sieci centrum danych i limity połączeń na serwerze WWW', true],
      ['SLA', 'dostępność 99,5% w miesiącu kalendarzowym'],
      ['Rekompensata', 'automatyczna: 5% opłaty poniżej 99,5%, 25% poniżej 99%, 50% poniżej 95%, 100% poniżej 90%'],
      ['Monitoring', 'wykresy CPU, RAM i I/O, powiadomienia, publiczna strona statusu'],
      ['Bezpieczeństwo konta', 'logowanie dwuskładnikowe, klucze dostępu (passkeys), subkonta z uprawnieniami, tokeny API'],
      ['Migracja', 'przeniesienie strony, baz i poczty w cenie'],
    ],
  },
];

export default function Page() {
  if (!SPECYFIKACJA_OPUBLIKOWANA) notFound();
  return (
    <main>
      <SubHero
        eyebrow="Specyfikacja"
        title="Co dokładnie dostajesz"
        lead="Pełna specyfikacja pakietu hostingu — jeden pakiet, bez wariantów i bez gwiazdek."
        crumbs={[{ label: 'Specyfikacja' }]}
      />
      {SEKCJE.map((s) => {
        const wiersze = s.wiersze.filter(([, , po]) => SPEC_PO_WERYFIKACJI || !po);
        return (
          <section className="band" key={s.tytul}>
            <div className="wrap">
              <h2 className="rv">{s.tytul}</h2>
              <table className="cmp rv">
                <tbody>
                  {wiersze.map(([p, w]) => (
                    <tr key={p}>
                      <th scope="row">{p}</th>
                      <td className="vr">{w}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <CTABand
        title="Sprawdź w praktyce"
        text="Załóż konto i przenieś stronę za darmo — resztą przeprowadzki zajmiemy się my."
        secondary={{ label: 'Cennik', href: '/cennik' }}
      />
      <RevealInit />
    </main>
  );
}

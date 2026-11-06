import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RETENCJA_LEADOW_DNI } from '../leads/leads-retencja.js';

/**
 * Paczka 109 — dokumenty prawne (`docs/legal/drafts`) zgodne z decyzjami Dominika z 3.11.2026 i z kodem.
 * Paczka 110 — numer 1.2.0: na produkcji od 6.10.2026 obowiązuje 1.1.0 (szkic z commita 49938cc0), a skrypt publikacji
 * odmawia nadpisania opublikowanej wersji inną treścią. Numer w treści musi być równy numerowi w zgodach.
 * Publikuje je `ops/scripts/prod-legal-publish-live.sh` (podstawia `[DATA PUBLIKACJI]`, blokuje `[UZUPEŁNIĆ…]`).
 * Na szkicach sprzed paczki test pada: telefon w danych sprzedawcy, „miesięczny limit” autoskalowania, polityka
 * cookies z nieistniejącymi `refresh_token`/`csrf_token`, brak opisu Consent Mode i formularzy www.
 * Decyzje z 4.11.2026: 19 — publikacja od razu (bez 30 dni), 20 — telefon tylko w dokumentach, 21 — oświadczenie
 * domenowe przy każdym zamówieniu, 22 — Consent Mode v2 w trybie podstawowym.
 */
const KORZEN = join(__dirname, '../../../..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const DOKUMENTY = ['terms', 'privacy', 'cookies', 'dpa'] as const;
const tresc = Object.fromEntries(DOKUMENTY.map((d) => [d, czytaj(`docs/legal/drafts/${d}.md`)])) as Record<(typeof DOKUMENTY)[number], string>;
const konsument = czytaj('docs/legal/consumer-info.md');
const zmiany = czytaj('docs/legal/drafts/ZMIANY_1.1.0-1.2.0.md');
const TELEFON = '+48 511 589 465';

function zrodla(dir: string): string {
  let wynik = '';
  const przejdz = (d: string) => {
    for (const n of readdirSync(d)) {
      if (n === 'node_modules' || n.startsWith('.')) continue;
      const p = join(d, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (/\.(ts|tsx)$/.test(n) && !/\.spec\.tsx?$/.test(n)) wynik += readFileSync(p, 'utf8');
    }
  };
  przejdz(join(KORZEN, dir));
  return wynik;
}

describe('Dokumenty prawne 1.2.0 – gotowe do jednej publikacji', () => {
  it.each(DOKUMENTY)('%s: wersja 1.2.0 z datą do podstawienia, bez miejsc do uzupełnienia i notatek roboczych', (d) => {
    const t = tresc[d];
    expect(t).toContain('**Wersja 1.2.1 · obowiązuje od [DATA PUBLIKACJI]**');
    expect(t).toContain('**Wersja 1.2.1 – data publikacji i wejścia w życie: [DATA PUBLIKACJI]**');
    // 1.2.0 jest opublikowana na produkcji (6.11.2026) — tego numeru nie wolno użyć ponownie z inną treścią.
    expect(t).not.toMatch(/\*\*Wersja 1\.2\.0/);
    // 1.1.0 jest opublikowana na produkcji (6.10.2026) — ten numer nie może wrócić w nagłówku ani stopce.
    expect(t).not.toMatch(/\*\*Wersja 1\.1\.0/);
    expect(t).not.toMatch(/\[(UZUPEŁNIĆ|TODO|DO UZUPEŁNIENIA)/i);
    // Komentarze HTML i notatki robocze panel pokazałby klientom dosłownie (renderer escapuje HTML).
    expect(t).not.toMatch(/<!--|DO SPRAWDZENIA/);
  });

  it('dane sprzedawcy wg decyzji 10 i 20: pełny adres, NIP, REGON, e-mail i telefon w dokumentach', () => {
    for (const t of [tresc.terms, tresc.privacy, konsument]) {
      expect(t).toContain('HVLN Dominik Kowalski');
      expect(t).toContain('Zacisze 2A, 65-775 Zielona Góra');
      expect(t).toContain('NIP 9292069367');
      expect(t).toContain('REGON 521024260');
      expect(t).toContain('kontakt@verris.pl');
      expect(t).toContain(TELEFON);
    }
    // Regulamin: w definicji Usługodawcy (§1 ust. 1) i w kontakcie (§2 ust. 3).
    expect(tresc.terms).toMatch(/1\. \*\*Usługodawca \/ Verris\*\*[^\n]*telefon: \+48 511 589 465/);
    expect(tresc.terms).toMatch(/3\. Kontakt z Verris:[^\n]*telefon \+48 511 589 465/);
  });

  it('decyzja 20: numer telefonu tylko w dokumentach – verris.pl i panel klienta go nie pokazują', () => {
    const kod = zrodla('apps/www/src') + zrodla('apps/client-panel/src');
    expect(kod).not.toMatch(/511[\s-]?589[\s-]?465|48511589465/);
  });

  it('decyzja 19: publikacja od razu, bez 30-dniowego zawiadomienia, z uzasadnieniem w części C', () => {
    expect(zmiany).toContain('**Publikacja od razu, bez 30 dni**');
    expect(zmiany).not.toMatch(/z datą wejścia ≥ 30 dni|\[DATA WEJŚCIA W ŻYCIE\]/);
    const czescC = zmiany.slice(zmiany.indexOf('## C. DO SPRAWDZENIA'));
    expect(czescC).toMatch(/1\. \*\*Publikacja od razu, bez 30 dni \(decyzja 19[^\n]*uzasadnienie/);
  });

  it('decyzja 21: oświadczenie domenowe przy każdym zamówieniu, bez zgody „na stałe” na kolejne rejestracje', () => {
    const par12 = tresc.terms.slice(tresc.terms.indexOf('## §12.'), tresc.terms.indexOf('## §13.'));
    expect(par12).toMatch(/8\. [^\n]*przy każdym zamówieniu rejestracji albo transferu Domeny/);
    expect(par12).toContain('Oświadczenie dotyczy wyłącznie zamówienia, przy którym zostało złożone');
    for (const t of [tresc.terms, konsument]) {
      expect(t).not.toMatch(/kolejn\w+ rejestracj\w+ (Domen|domen)|zachowuje skuteczność również|przypomni\w* o (obowiązującym|nim)/);
    }
    expect(konsument).toMatch(/Przy każdym zamówieniu rejestracji albo transferu domeny/);
  });

  it('Regulamin: SLA automatycznie, kredyty na autoskalowanie na start, kredyty z kodu bez faktury, limit autoskalowania na 30 dni, zwrot salda', () => {
    const t = tresc.terms;
    expect(t).toContain('**automatycznie, bez wniosku Klienta**');
    // Decyzja 6.11.2026 — kredyty na autoskalowanie zamiast rabatu na start (§9 ust. 6), spójnie z kodem i consumer-info.
    expect(t).toMatch(/6\. Kredyty na autoskalowanie na start:[^\n]*60 zł przy okresie rocznym albo 10 zł przy okresie miesięcznym[^\n]*ważne 12 miesięcy[^\n]*wyłącznie do pokrycia opłat za autoskalowanie[^\n]*nie wystawia się za nie faktury[^\n]*zwrotowi/);
    expect(t).toMatch(/kredyty na autoskalowanie z §9 ust\. 6\) – mają one charakter rabatu/);
    for (const d of [t, konsument]) expect(d).not.toMatch(/Rabat na start|rabat na start|−15%|15% za pierwszy rok/);
    expect(konsument).toMatch(/darmowe kredyty na autoskalowanie \(na dzień publikacji: 60 zł przy okresie rocznym albo 10 zł przy miesięcznym\)/);
    expect(t).toMatch(/kodu promocyjnego[^\n]*nie są zakupem – nie wystawia się za nie faktury/);
    expect(t).not.toMatch(/miesięczny limit/i);
    expect(t).toMatch(/Domyślnie autoskalowanie nie ma limitu kosztu[^\n]*sumy dopłat z ostatnich 30 dni/);
    expect(t).toMatch(/numer rachunku bankowego; Verris dokonuje zwrotu przelewem w terminie 14 dni/);
    expect(t).toMatch(/Wyłącznie Klient \(właściciel Konta\), a nie Subkonto, może: anulować lub usunąć Usługę, wyłączyć automatyczne odnowienie/);
    expect(t).toContain('## §8a. Program lojalnościowy EKO');
    expect(t).not.toMatch(/CloudLinux|LVE|DirectAdmin|\bIAM\b/);
  });

  it('Polityka prywatności: okresy dla formularzy verris.pl takie jak w retencji API (leads-retencja.ts)', () => {
    const t = tresc.privacy;
    expect(RETENCJA_LEADOW_DNI.KONTAKT).toBe(365);
    expect(t).toMatch(/formularza kontaktowego[^\n]*\| 12 miesięcy od wysłania \|/);
    expect(t).toContain(`| ${RETENCJA_LEADOW_DNI.TELEFON} dni od wysłania |`);
    expect(t).toContain(`| ${RETENCJA_LEADOW_DNI.PLAN_BEZ_ZGODY} dni od wysłania, jeśli nie zaznaczysz zgody na wiadomości |`);
    expect(t).toContain(`niepotwierdzona zgoda – ${RETENCJA_LEADOW_DNI.ZGODA_NIEPOTWIERDZONA} dni`);
    expect(t).toContain(`najdłużej ${RETENCJA_LEADOW_DNI.ZGODA_POTWIERDZONA / 365 * 12} miesiące od potwierdzenia`);
    expect(t).toContain(`po wypisie ślad wycofania ${RETENCJA_LEADOW_DNI.PO_WYPISIE} dni`);
    expect(t).toMatch(/Plan wysyłamy mailem każdemu, kto o niego prosi – bez warunku zgody marketingowej/);
    for (const punkt of ['### 2.8 Asystent AI na verris.pl', '### 2.9 Formularze na verris.pl', '### 2.10 Zgłoszenie do testów', '### 2.11 Program EKO']) {
      expect(t).toContain(punkt);
    }
  });

  it('Polityka cookies: każdy wymieniony klucz istnieje w kodzie panelu albo verris.pl, a nieistniejących już nie ma', () => {
    const kod = zrodla('apps/client-panel/src') + zrodla('apps/www/src');
    const t = tresc.cookies;
    const sekcja = t.slice(t.indexOf('## 2. Cookies niezbędne'), t.indexOf('### 2.3'));
    const klucze = [...sekcja.matchAll(/^\| `([^`]+)`(?:, `([^`]+)`)? \|/gm)].flatMap((m) => [m[1], m[2]]).filter(Boolean) as string[];
    expect(klucze.length).toBeGreaterThanOrEqual(12);
    const brak = klucze.map((k) => k.replace(/…$/, '')).filter((k) => !kod.includes(k));
    expect(brak).toEqual([]);
    for (const stary of ['refresh_token', 'csrf_token', 'panel-locale', 'panel-theme', 'dashboard-layout', 'support-draft']) {
      expect(t).not.toContain(`\`${stary}\``);
    }
  });

  it('Consent Mode v2 w trybie podstawowym (decyzja 22) opisany tak, jak działa www i panel', () => {
    const analityka = czytaj('apps/www/src/app/(frontend)/components/Analytics.tsx');
    const t = tresc.cookies;
    expect(t).toContain('## 4. Google Consent Mode v2 – tryb podstawowy');
    expect(t).toMatch(/nie ładujemy\*\* Menedżera tagów Google[^\n]*ani Meta Pixel/);
    expect(tresc.privacy).toContain('**Google Consent Mode v2 w trybie podstawowym.**');
    for (const tekst of [...Object.values(tresc), zmiany, czytaj('docs/legal/drafts/subprocessors.md')]) {
      expect(tekst).not.toMatch(/tryb(ie)? zaawansowan|ładują się także przed Twoją decyzją/);
    }
    for (const ustawienie of ['url_passthrough', 'ads_data_redaction']) {
      expect(t.includes(ustawienie)).toBe(analityka.includes(`'${ustawienie}'`));
    }
    // Kod: GTM nie jest ładowany przez komponent Analytics ani przez <noscript> w layoucie — tylko po zgodzie.
    expect(analityka).not.toContain('googletagmanager.com/gtm.js');
    expect(czytaj('apps/www/src/app/(frontend)/layout.tsx')).not.toContain('googletagmanager.com/ns.html');
    expect(czytaj('apps/client-panel/src/components/analytics-scripts.tsx')).not.toContain('googletagmanager.com/gtm.js');
  });

  it('DPA: statystyki odwiedzin w powierzeniu i egzemplarz w „Prywatność i dane” (nie w nieistniejącej sekcji „Zgodność”)', () => {
    expect(tresc.dpa).toMatch(/statystyki odwiedzin[^\n]*sól|solą zmienianą co dobę/);
    expect(tresc.dpa).toContain('Ustawienia → Prywatność i dane');
    for (const d of DOKUMENTY) expect(tresc[d]).not.toContain('sekcja Zgodność');
  });

  it('dokumenty zwracają się do klienta neutralnie (bez „wyraziłeś”, „korzystałeś”)', () => {
    for (const d of DOKUMENTY) expect(tresc[d].match(/[\p{L}]+łeś(?![\p{L}])/gu) ?? []).toEqual([]);
  });

  it('1.2.0 zastępuje opublikowaną 1.1.0, a instrukcja publikuje 1.2.0 i sprawdza akceptacje wszystkich wersji', () => {
    for (const d of ['terms', 'privacy'] as const) {
      expect(tresc[d]).toContain('Wersja 1.2.1 zastępuje wersję 1.2.0 z 6 listopada 2026 r.');
    }
    expect(konsument).toContain('(razem z Regulaminem 1.2.1)');
    expect(zmiany).toContain('LEGAL_LIVE_VERSION=1.2.1');
    expect(zmiany).toContain('LEGAL_LIVE_VERSION=1.2.0');
    expect(zmiany).not.toContain('LEGAL_LIVE_VERSION=1.1.0');
    expect(zmiany).not.toMatch(/"documentVersion" LIKE '1\.0\.%'/);
  });
});

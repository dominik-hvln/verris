import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DOKUMENT_Z_KREATOREM_MARKI } from '../kreator-marki/kreator-marki.admin.controller.js';
import { blokadaPliku, type OpisPliku } from '../kreator-marki/dane-marki.js';
import { BRAK_ZGODY, POWOD_PROBA_ZAKUP } from '../kreator-marki/zakup-marki.js';

/**
 * Dokumenty prawne 1.4.0 (19.11.2026) – Kreator marki, Pakiet marki i Kolejna marka (Regulamin §1 pkt 6 i 18–24, §10
 * ust. 3, nowy §13b, §21 ust. 5), dane w Kreatorze marki (Polityka pkt 2.13, tabela, Anthropic), dane z wizytówki
 * i stopki w powierzeniu (DPA §2 ust. 6). Rozstrzygnięcia i ryzyka: docs/legal/drafts/ZMIANY_1.3.0-1.4.0.md.
 * Admin włącza moduł dla wszystkich dopiero, gdy obowiązujący Regulamin i Polityka „wymieniają moduł”
 * (DOKUMENT_Z_KREATOREM_MARKI) – test pilnuje, że detektor rozpozna nowe teksty, a komunikaty panelu odsyłają do
 * ustępów §13b o tej treści. Na szkicach 1.3.0 test pada: brak §13b, pkt 2.13, DPA §2 ust. 6 i numeru 1.4.0.
 */
const KORZEN = join(__dirname, '../../../..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const DOKUMENTY = ['terms', 'privacy', 'cookies', 'dpa'] as const;
const tresc = Object.fromEntries(DOKUMENTY.map((d) => [d, czytaj(`docs/legal/drafts/${d}.md`)])) as Record<(typeof DOKUMENTY)[number], string>;
const podprocesorzy = czytaj('docs/legal/drafts/subprocessors.md');
const konsument = czytaj('docs/legal/consumer-info.md');
const zmiany = czytaj('docs/legal/drafts/ZMIANY_1.3.0-1.4.0.md');
const panel = czytaj('apps/client-panel/src/lib/kreator-marki.ts');

/** Paragrafy Regulaminu (`## §N.`, także §13a i §13b) → treść do następnego nagłówka. */
function paragrafy(t: string): Map<string, string> {
  const wynik = new Map<string, string>();
  const czesci = t.split(/^## §(\d+[ab]?)\. /m);
  for (let i = 1; i < czesci.length; i += 2) wynik.set(czesci[i]!, czesci[i + 1]!.split(/\n## /)[0]!);
  return wynik;
}
const ustepy = (tekst: string) => [...tekst.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
const par = paragrafy(tresc.terms);
const p13b = par.get('13b') ?? '';
const ustep = (n: number) => p13b.split('\n').find((l) => l.startsWith(`${n}. `)) ?? '';
/** Stała tekstowa z panelu klienta (apps/client-panel/src/lib/kreator-marki.ts). */
const stala = (nazwa: string) => new RegExp(`export const ${nazwa} =\\s*'([^']+)'`).exec(panel)?.[1] ?? '';

describe('Dokumenty prawne 1.4.0 – Kreator marki', () => {
  it.each(DOKUMENTY)('%s: wersja 1.4.0 z datą do podstawienia, bez pauzy „—” i miejsc do uzupełnienia', (d) => {
    const t = tresc[d];
    expect(t).toContain('**Wersja 1.4.0 · obowiązuje od [DATA PUBLIKACJI]**');
    expect(t).toContain('**Wersja 1.4.0 – data publikacji i wejścia w życie: [DATA PUBLIKACJI]**');
    expect(t).not.toContain('—');
    expect(t).not.toMatch(/\[(UZUPEŁNIĆ|TODO|DO UZUPEŁNIENIA|PRAWNIK|DECYZJA|do weryfikacji)/i);
    expect(t).not.toMatch(/<!--|DO SPRAWDZENIA/);
  });

  it('1.4.0 zastępuje 1.3.0 z 10.11.2026; informacje dla konsumenta i lista podprocesorów w tej samej wersji', () => {
    for (const d of ['terms', 'privacy'] as const) expect(tresc[d]).toContain('> Wersja 1.4.0 zastępuje wersję 1.3.0 z 10 listopada 2026 r.');
    expect(konsument).toContain('**Wersja 1.4.0 · obowiązuje od [DATA PUBLIKACJI]** (razem z Regulaminem 1.4.0)');
    expect(podprocesorzy).toContain('**Wersja 1.4.0 · stan na [DATA PUBLIKACJI]**');
    expect(konsument).toMatch(/3\. \*\*Pakiet marki i kolejna marka\*\*[^\n]*tracisz prawo odstąpienia[^\n]*art\. 38 ust\. 1 pkt 13/);
  });

  it('admin rozpozna Regulamin i Politykę z Kreatorem marki (włącznik „Wszyscy”), a teksty 1.3.0 – nie', () => {
    expect(DOKUMENT_Z_KREATOREM_MARKI.test(tresc.terms)).toBe(true);
    expect(DOKUMENT_Z_KREATOREM_MARKI.test(tresc.privacy)).toBe(true);
    expect(DOKUMENT_Z_KREATOREM_MARKI.test(czytaj('docs/legal/drafts/ZMIANY_1.2.1-1.3.0.md'))).toBe(false);
  });

  it('§1: Usługi z Kreatorem marki, Pakietem marki i Kolejną marką; definicje 18–24; §10 ust. 3', () => {
    expect(tresc.terms).toMatch(/6\. \*\*Usługi\*\*[^\n]*wraz z Verris Kreatorem \(§13a\) i Kreatorem marki \(§13b\)[^\n]*Pakiet marki i Kolejna marka \(§13b\)/);
    const p1 = par.get('1') ?? '';
    expect(ustepy(p1)).toEqual(Array.from({ length: 24 }, (_, i) => i + 1));
    for (const [n, nazwa] of [[18, 'Kreator marki'], [19, 'Logo'], [20, 'Materiały'], [21, 'Biblioteka'], [22, 'Wydany Wariant'], [23, 'Pakiet marki'], [24, 'Kolejna marka']] as const) {
      expect(p1).toContain(`${n}. **${nazwa}** – `);
    }
    expect(p1).toMatch(/22\. \*\*Wydany Wariant\*\*[^\n]*pobrał z Panelu albo którego użył na stronie opublikowanej[^\n]*po opłaceniu Hostingu/);
    expect(par.get('10')).toContain('Verris Kreator (§13a) oraz Kreator marki (§13b)');
  });

  it('§13b stoi między §13a a §14, ma 17 kolejnych ustępów, a każde odesłanie „§N ust. M” w Regulaminie istnieje', () => {
    const kolejnosc = [...par.keys()];
    expect(kolejnosc.indexOf('13b')).toBe(kolejnosc.indexOf('13a') + 1);
    expect(kolejnosc.indexOf('14')).toBe(kolejnosc.indexOf('13b') + 1);
    expect(ustepy(p13b)).toEqual(Array.from({ length: 17 }, (_, i) => i + 1));
    const zle: string[] = [];
    for (const m of tresc.terms.matchAll(/(?<!DPA )§(\d+[ab]?) ust\. (\d+)(?:[–-](\d+))?/g)) {
      const ile = ustepy(par.get(m[1]!) ?? '').length;
      if (Number(m[3] ?? m[2]) > ile) zle.push(m[0]);
    }
    expect(zle).toEqual([]);
    expect(ustepy(par.get('21') ?? '')).toEqual([1, 2, 3, 4, 5, 6]);
    expect(par.get('21')).toMatch(/z zastrzeżeniem ust\. 3–5\./);
  });

  it('licencja niewyłączna (forma pisemna wyklucza przeniesienie praw i licencję wyłączną przez akceptację regulaminu)', () => {
    expect(ustep(4)).toMatch(/licencji niewyłącznej, bez ograniczeń terytorialnych, na czas nieoznaczony/);
    expect(ustep(4)).toMatch(/oznaczenie przedsiębiorstwa, towarów i usług/);
    expect(ustep(4)).toMatch(/zgłoszenie do rejestracji i rejestracja jako znaku towarowego/);
    expect(ustep(4)).toMatch(/opracowań Wydanego Wariantu/);
    expect(ustep(4)).toMatch(/dalszych licencji[^\n]*drukarni, agencji/);
    expect(ustep(5)).toMatch(/zrzeka się prawa do jej wypowiedzenia[^\n]*art\. 68/);
    expect(ustep(5)).toMatch(/nie wykonywać wobec Klienta[^\n]*praw do Biblioteki/);
    expect(ustep(6)).toMatch(/może nie podlegać ochronie prawa autorskiego[^\n]*nie rości sobie żadnych praw/);
    expect(tresc.terms).not.toMatch(/licencji wyłącznej|przenosi na Klienta autorskie prawa majątkowe/);
  });

  it('bez obietnicy unikalności (decyzja 19.11) – w Regulaminie, księdze znaku, CZYTAJ.txt i pomocy', () => {
    expect(ustep(8)).toMatch(/wewnętrzny mechanizm jakości, a nie zobowiązanie Verris/);
    const zrodla = [tresc.terms, tresc.privacy, czytaj('libs/kreator/src/marka/ksiega.ts'), czytaj('apps/api/src/kreator-marki/generator-plikow.ts'), czytaj('apps/api/src/cli/seed-kb-cms.ts')];
    for (const t of zrodla) expect(t).not.toMatch(/nie wydaje tego samego|dwóm firmom|innej firmie w Kreatorze|tylko znaków wydanych w Kreatorze/);
  });

  it('konsument: bez wyłączenia odpowiedzialności za zgodność treści cyfrowej; ograniczenie tylko wobec pozostałych Klientów', () => {
    expect(ustep(10)).toMatch(/nie wyłączają ani nie ograniczają odpowiedzialności Verris wobec Konsumenta i Przedsiębiorcy na prawach Konsumenta, w tym za zgodność treści cyfrowej z umową \(rozdział 5b ustawy o prawach konsumenta\)/);
    expect(ustep(10)).toMatch(/Wobec pozostałych Klientów[^\n]*z wyjątkiem szkód wyrządzonych umyślnie/);
    expect(ustep(12)).toMatch(/Klient niebędący Konsumentem ani Przedsiębiorcą na prawach Konsumenta zwalnia ponadto Verris z roszczeń/);
  });

  it('okres próbny i zakup zgodne z kodem: pliki po opłaceniu Hostingu, zakupy nie w próbie, zgoda wymagana', () => {
    const opis: OpisPliku = { plik: 'logo.svg', grupa: 'logo', opis: '', pakiet: false, druk: false, typ: 'image/svg+xml' };
    expect(blokadaPliku(opis, 'proba', true)).toBe('PROBA');
    expect(blokadaPliku(opis, 'hosting', false)).toBeUndefined();
    expect(ustep(1)).toMatch(/pobranie plików Logo i Materiałów, stopka e-mail i użycie Logo na stronie opublikowanej na domenie są dostępne po opłaceniu Hostingu/);
    expect(POWOD_PROBA_ZAKUP).toMatch(/po opłaceniu hostingu/);
    expect(ustep(3)).toMatch(/wyłącznie przy opłaconym Hostingu \(nie w okresie próbnym\)/);
    expect(ustep(3)).toMatch(/Panel wskazuje przed zakupem \(Cennik, §9\)/);
    // Ceny i limity jak w §13a – „w Panelu przed zakupem”, bez kwot w Regulaminie.
    expect(p13b).not.toMatch(/\d+(,\d+)? zł/);
    expect(BRAK_ZGODY).toMatch(/zgodę na rozpoczęcie dostarczania treści cyfrowej/);
    expect(ustep(13)).toMatch(/Bez tej zgody Panel nie przyjmuje zamówienia/);
    expect(ustep(13)).toMatch(/przesyła e-mailem potwierdzenie zakupu wraz z potwierdzeniem tej zgody/);
    expect(czytaj('apps/api/src/kreator-marki/zakup-marki.ts')).toContain('kreatorMarkiZakupTemplate');
    expect(par.get('21')).toContain('5. Prawo odstąpienia od Umowy w zakresie Pakietu marki i Kolejnej marki wygasa z chwilą ich udostępnienia na Koncie, na zasadach §13b ust. 13');
  });

  it('komunikaty panelu odsyłają do ustępów §13b o tej treści', () => {
    const zgoda = stala('TEKST_ZGODY_TRESCI_CYFROWEJ');
    expect(zgoda).toContain('(Regulamin §13b ust. 13)');
    expect(ustep(13)).toMatch(/^13\. \*\*Prawo odstąpienia\.\*\*[^\n]*art\. 38 ust\. 1 pkt 13/);
    expect(stala('TEKST_ZGODY_TMVIEW')).toContain('(Regulamin §13b ust. 8–10)');
    expect(ustep(8)).toMatch(/^8\. \*\*Podobne znaki\.\*\*/);
    expect(ustep(10)).toMatch(/TMview[^\n]*Panel prosi o potwierdzenie zapoznania się z informacjami z ust\. 8–10/);
    expect(stala('TEKST_OSWIADCZENIA_PRAW')).toContain('(Regulamin §13b ust. 12)');
    expect(ustep(12)).toMatch(/^12\. \*\*Wgrane Logo\.\*\*/);
    expect(stala('OSTRZEZENIE_NAGLOWKA')).toContain('(Regulamin §13b ust. 9–10)');
    expect(ustep(9)).toMatch(/^9\. \*\*Znak towarowy\.\*\*[^\n]*nie jest znakiem zastrzeżonym/);
    const eksport = stala('INFORMACJA_EKSPORTU');
    expect(eksport).toContain('(Regulamin §13b ust. 14)');
    expect(eksport).toContain('(licencja: Regulamin §13b ust. 4–6)');
    expect(ustep(14)).toMatch(/^14\. \*\*Oznaczenie AI\.\*\*[^\n]*metadanych/);
    expect(ustep(15)).toMatch(/SIL Open Font License 1\.1/);
  });

  it('Polityka: pkt 2.13, wiersz tabeli z retencją potwierdzeń; Anthropic z obrazem logo bez nowego podprocesora', () => {
    expect(tresc.privacy).toContain('### 2.13 Kreator marki (logo i materiały)');
    expect(tresc.privacy).toMatch(/obraz tego logo \(podgląd PNG\)/);
    expect(tresc.privacy).toMatch(/Danych z wizytówki i stopki e-mail nie przekazujemy do AI/);
    expect(tresc.privacy).toMatch(/\| Kreator marki: [^\n]*do upływu terminów przedawnienia roszczeń \(co do zasady 6 lat, art\. 118 KC\)/);
    expect(tresc.privacy).toMatch(/\| \*\*Anthropic Ireland, Limited\*\* \|[^\n]*Kreator marki \([^\n]*analiza obrazu wgranego logo\)/);
    expect(podprocesorzy).toMatch(/\| \*\*Anthropic Ireland, Limited\*\* \|[^\n]*obraz wgranego logo/);
    const zal2 = tresc.dpa.slice(tresc.dpa.indexOf('## Załącznik 2'));
    expect(zal2).toMatch(/\| Anthropic Ireland, Limited \|[^\n]*Kreatorze marki nie otrzymuje danych z wizytówki i stopki e-mail/);
    // Lista podprocesorów bez zmian (zmienia się tylko zakres u Anthropic i Hetzner) – bez 30 dni z DPA §7.
    const nazwy = (t: string) => [...t.matchAll(/^\| \*\*([^*]+)\*\* \|/gm)].map((m) => m[1]);
    expect(nazwy(tresc.privacy.slice(tresc.privacy.indexOf('### 5.1'), tresc.privacy.indexOf('### 5.2')))).toEqual([
      'Hetzner Online GmbH', 'Stripe Payments Europe, Ltd.', 'mBank S.A. (Paynow)', 'Amazon Web Services EMEA SARL', 'Cloudflare, Inc.',
      'Hosting Concepts B.V. (Openprovider)', 'Google Ireland Limited', 'Streamsoft spółka z ograniczoną odpowiedzialnością sp. k.', 'OpenAI Ireland Ltd', 'Anthropic Ireland, Limited',
    ]);
  });

  it('usunięcie konta zgodne z Polityką: marki, pliki i zużycie usuwane, zakupy zostają, odciski bez powiązania', () => {
    const kod = czytaj('apps/api/src/compliance/account-deletion.service.ts');
    for (const m of ['kreatorMarkaPlik.deleteMany', 'kreatorMarka.deleteMany', 'kreatorMarkaZuzycie.deleteMany']) expect(kod).toContain(m);
    expect(kod).not.toContain('kreatorMarkaZakup.deleteMany');
    expect(kod).toContain('kreatorMarkaOdcisk.updateMany({ where: { userId }, data: { userId: null, markaId: null } })');
    expect(tresc.privacy).toMatch(/marki, wgrane pliki logo i dane do wizytówki i stopki z Kreatora marki usuwamy razem z kontem \(zakupy Pakietu marki i kolejnych marek zostają jako rozliczenia\)/);
    expect(tresc.privacy).toMatch(/Po usunięciu marki albo konta odcisk zostaje bez nazwy, danych konta i powiązania z Tobą/);
  });

  it('DPA §2 ust. 6: dane z wizytówki i stopki w powierzeniu, kategoria w §4 ust. 1', () => {
    const dpa2 = tresc.dpa.slice(tresc.dpa.indexOf('## §2.'), tresc.dpa.indexOf('## §3.'));
    expect(ustepy(dpa2)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dpa2).toMatch(/6\. W Kreatorze marki Verris w imieniu Klienta przechowuje dane[^\n]*nie przekazuje tych danych do modelu AI/);
    expect(tresc.dpa).toMatch(/dane pracowników i współpracowników Klienta wpisane do wizytówki i stopki e-mail w Kreatorze marki \(§2 ust\. 6\)/);
    expect(ustep(16)).toContain('(DPA §2 ust. 6)');
  });

  it('Polityka cookies bez zmian merytorycznych; rejestr zmian, README i projekt oznaczony jako wbudowany', () => {
    expect(tresc.cookies).not.toMatch(/Kreator/);
    expect(zmiany).toMatch(/\*\*Polityka cookies 1\.4\.0\*\* \(`cookies\.md`\): tylko numer wersji/);
    expect(zmiany).toContain('LEGAL_LIVE_VERSION=1.4.0');
    expect(zmiany).not.toContain('—');
    expect(czytaj('docs/legal/drafts/README.md')).toMatch(/^# Dokumenty prawne Verris – wersja 1\.4\.0/);
    expect(czytaj('docs/legal/drafts/DO_ZATWIERDZENIA_kreator-marki.md')).toContain('**Status: WBUDOWANE w 1.4.0');
  });
});

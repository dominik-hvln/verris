import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PLANY_KREATORA } from '@verris/kreator';
import { OKRES_COFNIECIA_DNI } from '../kreator/wordpress/kreator-wordpress.service.js';
import { WAZNOSC_LINKU_MS } from '../kreator/publikacja.service.js';
import { POLA_TRESCI } from '../kreator/formularz.js';
import { REGULAMIN_Z_KREATOREM } from '../kreator/kreator.admin.controller.js';

/**
 * Dokumenty prawne 1.3.0 (9.11.2026) – Verris Kreator w cenie Hostingu i abonament Kreator Pro (Regulamin §13a),
 * dane w kreatorze (Polityka pkt 2.12), formularze stron z kreatora w umowie powierzenia (DPA §2 ust. 4–5).
 * Skrypt `ops/scripts/prod-legal-publish-draft-review.sh` publikuje cztery pliki z jednym numerem – wszystkie muszą
 * mieć 1.3.0 w nagłówku i stopce. Generowanie zdjęć AI jest wyłączone do umowy z dostawcą
 * (`DO_ZATWIERDZENIA_zdjecia-ai.md`) – dokumenty go nie obiecują i nie wymieniają dostawcy obrazów.
 * Na szkicach 1.2.1 test pada: brak §13a, Kreatora w §1 pkt 6, pkt 2.12 i formularzy w DPA.
 */
const KORZEN = join(__dirname, '../../../..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');
const DOKUMENTY = ['terms', 'privacy', 'cookies', 'dpa'] as const;
const tresc = Object.fromEntries(DOKUMENTY.map((d) => [d, czytaj(`docs/legal/drafts/${d}.md`)])) as Record<(typeof DOKUMENTY)[number], string>;
const podprocesorzy = czytaj('docs/legal/drafts/subprocessors.md');
const konsument = czytaj('docs/legal/consumer-info.md');
const zmiany = czytaj('docs/legal/drafts/ZMIANY_1.2.1-1.3.0.md');

/** Paragrafy Regulaminu (`## §N.`) → treść do następnego nagłówka. */
function paragrafy(t: string): Map<string, string> {
  const wynik = new Map<string, string>();
  const czesci = t.split(/^## §(\d+a?)\. /m);
  for (let i = 1; i < czesci.length; i += 2) wynik.set(czesci[i]!, czesci[i + 1]!.split(/\n## /)[0]!);
  return wynik;
}
const ustepy = (tekst: string) => [...tekst.matchAll(/^(\d+)\. /gm)].map((m) => Number(m[1]));
const par = paragrafy(tresc.terms);
const p13a = par.get('13a') ?? '';
const ustep = (n: number) => p13a.split('\n').find((l) => l.startsWith(`${n}. `)) ?? '';

describe('Dokumenty prawne 1.3.0 – Verris Kreator i Kreator Pro', () => {
  it.each(DOKUMENTY)('%s: wersja 1.3.0 z datą do podstawienia, bez pauzy „—” i miejsc do uzupełnienia', (d) => {
    const t = tresc[d];
    expect(t).toContain('**Wersja 1.3.0 · obowiązuje od [DATA PUBLIKACJI]**');
    expect(t).toContain('**Wersja 1.3.0 – data publikacji i wejścia w życie: [DATA PUBLIKACJI]**');
    expect(t).not.toContain('—');
    expect(t).not.toMatch(/\[(UZUPEŁNIĆ|TODO|DO UZUPEŁNIENIA)/i);
    expect(t).not.toMatch(/<!--|DO SPRAWDZENIA/);
  });

  it('Regulamin i Polityka: 1.3.0 zastępuje 1.2.1 z 6.11.2026; informacje dla konsumenta razem z Regulaminem 1.3.0', () => {
    for (const d of ['terms', 'privacy'] as const) expect(tresc[d]).toContain('> Wersja 1.3.0 zastępuje wersję 1.2.1 z 6 listopada 2026 r.');
    expect(konsument).toContain('**Wersja 1.3.0 · obowiązuje od [DATA PUBLIKACJI]** (razem z Regulaminem 1.3.0)');
    expect(konsument).toMatch(/Verris Kreator w cenie hostingu\), abonament Verris Kreator Pro/);
    expect(podprocesorzy).toContain('**Wersja 1.3.0 · stan na [DATA PUBLIKACJI]**');
  });

  it('bez obietnicy generowania zdjęć AI i bez dostawcy obrazów (funkcja wyłączona do umowy z dostawcą)', () => {
    for (const t of [...Object.values(tresc), podprocesorzy, konsument]) {
      expect(t).not.toMatch(/Black Forest|\bBFL\b|FLUX/i);
      expect(t).not.toMatch(/generowa\w* zdję|zdjęci\w* (generowane|wygenerowane)|zdjęć AI|zdjęcia AI/i);
    }
    expect(ustep(1)).toContain('Funkcje AI Kreatora działają w zakresie opisanym w Panelu.');
  });

  it('§1 pkt 6 wymienia Kreator i Kreator Pro z odesłaniem do §13a; admin rozpozna Regulamin z kreatorem', () => {
    expect(tresc.terms).toMatch(/6\. \*\*Usługi\*\*[^\n]*Hosting \(rozdz\. III §10\) wraz z Verris Kreatorem \(§13a\)[^\n]*abonament Verris Kreator Pro \(§13a\)/);
    expect(REGULAMIN_Z_KREATOREM.test(tresc.terms)).toBe(true);
    expect(REGULAMIN_Z_KREATOREM.test(czytaj('docs/legal/drafts/ZMIANY_1.1.0-1.2.0.md'))).toBe(false);
  });

  it('§13a stoi między §13 a §14, ma kolejno numerowane ustępy, a każde odesłanie „§N ust. M” w Regulaminie istnieje', () => {
    const kolejnosc = [...par.keys()];
    expect(kolejnosc.indexOf('13a')).toBe(kolejnosc.indexOf('13') + 1);
    expect(kolejnosc.indexOf('14')).toBe(kolejnosc.indexOf('13a') + 1);
    const n = ustepy(p13a);
    expect(n).toEqual(Array.from({ length: 14 }, (_, i) => i + 1));
    const zle: string[] = [];
    for (const m of tresc.terms.matchAll(/(?<!DPA )§(\d+a?) ust\. (\d+)(?:[–-](\d+))?/g)) {
      const ile = ustepy(par.get(m[1]!) ?? '').length;
      if (Number(m[3] ?? m[2]) > ile) zle.push(m[0]);
    }
    expect(zle).toEqual([]);
  });

  it('odesłania do §13a trafiają w ustępy o tej treści (§7 ust. 3 → ust. 12, §7 ust. 4 → ust. 10)', () => {
    const p7 = par.get('7') ?? '';
    expect(p7).toMatch(/3\. Z zastrzeżeniem §11 ust\. 7 \(VPS\) i §13a ust\. 12 \(Kreator Pro\)/);
    expect(ustep(12)).toMatch(/^12\. Jeżeli odnowienie abonamentu się nie powiedzie/);
    expect(p7).toContain('Zmianę okresu rozliczeniowego abonamentu Kreator Pro określa §13a ust. 10.');
    expect(ustep(10)).toMatch(/zmiana następuje od następnego odnowienia/);
    expect(ustep(9)).toContain('dyskretny wariant znaku z ust. 8');
    expect(ustep(8)).toContain('„Stworzone w Verris Kreator”');
    expect(ustep(2)).toContain('przejście na WordPress (ust. 7)');
    expect(ustep(7)).toMatch(/WordPress/);
    expect(par.get('10')).toContain('Verris Kreator (§13a)');
  });

  it('§13a zgodny z kodem: próba, link 7 dni, ZIP, WordPress i cofnięcie 30 dni, znak dyskretny w Pro', () => {
    expect(WAZNOSC_LINKU_MS).toBe(7 * 24 * 60 * 60 * 1000);
    expect(ustep(2)).toContain('link podglądu ważny 7 dni');
    const { proba, hosting, pro } = PLANY_KREATORA;
    expect([proba.publikacja, proba.zip, proba.wordpress]).toEqual(['podglad', false, false]);
    expect([hosting.publikacja, hosting.zip, hosting.wordpress]).toEqual(['domena', true, true]);
    expect([pro.znakMinimalny, pro.wielojezycznosc, hosting.znakMinimalny]).toEqual([true, true, false]);
    expect(ustep(2)).toMatch(/Publikacja na domenie Klienta, pobranie strony jako pliku ZIP i przejście na WordPress \(ust\. 7\) są dostępne po opłaceniu Hostingu/);
    expect(OKRES_COFNIECIA_DNI).toBe(30);
    expect(ustep(7)).toMatch(/odpowiada za jego aktualizacje, motywy, wtyczki[^\n]*Przez 30 dni od zamiany Klient może w Panelu cofnąć przejście/);
  });

  it('§13a: Kreator Pro – subskrypcja, wyłączenie odnowienia bez opłaconego Hostingu bez zwrotu, skutki końca, AI jako propozycja', () => {
    expect(ustep(9)).toMatch(/wyłącznie przy opłaconym Hostingu \(nie w okresie próbnym\); na Koncie może działać jeden abonament/);
    expect(ustep(10)).toMatch(/Subskrypcją w rozumieniu §7[^\n]*z Portfela albo kartą/);
    expect(ustep(11)).toMatch(/Verris wyłącza automatyczne odnowienie abonamentu Kreator Pro i informuje o tym Klienta e-mailem[^\n]*nie podlega zwrotowi/);
    expect(ustep(13)).toMatch(/strony już opublikowane działają dalej bez zmian/);
    expect(ustep(4)).toMatch(/Klient odpowiada za treść publikowanej strony[^\n]*\(§16 ust\. 3\)[^\n]*nie dodaje do strony cen, opinii klientów ani danych firmy/);
    expect(par.get('16')).toMatch(/3\. Klient odpowiada za treści/);
    expect(ustep(5)).toMatch(/usuwa z pliku metadane[^\n]*CC0/);
  });

  it('formularz kontaktowy: Regulamin odsyła do DPA §2 ust. 4, a DPA opisuje wszystkie pola formularza i brak zapisu treści', () => {
    expect(ustep(6)).toContain('(DPA §2 ust. 4)');
    const dpa2 = tresc.dpa.slice(tresc.dpa.indexOf('## §2.'), tresc.dpa.indexOf('## §3.'));
    const u4 = dpa2.split('\n').find((l) => l.startsWith('4. ')) ?? '';
    expect(u4).toMatch(/formularz kontaktowy/);
    // Nowe pole formularza = nowa kategoria danych w powierzeniu – test każe dopisać je do DPA §2 ust. 4.
    expect([...POLA_TRESCI]).toEqual(['imie', 'email', 'telefon', 'firma', 'termin', 'usluga', 'wiadomosc']);
    expect(u4).toContain('imię, adres e-mail, numer telefonu, nazwę firmy, preferowany termin, wybraną usługę i treść wiadomości');
    expect(u4).toContain('Verris nie zapisuje treści wiadomości w swojej bazie danych');
    expect(tresc.dpa).toContain('osoby kontaktujące się z Klientem przez formularz kontaktowy jego strony');
  });

  it('Anthropic (już podprocesor) obejmuje Verris Kreator w Polityce, liście i DPA Załącznik 2; biblioteki zdjęć bez danych', () => {
    expect(tresc.privacy).toContain('### 2.12 Verris Kreator (kreator stron)');
    expect(tresc.privacy).toMatch(/\| \*\*Anthropic Ireland, Limited\*\* \|[^\n]*Verris Kreator/);
    expect(podprocesorzy).toMatch(/\| \*\*Anthropic Ireland, Limited\*\* \|[^\n]*Verris Kreator/);
    const zal2 = tresc.dpa.slice(tresc.dpa.indexOf('## Załącznik 2'));
    expect(zal2).toMatch(/\| Anthropic Ireland, Limited \|[^\n]*Verris Kreator/);
    expect(zal2).toMatch(/\| Amazon Web Services EMEA SARL \|[^\n]*formularzy kontaktowych stron z Verris Kreatora/);
    expect(tresc.privacy).toMatch(/do dostawcy biblioteki trafia wyłącznie wpisana fraza/);
    // Dostawcy bibliotek nie są odbiorcami danych – nie ma ich w tabelach podprocesorów.
    for (const t of [tresc.privacy, zal2, podprocesorzy]) expect(t).not.toMatch(/^\| \*{0,2}(Openverse|Pixabay|Pexels)/m);
  });

  it('Polityka cookies 1.3.0 bez zmian merytorycznych względem 1.2.1 (kreator nie zapisuje cookies) – opisane w rejestrze zmian', () => {
    expect(tresc.cookies).not.toMatch(/Kreator/);
    expect(zmiany).toMatch(/\*\*Polityka cookies 1\.3\.0\*\* \(`cookies\.md`\): tylko numer wersji/);
  });

  it('rejestr zmian: publikacja 1.3.0, blokery dla właściciela; projekt Kreatora Pro oznaczony jako wbudowany', () => {
    expect(zmiany).toContain('LEGAL_LIVE_VERSION=1.3.0');
    expect(zmiany).toMatch(/1\. \*\*BLOKER – usunięcie konta nie usuwa danych kreatora\.\*\*/);
    expect(zmiany).not.toContain('—');
    expect(czytaj('docs/legal/drafts/DO_ZATWIERDZENIA_kreator-pro.md')).toContain('**Status: WBUDOWANE w 1.3.0');
  });
});

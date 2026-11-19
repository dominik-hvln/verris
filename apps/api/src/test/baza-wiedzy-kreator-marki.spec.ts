import { readFileSync } from 'fs';
import { join } from 'path';
import { DOMYSLNA_KONFIGURACJA_MARKI, bruttoNetto } from '../kreator-marki/konfiguracja-marki.js';

/**
 * Paczka 130 – pomoc i support Kreatora marki: 8 artykułów w seedzie CMS jako SZKICE (moduł domyślnie wyłączony –
 * szkic nie trafia na pomoc.verris.pl ani do indeksu AI asystenta) i 3 szablony odpowiedzi SUP-V2 jako nieaktywne.
 * Liczby i ceny w artykułach = DOMYSLNA_KONFIGURACJA_MARKI (brutto i netto). Bez obietnic „unikalne / zastrzeżone /
 * gotowe do rejestracji”. Na starym kodzie czerwony: artykułów, szkiców ani szablonów nie było.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const SEED = readFileSync(join(KORZEN, 'apps/api/src/cli/seed-kb-cms.ts'), 'utf8');
const CANNED = readFileSync(join(KORZEN, 'libs/database/prisma/seed-canned.ts'), 'utf8');
const TYTULY = [
  'Jak stworzyć logo w Kreatorze marki',
  'Mam już logo – materiały Key Visual',
  'Odświeżenie logo',
  'Pliki logo – który do czego (SVG, PNG, PDF, favicon)',
  'Druk: wizytówka i CMYK',
  'Logo a znak towarowy – TMview krok po kroku',
  'Stopka e-mail z logo',
  'Marka na stronie z Kreatora stron',
];
const MARKA = SEED.slice(SEED.indexOf("D('kreator-stron'"), SEED.indexOf('\n];\n\nfunction toPlain'));
const zl = (kwota: number) => {
  const [c, g] = kwota.toFixed(2).split('.');
  return g === '00' ? `${c} zł` : `${c},${g} zł`;
};

describe('Baza wiedzy – Kreator marki (szkice)', () => {
  it('osiem artykułów jako szkice D(…) w kategorii „Kreator stron”, z FAQ i opisem SEO', () => {
    expect(MARKA.match(/D\('kreator-stron', /g)).toHaveLength(TYTULY.length);
    for (const t of TYTULY) expect(MARKA).toContain(`', '${t}',`);
    expect(MARKA.match(/\{ t: '/g)).toHaveLength(TYTULY.length);
    // Poza blokiem Kreatora marki nie ma szkiców.
    expect(SEED.slice(0, SEED.indexOf("D('kreator-stron'")).match(/^ {2}D\(/gm)).toBeNull();
  });

  it('szkic: status DRAFT przy tworzeniu, bez daty publikacji i bez indeksu AI (także przy odświeżeniu)', () => {
    expect(SEED).toContain("const D = (...a: Parameters<typeof A>): Art => ({ ...A(...a), status: 'DRAFT' });");
    expect(SEED).toContain("status: a.status ?? 'PUBLISHED',");
    expect(SEED).toContain("publishedAt: a.status === 'DRAFT' ? null : new Date(),");
    expect(SEED).toContain("if (a.status !== 'DRAFT') await indexAi(a)");
    expect(SEED).toContain("if ((exists as { status?: string }).status === 'PUBLISHED') await indexAi(a)");
  });

  it('powiązane artykuły wskazują istniejące slugi', () => {
    const wszystkie = new Set([...SEED.matchAll(/[AD]\('[\w-]+', '([\w-]+)',/g)].map((m) => m[1]));
    const powiazane = [...MARKA.matchAll(/related: \[([^\]]*)\]/g)].flatMap((m) => [...m[1].matchAll(/'([\w-]+)'/g)].map((x) => x[1]));
    expect(powiazane.length).toBeGreaterThan(8);
    expect(powiazane.filter((s) => !wszystkie.has(s))).toEqual([]);
  });

  it('limity i ceny = konfiguracja domyślna modułu (brutto i netto)', () => {
    const k = DOMYSLNA_KONFIGURACJA_MARKI;
    const h = k.wCenieHostingu;
    expect(MARKA).toContain(`${h.marek} marka na koncie, ${h.seriiMies} serie propozycji i ${h.zmianAiMies} zmian AI miesięcznie`);
    expect(MARKA).toContain(`${k.pakiet.serie} serii propozycji i ${k.pakiet.zmianyAi} zmian AI`);
    expect(MARKA).toContain(`nowe szablony przez ${k.pakiet.aktualizacjeSzablonowMies} miesięcy`);
    const p = bruttoNetto(k.pakiet.cenaBrutto);
    const d = bruttoNetto(k.drugaMarka.cenaBrutto);
    expect(MARKA).toContain(`${zl(p.brutto)} brutto (${zl(p.netto)} netto)`);
    expect(MARKA).toContain(`${zl(d.brutto)} brutto (${zl(d.netto)} netto)`);
    expect(MARKA).toContain(`do ${k.maksRozmiarWgraniaMb} MB`);
  });

  it('bez obietnic prawnych i bez białej etykiety; półpauza zamiast pauzy; bez tabel (renderer pomocy ich nie ma)', () => {
    expect(MARKA).not.toMatch(/unikaln|gotow\p{L}* do rejestracji|sprawdzon\p{L}* w UPRP/iu);
    for (const m of MARKA.matchAll(/.{0,30}zastrzeż\p{L}*\??/giu)) expect(m[0]).toMatch(/nie (jest )?(znakiem |znak )?zastrzeżon|logo z Kreatora marki jest zastrzeżone\?/u);
    expect(MARKA).not.toMatch(/DirectAdmin|CustomBuild|Roundcube|SOGo|2222|WordPress/);
    expect(MARKA).not.toContain('—');
    expect(MARKA).not.toMatch(/^\|/m);
    expect(MARKA).toContain('TMview');
  });
});

describe('Szablony odpowiedzi – Kreator marki', () => {
  const blok = CANNED.slice(CANNED.indexOf('Kreator marki – prośba o zmianę logo'), CANNED.indexOf('\n];\n\nasync function main'));

  it('trzy szablony („zmieńcie mi logo”, „jak znana marka”, druk/CMYK), nieaktywne do startu modułu', () => {
    for (const s of ['marka-zmiana', 'marka-jak-znana', 'marka-druk']) expect(blok).toContain(`shortcut: '${s}'`);
    expect(blok.match(/isActive: false/g)).toHaveLength(3);
    expect(CANNED).toContain('isActive: t.isActive ?? true,');
  });

  it('treść: bez usługi „poprawi grafik”, bez naśladowania marek, CMYK z proofem; bez pauzy', () => {
    expect(blok).toContain('Nie projektujemy ani nie poprawiamy logo ręcznie');
    expect(blok).toContain('nie przygotuje jednak logo na wzór cudzego znaku');
    expect(blok).toContain('wydruk próbny (proof)');
    expect(blok).not.toContain('—');
    expect(blok).not.toMatch(/unikaln|zastrzeżon/iu);
  });
});

/**
 * Strona główna (makieta 1.11): ceny, okres próbny i JSON-LD idą z modułu cen (lib/ceny-api.ts), a nie z liczb
 * wpisanych w page.tsx. Podstawiamy inne ceny niż dzisiejsze i sprawdzamy, że strona pokazuje właśnie je.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE, type Ceny } from '@/lib/ceny';

let ceny: Ceny = CENY_ZAPASOWE;
jest.mock('@/lib/ceny-api', () => ({ pobierzCeny: async () => ceny }));
jest.mock('@/lib/dostepnosc', () => ({
  ...jest.requireActual('@/lib/dostepnosc'),
  pobierzDostepnosc: async () => ({
    dni: [
      { data: '2026-10-30', klasa: 'ok', dostepnosc: 100 },
      { data: '2026-10-31', klasa: 'krotkie', dostepnosc: 99.97 },
    ],
    d30: 99.73,
    h24: 100,
  }),
}));

/* eslint-disable @typescript-eslint/no-require-imports */
const { default: HomePage } = require('../page') as { default: () => Promise<React.ReactElement> };
/* eslint-enable @typescript-eslint/no-require-imports */

async function render(c: Ceny): Promise<{ html: string; tekst: string; ld: string }> {
  ceny = c;
  const html = renderToStaticMarkup(await HomePage());
  const ld = (html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) ?? ['', ''])[1];
  const tekst = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|\s+/g, ' ');
  return { html, tekst, ld };
}

const INNE: Ceny = {
  hosting: { miesiecznie: 50, rocznie: 500, trialDays: 0 },
  poczta: { miesiecznie: 12, rocznie: 120 },
  stawki: { cpu: 0.002, ram: 0.1, dysk: 0.001 },
  zrodlo: 'api',
};

describe('strona główna — ceny z API', () => {
  it('pokazuje ceny i stawki z modułu, brutto i netto, także w JSON-LD', async () => {
    const { tekst, ld } = await render(INNE);
    expect(tekst).toContain('50 zł/mies. brutto (40,65 zł netto)');
    expect(tekst).toContain('500 zł/rok brutto (406,50 zł netto)');
    expect(tekst).toContain('0,1 zł za 1 GB RAM/h');
    expect(tekst).toContain('0,001 zł za 1 GB/h');
    // +50 GB przez miesiąc: 0,001 × 730 × 50 = 36,50 zł
    expect(tekst).toContain('36,50 zł');
    // 3 lata po 500 zł
    expect(tekst).toContain('1 500 zł');
    expect(tekst).not.toMatch(/\b45 zł|449 zł/);
    expect(ld).toContain('"price":"50.00"');
    expect(ld).toContain('"price":"500.00"');
  });

  it('bez okresu próbnego: „Zamów hosting”, bez bloku próby i bez pytania o próbę w FAQ', async () => {
    const { tekst, ld } = await render(INNE);
    expect(tekst).toContain('Zamów hosting');
    expect(tekst).not.toMatch(/za darmo, bez karty|Wypróbuj/);
    expect(ld).not.toContain('za darmo?');
  });

  it('z okresem próbnym (trialDays z API): przyciski, blok próby i pytanie w FAQ (także w JSON-LD)', async () => {
    const { tekst, ld } = await render({ ...INNE, hosting: { ...INNE.hosting, trialDays: 14 } });
    expect(tekst).toContain('Wypróbuj 14 dni za darmo');
    expect(tekst).toContain('14 dni za darmo, bez karty');
    expect(tekst).toContain('Jak działa 14 dni za darmo?');
    expect(ld).toContain('Jak działa 14 dni za darmo?');
  });

  it('jedno h1, oczekiwane typy JSON-LD, bez placeholderów i zakazanych słów', async () => {
    const { html, tekst, ld } = await render(CENY_ZAPASOWE);
    expect(html.match(/<h1[\s>]/g)).toHaveLength(1);
    for (const t of ['Organization', 'WebSite', 'Product', 'FAQPage']) expect(ld).toContain(`"@type":"${t}"`);
    expect(tekst).not.toMatch(/\[[^\]]*(zł|cena|czas|liczba|N\b|X\b)[^\]]*\]/i);
    expect(tekst).not.toMatch(/DirectAdmin|CloudLinux|2222|Niemcz|Finlandi|gotowe na KSeF|gwarancja 100/i);
  });

  it('pasek dostępności z /status i dostępność 30 dni w liczbach', async () => {
    const { html, tekst } = await render(CENY_ZAPASOWE);
    expect(tekst).toContain('99,73%');
    expect(html).toContain('class="pdost"');
  });

  it('karta z czterema liczbami ma zwykły odstęp sekcji od kreski pod hero (uwaga 6.11: przylegała)', async () => {
    const { html } = await render(CENY_ZAPASOWE);
    // .hero2 ma border-bottom (globals.css); sekcja liczb zaraz pod nim nie może zerować górnego paddingu .sec.
    const sekcja = html.match(/<section[^>]*aria-label="Liczby, które możesz sprawdzić"[^>]*>/)?.[0] ?? '';
    expect(sekcja).toContain('class="sec"');
    expect(sekcja).not.toMatch(/padding-top|style=/);
    expect(html.indexOf('class="hero2 gl-hero"')).toBeLessThan(html.indexOf('aria-label="Liczby, które możesz sprawdzić"'));
  });

  it('stawki autoskalowania wszystkimi cyframi z API, brutto i netto (uwaga 6.11: bez skracania)', async () => {
    const { tekst } = await render({ ...INNE, stawki: { cpu: 0.001283, ram: 0.123456, dysk: 0.0008 } });
    expect(tekst).toContain('0,123456 zł za 1 GB RAM/h · 0,001283 zł za 1% CPU/h');
    // netto: 0,123456 / 1,23 = 0,100371…; 0,001283 / 1,23 = 0,00104309…
    expect(tekst).toContain('0,100371 zł · 0,00104309 zł');
  });
});

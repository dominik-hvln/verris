/**
 * verris.pl/beta — otwarte testy przed startem. Render na serwerze: sekcje, ceny z modułu cen, noindex,
 * brak obietnic, których nie dotrzymamy (asystent AI za flagą), formularz z etykietami i honeypotem.
 */
import type { ReactElement } from 'react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE, type Ceny } from '@/lib/ceny';

jest.mock('next/navigation', () => ({ usePathname: () => null }));
jest.mock('@/lib/submit-beta', () => ({ submitBeta: jest.fn() }));

const CENY_TESTOWE: Ceny = {
  ...CENY_ZAPASOWE,
  hosting: { miesiecznie: 51, rocznie: 501, trialDays: 0 },
  zrodlo: 'api',
};
jest.mock('@/lib/ceny-api', () => ({ pobierzCeny: async () => CENY_TESTOWE }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const strona = () => require('./page') as { default: () => Promise<ReactElement>; metadata: { robots?: unknown; alternates?: unknown } };

let html = '';
let tekst = '';
beforeAll(async () => {
  html = renderToStaticMarkup(await strona().default());
  tekst = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ');
});

describe('/beta — treść', () => {
  it('sekcje z makiety i termin grudzień 2026', () => {
    for (const t of ['Testy przed startem · grudzień 2026', 'Kogo szukamy', 'Jak to wygląda', 'Co testujesz', 'Uczciwie o testach', 'Autoskalowanie', 'Zgłoś się do testów', 'Pytania o testy']) {
      expect(tekst).toContain(t);
    }
    expect(tekst).toContain('7–20 grudnia 2026');
    expect(tekst).not.toMatch(/październik|listopad/i);
  });

  it('ceny z modułu cen (brutto i netto), bez kwot wpisanych na sztywno', () => {
    expect(tekst).toContain('51 zł miesięcznie albo 501 zł za rok brutto (41,46 zł albo 407,32 zł netto)');
    expect(tekst).not.toMatch(/\b45 zł|\b449 zł/);
  });

  it('„wystarczy na” liczone z ceny z API', () => {
    expect(tekst).toContain('ok. 2 miesiące hostingu');
  });

  it('nie obiecuje asystenta AI ani kolejności zgłoszeń; mówi o wyborze grup', () => {
    expect(tekst).not.toMatch(/\bAI\b|asystent/i);
    expect(tekst).not.toContain('w kolejności zgłoszeń');
    expect(tekst).toContain('Zapraszamy małymi grupami; wybieramy tak, żeby przetestować różne strony');
  });

  it('white label: bez nazw oprogramowania i lokalizacji serwerów', () => {
    expect(tekst).not.toMatch(/DirectAdmin|CloudLinux|LiteSpeed|Niemcy|Finlandi|Hetzner|100%/);
    expect(tekst).toContain('Serwery w Unii Europejskiej.');
  });

  it('limity pakietu jako limity (kolumna „limit w pakiecie”) i sufity autoskalowania', () => {
    expect(tekst).toContain('limit w pakiecie');
    expect(tekst).toContain('z autoskalowaniem do');
    // Wiersz tabeli: limit w pakiecie, potem sufit autoskalowania.
    expect(tekst.match(/Procesor (\d) vCPU 24 vCPU/)?.[1]).toBe('2');
  });

  it('JSON-LD: FAQPage z sekcji pytań', () => {
    expect(html).toContain('"@type":"FAQPage"');
    expect(html).toContain('Czy muszę coś płacić?');
  });
});

describe('/beta — SEO strony tymczasowej', () => {
  it('noindex, follow i kanoniczny adres /beta', () => {
    const m = strona().metadata;
    expect(m.robots).toEqual({ index: false, follow: true });
    expect(m.alternates).toEqual({ canonical: '/beta' });
  });

  it('nie ma jej w sitemapie', () => {
    expect(readFileSync(join(__dirname, '../../sitemap.ts'), 'utf8')).not.toContain("'/beta'");
  });
});

describe('/beta — formularz', () => {
  it('pola z etykietami, zakres jako przełączniki z aria-pressed w fieldset', () => {
    for (const [id, label] of [
      ['bt-imie', 'Imię'],
      ['bt-email', 'E-mail'],
      ['bt-strona', 'Adres strony (jeśli masz)'],
      ['bt-hosting', 'U kogo masz teraz hosting? (opcjonalnie)'],
      ['bt-uwagi', 'Coś jeszcze? (opcjonalnie)'],
    ]) {
      expect(html).toContain(`<label for="${id}">${label}</label>`);
      expect(html).toContain(`id="${id}"`);
    }
    expect(html).toMatch(/<fieldset class="bt-zakres"[^>]*><legend>Co chcesz przetestować\?<\/legend>/);
    expect(html.match(/<button type="button" aria-pressed="false"/g)).toHaveLength(5);
  });

  it('honeypot ukryty przed ludźmi i czytnikami, poza kolejnością Tab', () => {
    const hp = html.match(/<div class="bt-hp" aria-hidden="true">[\s\S]*?<\/div>/)?.[0] ?? '';
    // P1-07: nazwa i etykieta, których nie rusza autouzupełnianie (nie „firma”).
    expect(hp).toMatch(/<input[^>]*name="pulapka"/);
    expect(hp).not.toMatch(/firma|company|organization/i);
    expect(hp).toMatch(/tabindex="-1"/);
    expect(hp).toMatch(/autoComplete="off"/i);
  });

  it('zgoda z treścią, która idzie do API, i link do polityki prywatności', () => {
    expect(tekst).toContain('Chcę dostać zaproszenie do testów i wiadomości z nimi związane. Administratorem danych jest HVLN Dominik Kowalski');
    expect(html).toContain('href="https://panel.verris.pl/legal/privacy"');
  });

  it('zdarzenie leada wysyłane przez wspólny helper analityki (Consent Mode, Meta tylko po zgodzie) ze źródłem beta_signup', () => {
    const src = readFileSync(join(__dirname, '../components/BetaForm.tsx'), 'utf8');
    expect(src).toContain("events.generateLead('beta_signup')");
    expect(src).not.toMatch(/window\.fbq|dataLayer\.push|gtag\(/);
  });
});

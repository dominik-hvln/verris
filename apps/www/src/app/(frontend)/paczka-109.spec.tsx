/**
 * Paczka 109 (testy agentami 3.11.2026) — www: fonty bez Google, /poczta → zamówienie poczty, /kontakt z prośbą
 * o telefon i danymi sprzedawcy, teksty zgodne z decyzjami Dominika (SLA automatycznie, rabat na start, autoskalowanie
 * bez obietnicy „nie zaskoczy”, sklep: kilka minut przerwy), Black Friday na jednych założeniach, specyfikacja (PHP,
 * logi, limity PHP, API), linki partnera i cookies zgodne z faktycznymi plikami.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';

jest.mock('next/navigation', () => ({ usePathname: () => '/poczta' }));
jest.mock('@/lib/submit-lead', () => ({ submitLead: jest.fn() }));
jest.mock('@/lib/submit-callback', () => ({ submitCallback: jest.fn() }));
jest.mock('@/lib/globals', () => ({ getFooterGlobal: jest.fn(async () => null) }));

import * as Poczta from './poczta/page';
import * as Kontakt from './kontakt/page';
import * as Sklep from './hosting/sklep/page';
import * as Reseller from './reseller/page';
import * as Polecaj from './polecaj/page';
import { celZamowienia } from './components/Header';
import { DEFAULT_PAY, LINIA_PRAWNA } from './components/Footer';
import { OPIS_ROZMOWY, PasRozmowy, POTWIERDZENIE_ODDZWONIENIA } from './components/PasRozmowy';
import { AKalkulator } from './components/AKalkulator';
import { formularzWidoczny } from './components/UstepujFormularzom';
import { CEL_POCZTY, pasekPoczty, ZAMOW_POCZTE } from '@/lib/proba';
import { CENY_ZAPASOWE, netto } from '@/lib/ceny';
import { formatZl, kosztPiku, PRZYKLAD_BLACK_FRIDAY } from '@/lib/kalkulator';
import { TEMATY_KONTAKTU } from '@/lib/kontakt';
import { sekcjeSpecyfikacji } from '@/lib/specyfikacja';
import { PRZEKIEROWANIA } from '@/lib/przekierowania';
import { ODBIERZ_LINK, ZAMOW, ZOSTAN_PARTNEREM } from '@/lib/site';
import { SPRZEDAWCA } from '@/lib/sprzedawca';
import { OPIS_KATEGORII, wolnoZapamietacUtm } from '@/lib/cookie-consent';
import { zapiszSesje } from '@/lib/asystent-stan';

const SRC = join(__dirname, '../..');
const tekst = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'");

function pliki(dir: string, rozszerzenia: RegExp): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return pliki(p, rozszerzenia);
    return rozszerzenia.test(n) && !/\.spec\.tsx?$/.test(n) ? [p] : [];
  });
}

describe('A2-03 — fonty z własnego serwera, bez Google', () => {
  const kod = [...pliki(join(SRC, 'app'), /\.(tsx?|css)$/), ...pliki(join(SRC, 'lib'), /\.tsx?$/)];

  it('żaden plik strony nie łączy się z fonts.googleapis.com ani fonts.gstatic.com', () => {
    const zGoogle = kod.filter((p) => /fonts\.(googleapis|gstatic)\.com/.test(readFileSync(p, 'utf8'))).map((p) => relative(SRC, p));
    expect(zGoogle).toEqual([]);
  });

  it('@font-face wskazuje pliki z public/fonts, które istnieją', () => {
    const css = readFileSync(join(SRC, 'app/(frontend)/globals.css'), 'utf8');
    const adresy = [...css.matchAll(/url\('(\/fonts\/[^']+)'\)/g)].map((m) => m[1]);
    expect(adresy.length).toBe(6);
    for (const a of adresy) expect(existsSync(join(SRC, '../public', a))).toBe(true);
    for (const rodzina of ['Schibsted Grotesk', 'Hanken Grotesk', 'JetBrains Mono']) expect(css).toContain(`font-family:'${rodzina}'`);
  });
});

describe('P4-4 / P4-3 — /poczta prowadzi do zamówienia poczty', () => {
  let html = '';
  beforeAll(async () => {
    html = renderToStaticMarkup(await Poczta.default());
  });

  it('cel to rejestracja z zachowanym zamówieniem poczty (nie /zamow hostingu ani logowanie)', () => {
    expect(ZAMOW_POCZTE).toBe(`https://panel.verris.pl/register?next=${encodeURIComponent(CEL_POCZTY)}`);
    expect(CEL_POCZTY).toBe('/dashboard/services/new?type=email');
    expect(pasekPoczty(CENY_ZAPASOWE).href).toBe(ZAMOW_POCZTE);
    const hrefPoczty = ZAMOW_POCZTE.replace(/&/g, '&amp;');
    expect(html.split(`href="${hrefPoczty}"`).length - 1).toBeGreaterThanOrEqual(2);
    expect(html).not.toContain('href="https://panel.verris.pl/dashboard/services/new"');
  });

  it('przycisk w nagłówku na /poczta zamawia pocztę, na innych stronach hosting', () => {
    expect(celZamowienia('/poczta')).toMatchObject({ href: ZAMOW_POCZTE, dopisek: 'pocztę' });
    expect(celZamowienia('/hosting')).toMatchObject({ href: ZAMOW, dopisek: 'hosting' });
    expect(celZamowienia(null).href).toBe(ZAMOW);
  });

  it('przed zakupem wiadomo, co z domeną u obecnej firmy (to samo zdanie co w zamówieniu w panelu)', () => {
    const t = tekst(html);
    expect(t).toContain('Domena może zostać tam, gdzie jest teraz');
    expect(t).toContain('co dokładnie przepisać w ustawieniach domeny');
  });

  it('P4-14: pas rozmowy na /poczta mówi o poczcie, potwierdzenie bez powtórzonego „Oddzwonimy”', () => {
    expect(tekst(html)).toContain(OPIS_ROZMOWY.poczta);
    expect(tekst(html)).not.toContain('zaplanować przeniesienie strony');
    expect(POTWIERDZENIE_ODDZWONIENIA.match(/Oddzwonimy/g)).toHaveLength(1);
    expect(renderToStaticMarkup(<PasRozmowy />)).toContain(OPIS_ROZMOWY.strona);
  });
});

describe('P4-11 + A2-09 — /kontakt: prośba o telefon, temat poczty, pełne dane sprzedawcy', () => {
  let html = '';
  beforeAll(async () => {
    html = renderToStaticMarkup(await Kontakt.default());
  });

  it('pas „Poproś o telefon” z dniami roboczymi 9–17, bez publikowanego numeru (decyzja 10)', () => {
    expect(html).toContain('id="telefon"');
    expect(tekst(html)).toContain('Poproś o telefon');
    expect(tekst(html)).toContain('9–17');
    expect(tekst(html)).not.toMatch(/\+48\s?\d/);
  });

  it('temat „Poczta w domenie” w formularzu', () => {
    expect(TEMATY_KONTAKTU.map((t) => t.nazwa)).toContain('Poczta w domenie');
  });

  it('dane sprzedawcy: nazwa, adres, NIP, REGON, e-mail — na /kontakt i w stopce', () => {
    for (const s of [tekst(html), LINIA_PRAWNA]) {
      for (const pole of [SPRZEDAWCA.nazwa, 'Zacisze 2A', '65-775 Zielona Góra', SPRZEDAWCA.nip, SPRZEDAWCA.regon, 'kontakt@verris.pl']) {
        expect(s).toContain(pole);
      }
    }
  });
});

describe('decyzje 1, 3, 6, 13 — obietnice na www zgodne z regulaminem 1.1.0 i kodem', () => {
  // Wszystko, co trafia na verris.pl jako tekst (strony, komponenty, lib, llms.txt, pricing.md).
  const zakres = [
    ...pliki(join(SRC, 'app/(frontend)'), /\.tsx?$/),
    ...pliki(join(SRC, 'app/llms.txt'), /\.ts$/),
    ...pliki(join(SRC, 'app/llms-full.txt'), /\.ts$/),
    ...pliki(join(SRC, 'app/pricing.md'), /\.ts$/),
    ...readdirSync(join(SRC, 'lib'))
      .filter((n) => /\.ts$/.test(n) && !/\.spec\.ts$/.test(n) && n !== 'ceny.ts')
      .map((n) => join(SRC, 'lib', n)),
  ];
  const ZAKAZANE: [string, RegExp][] = [
    ['SLA na wniosek (decyzja 1: automatycznie)', /rekompensat\w*[^.'"`]{0,40}na wniosek|na wniosek[^.'"`]{0,30}rekompensat|wystarczy zgłoszenie/i],
    ['brak promocji na start (decyzja 3: rabat na start zostaje)', /bez promocji na pierwszy|nie ma promocji na pierwszy|nie ma taniego pierwszego|bez taniego pierwszego/i],
    ['„ta sama cena przy odnowieniu” przy rabacie na start', /ta sama cena przy odnowieniu|tyle samo co w pierwszym|odnowienie bez podwyżki/i],
    ['autoskalowanie „nie zaskoczy” (decyzja 6)', /zaskoczyć rachunkiem|nigdy więcej niż limit|miesięczny limit/i],
    ['sklep „bez przerwy w sprzedaży” (decyzja 13)', /bez przerwy w sprzedaży/i],
    ['„zwrot do 100%” zamiast rekompensaty w kredytach (A2-11)', /zwrot do 100%/i],
  ];

  it.each(ZAKAZANE)('nigdzie: %s', (_opis, wzor) => {
    const zle = zakres.filter((p) => wzor.test(readFileSync(p, 'utf8'))).map((p) => relative(SRC, p));
    expect(zle).toEqual([]);
  });

  it('stopka: SLA z rekompensatą przyznawaną automatycznie', () => {
    expect(DEFAULT_PAY).toContain('automatycznie');
    expect(DEFAULT_PAY).not.toContain('na wniosek');
  });

  it('sklep: kilka minut przerwy w zamówieniach przy przełączeniu, o wybranej porze', async () => {
    const t = tekst(renderToStaticMarkup(await Sklep.default()));
    expect(t).toContain('kilka minut przerwy');
    expect(t).toContain('o wybranej');
  });
});

describe('P2-09 — Black Friday wszędzie na tych samych założeniach', () => {
  const bf = kosztPiku(PRZYKLAD_BLACK_FRIDAY.vcpu, PRZYKLAD_BLACK_FRIDAY.ramGb, PRZYKLAD_BLACK_FRIDAY.godziny, CENY_ZAPASOWE.stawki);

  it('/hosting/sklep liczy procesor i pamięć jak /hosting (+4 vCPU, +8 GB, 36 h)', async () => {
    expect(PRZYKLAD_BLACK_FRIDAY).toEqual({ vcpu: 4, ramGb: 8, godziny: 36 });
    const t = tekst(renderToStaticMarkup(await Sklep.default()));
    expect(t).toContain(`${formatZl(bf)} zł brutto`);
    expect(t).toContain(`${formatZl(netto(bf))} zł netto`);
  });

  it('kalkulator w /cennik startuje od tego samego przykładu, miesiąc = 730 h jak w panelu, netto obok brutto', () => {
    const t = tekst(renderToStaticMarkup(<AKalkulator wariant="pelny" ceny={CENY_ZAPASOWE} />));
    expect(t).toContain(`${formatZl(bf)} zł`);
    expect(t).toContain('cały miesiąc (730 h)');
    expect(t).toContain(`${formatZl(netto(bf))} zł netto`);
  });
});

describe('P5-10 — specyfikacja odpowiada na pytania programisty', () => {
  const wiersze = Object.fromEntries(sekcjeSpecyfikacji(CENY_ZAPASOWE.stawki).flatMap((s) => s.wiersze).map(([k, v]) => [k, v]));

  it('PHP 8.4 i 8.5 (decyzja 14), starsze z dopiskiem o braku poprawek bezpieczeństwa', () => {
    expect(wiersze.PHP).toContain('8.5');
    expect(wiersze.PHP).toContain('8.4');
    expect(wiersze.PHP).toContain('bez poprawek bezpieczeństwa');
  });

  it('logi, limity PHP z liczbami, SSH z Composerem, API i rekompensata automatycznie', () => {
    expect(wiersze.Logi).toContain('błędów');
    expect(wiersze['Limity PHP (php.ini)']).toMatch(/memory_limit od 32 do 2048 MB/);
    expect(wiersze['SSH i Git']).toContain('Composer');
    expect(wiersze.API).toContain('webhooki');
    expect(wiersze.Rekompensata).toMatch(/^automatycznie/);
    expect(wiersze['Limit kosztu autoskalowania']).toContain('na 30 dni');
  });
});

describe('P3-11 / P3-06 — dla agencji', () => {
  it('/dla-agencji przekierowuje na /reseller', () => {
    expect(PRZEKIEROWANIA).toContainEqual({ source: '/dla-agencji', destination: '/reseller', permanent: true });
  });

  it('„Zostań partnerem” i „Odbierz swój link” prowadzą na rejestrację z celem w panelu, nie na logowanie', async () => {
    expect(ZOSTAN_PARTNEREM).toBe(`https://panel.verris.pl/register?next=${encodeURIComponent('/dashboard/reseller')}`);
    expect(ODBIERZ_LINK).toBe(`https://panel.verris.pl/register?next=${encodeURIComponent('/dashboard/referral')}`);
    const r = renderToStaticMarkup(await Reseller.default());
    const p = renderToStaticMarkup(await Polecaj.default());
    expect(r).toContain(ZOSTAN_PARTNEREM.replace(/&/g, '&amp;'));
    expect(p).toContain(ODBIERZ_LINK.replace(/&/g, '&amp;'));
    expect(r).not.toContain('href="https://panel.verris.pl"');
    expect(p).not.toContain('href="https://panel.verris.pl"');
  });

  it('reseller mówi wprost, co daje marka dziś (maile), a czego nie ma (panel i faktury pod marką)', async () => {
    const t = tekst(renderToStaticMarkup(await Reseller.default()));
    expect(t).toContain('nazwa i logo w mailach do klientów');
    expect(t).toContain('Panelu i faktur pod własną marką nie oferujemy');
    expect(t).not.toMatch(/white[- ]label/i);
  });
});

describe('A2-04 / A2-05 — cookies zgodne z faktycznymi plikami (Consent Mode podstawowy — decyzja 22)', () => {
  it('opis mówi, że przed decyzją nic nie idzie do Google ani Meta', () => {
    expect(OPIS_KATEGORII.przedDecyzja).toContain('nie ładujemy narzędzi Google ani Meta');
    expect(OPIS_KATEGORII.przedDecyzja).not.toMatch(/sygnał|tryb(ie)? ograniczon/);
    expect(OPIS_KATEGORII.funkcjonalne).toContain('narzędziom Google');
  });

  it('UTM z formularza /beta zostaje w przeglądarce tylko po zgodzie analitycznej albo marketingowej', () => {
    expect(wolnoZapamietacUtm(null)).toBe(false);
    expect(wolnoZapamietacUtm({ analytics: false, marketing: false })).toBe(false);
    expect(wolnoZapamietacUtm({ analytics: true, marketing: false })).toBe(true);
    expect(wolnoZapamietacUtm({ analytics: false, marketing: true })).toBe(true);
  });

  it('asystent nie zapisuje pustej sesji (wcześniej klucz verris:asystent na każdej stronie, także przy wyłączonym)', () => {
    const setItem = jest.fn();
    zapiszSesje({ setItem }, { rozmowaId: null, wiadomosci: [], wymiany: 0 });
    expect(setItem).not.toHaveBeenCalled();
    zapiszSesje({ setItem }, { rozmowaId: 'r1', wiadomosci: [], wymiany: 0 });
    expect(setItem).toHaveBeenCalledTimes(1);
  });
});

describe('P4-6 — pływające elementy ustępują formularzom', () => {
  it('atrybut tylko wtedy, gdy któryś formularz jest na ekranie', () => {
    const a = {} as Element;
    const b = {} as Element;
    expect(formularzWidoczny(new Map())).toBe(false);
    expect(formularzWidoczny(new Map([[a, false], [b, false]]))).toBe(false);
    expect(formularzWidoczny(new Map([[a, false], [b, true]]))).toBe(true);
  });
});

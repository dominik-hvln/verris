/**
 * Wspólne klocki z makiety 1.11.2026: render na serwerze (bez JS) i podstawowa dostępność.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { CENY_ZAPASOWE } from '@/lib/ceny';
import { KartyUslug, Poradniki } from './KartyUslug';
import { MobilnyPasek, pasekWidoczny } from './MobilnyPasek';
import { PasekDostepnosci } from './PasekDostepnosci';
import { PasRozmowy, GODZINY_ODDZWANIANIA } from './PasRozmowy';
import { PrzelacznikCeny } from './PrzelacznikCeny';
import { SectionHead2 } from './ui';

describe('PrzelacznikCeny', () => {
  const html = renderToStaticMarkup(<PrzelacznikCeny cena={CENY_ZAPASOWE.hosting} nazwa="Hosting Verris" />);

  it('bez JS pokazuje cenę roczną brutto z podpisem netto', () => {
    expect(html).toContain('449 zł');
    expect(html).toContain('365,04 zł netto');
  });

  it('przełączniki to przyciski z aria-pressed, rabat roczny liczony z cen', () => {
    expect(html.match(/<button type="button" aria-pressed="(true|false)"/g)).toHaveLength(4);
    expect(html).toContain('Rocznie −16%');
  });
});

describe('PasRozmowy', () => {
  const html = renderToStaticMarkup(<PasRozmowy />);

  it('pola z etykietami, pora jako radio w fieldset z legend', () => {
    expect(html).toMatch(/<label for="porozmawiajmy-imie">Imię<\/label>/);
    expect(html).toMatch(/<label for="porozmawiajmy-tel">Telefon<\/label>/);
    expect(html).toMatch(/<fieldset class="pasrozm-pora"><legend>Kiedy zadzwonić\?<\/legend>/);
    expect(html.match(/type="radio"/g)).toHaveLength(3);
  });

  it('godziny oddzwaniania z decyzji 1.11', () => {
    expect(html).toContain(GODZINY_ODDZWANIANIA);
    expect(GODZINY_ODDZWANIANIA).toBe('Oddzwonimy w dni robocze 9–17, zwykle tego samego dnia.');
  });
});

describe('KartyUslug i Poradniki', () => {
  it('strona pomija własną usługę', () => {
    const html = renderToStaticMarkup(<KartyUslug pomin={['poczta']} />);
    expect(html).not.toContain('href="/poczta"');
    expect(html).toContain('href="/domeny"');
    expect(html).toContain('powiaz-karty n3');
  });

  it('pominięty poradnik zastępuje kolejny, zawsze trzy karty', () => {
    const html = renderToStaticMarkup(<Poradniki pomin={['z-cpanel']} />);
    expect(html.match(/class="card porad"/g)).toHaveLength(3);
    expect(html).toContain('/przenies-strone/z-ftp');
  });
});

describe('MobilnyPasek', () => {
  it('po renderze na serwerze ukryty i nieklikalny (pokaże się dopiero po przewinięciu)', () => {
    const html = renderToStaticMarkup(<MobilnyPasek tytul="Przeniesienie 0 zł" przycisk="Przenieś" href="/przenies-strone" />);
    expect(html).toMatch(/<div class="mpasek" aria-hidden="true" inert=""/);
    expect(html).toContain('aria-label="Ukryj pasek"');
  });

  it('widoczny po ~1,5 ekranu, schowany na ostatnim ekranie', () => {
    expect(pasekWidoczny(500, 800, 8000)).toBe(false);
    expect(pasekWidoczny(1300, 800, 8000)).toBe(true);
    expect(pasekWidoczny(7000, 800, 8000)).toBe(false);
  });
});

describe('PasekDostepnosci', () => {
  it('słupki to przyciski z opisem dnia, podsumowanie 30 dni', () => {
    const html = renderToStaticMarkup(
      <PasekDostepnosci
        dane={{ d30: 99.73, h24: 100, dni: [{ data: '2026-10-13', klasa: 'awaria', dostepnosc: 72.22 }] }}
      />,
    );
    expect(html).toMatch(/<button type="button" class="pdost-d" data-k="awaria" aria-pressed="false" aria-label="13 paź: awaria · dostępność 72,22%"/);
    expect(html).toContain('30 dni: 99,73% · dziś 100%');
  });
});

it('SectionHead2: eyebrow, h2 i opis', () => {
  const html = renderToStaticMarkup(<SectionHead2 eyebrow="Cennik" title="Jedna cena" lead="Opis" id="cennik-h" />);
  expect(html).toBe('<div class="shead2"><div class="shead2-t"><p class="kicker">Cennik</p><h2 id="cennik-h">Jedna cena</h2></div><p class="lead">Opis</p></div>');
});

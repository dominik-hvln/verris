/**
 * @jest-environment jsdom
 */
import { opisElementu, selektorElementu } from './uwaga-z-bety';

/** Beta „Zgłoś uwagę” — opis wskazanego elementu dla obsługi: co to jest, w której sekcji, jak go znaleźć. */
const OKNO = { szer: 1280, wys: 800 };
const strona = (html: string) => {
  document.body.innerHTML = html;
  return (sel: string) => document.querySelector(sel)!;
};

describe('opisElementu', () => {
  it('pole formularza: etykieta, nigdy wpisana wartość (hasło)', () => {
    const $ = strona('<form><h2>Bezpieczeństwo</h2><label for="haslo">Nowe hasło</label><input id="haslo" type="password" value="Tajne123!"></form>');
    const o = opisElementu($('#haslo'), OKNO);
    expect(o.opis).toBe('pole „Nowe hasło”');
    expect(o.sekcja).toBe('Bezpieczeństwo');
    expect(JSON.stringify(o)).not.toContain('Tajne123');
  });

  it('pole bez etykiety: placeholder; pole w <label>: tekst etykiety', () => {
    const $ = strona('<input id="a" placeholder="Szukaj domeny"><label>Imię <input id="b" value="Jan"></label>');
    expect(opisElementu($('#a'), OKNO).opis).toBe('pole „Szukaj domeny”');
    expect(opisElementu($('#b'), OKNO).opis).toBe('pole „Imię”');
  });

  it('ikona w linku → link z nazwą z aria-label', () => {
    const $ = strona('<nav><a href="/x" aria-label="Pliki"><svg id="ikona"></svg></a></nav>');
    expect(opisElementu($('#ikona'), OKNO).opis).toBe('link „Pliki”');
  });

  it('rola ARIA ma pierwszeństwo przed tagiem; długi tekst skrócony', () => {
    const $ = strona(`<div role="tab" id="t">Ustawienia ${'bardzo '.repeat(20)}długie</div>`);
    const o = opisElementu($('#t'), OKNO);
    expect(o.opis.startsWith('zakładka „Ustawienia bardzo')).toBe(true);
    expect(o.opis.endsWith('…”')).toBe(true);
  });

  it('bez nagłówka w sekcji → nagłówek strony (h1); położenie i okno zaokrąglone', () => {
    const $ = strona('<h1>Płatności</h1><main><p id="p">Saldo</p></main>');
    const o = opisElementu($('#p'), { szer: 390.4, wys: 844.6 });
    expect(o).toMatchObject({ opis: 'tekst „Saldo”', sekcja: 'Płatności', okno: { szer: 390, wys: 845 } });
  });
});

describe('selektorElementu', () => {
  it('nth-of-type przy rodzeństwie tego samego typu, stałe id kończy ścieżkę', () => {
    const $ = strona('<main id="tresc"><section><ul><li>a</li><li><button>b</button></li></ul></section></main>');
    expect(selektorElementu($('li:nth-child(2) > button'))).toBe('main#tresc > section > ul > li:nth-of-type(2) > button');
  });

  it('id z React useId (zmienne między renderami) pomijane', () => {
    const $ = strona('<div><span id=":r5:"><b>x</b></span></div>');
    expect(selektorElementu($('b'))).toBe('div > span > b');
  });
});

/**
 * @jest-environment jsdom
 */
import { ATRYBUT_POMIN, ATRYBUT_PRYWATNE, filtrZrzutu, prywatneProstokaty, stronaZSekretami } from './zrzut-strony';

/**
 * A1-03 — „Zgłoś uwagę” domyślnie dołączało zrzut z pełnym, działającym tokenem API (i kodem QR 2FA). Treść
 * elementów oznaczonych `data-prywatne` nie wchodzi do klonu strony, a na stronach bezpieczeństwa zrzut jest
 * domyślnie odznaczony.
 */
function dom(html: string) {
  document.body.innerHTML = html;
  return document.body;
}

describe('A1-03 — filtr klonowania zrzutu', () => {
  it('treść elementu prywatnego (tekst i dzieci) nie trafia do klonu; sam element zostaje jako puste pole', () => {
    const b = dom(`<section><p>Skopiuj token</p><code ${ATRYBUT_PRYWATNE}>vrs_live_SEKRET<b>x</b></code></section>`);
    const code = b.querySelector('code')!;
    expect(filtrZrzutu(code)).toBe(true);
    for (const dziecko of code.childNodes) expect(filtrZrzutu(dziecko)).toBe(false);
    expect(filtrZrzutu(b.querySelector('p')!.firstChild!)).toBe(true);
  });

  it('obraz, płótno i pole oznaczone jako prywatne znikają całe (QR, pokazane hasło)', () => {
    const b = dom(`<img ${ATRYBUT_PRYWATNE} src="data:image/svg+xml,qr"><input ${ATRYBUT_PRYWATNE} value="haslo"><div ${ATRYBUT_PRYWATNE}><img src="x"></div>`);
    expect(filtrZrzutu(b.querySelector('img')!)).toBe(false);
    expect(filtrZrzutu(b.querySelector('input')!)).toBe(false);
    expect(filtrZrzutu(b.querySelector('div img')!)).toBe(false);
  });

  it('UI zgłoszenia nie trafia na zrzut, zwykłe elementy — tak', () => {
    const b = dom(`<div ${ATRYBUT_POMIN}>Zgłoś uwagę</div><main>treść</main>`);
    expect(filtrZrzutu(b.querySelector(`[${ATRYBUT_POMIN}]`)!)).toBe(false);
    expect(filtrZrzutu(b.querySelector('main')!)).toBe(true);
  });
});

describe('A1-03 — prostokąty do zamazania', () => {
  it('tylko najbardziej zewnętrzne, widoczne w oknie', () => {
    const b = dom(`<div id="a" ${ATRYBUT_PRYWATNE}><span ${ATRYBUT_PRYWATNE}>x</span></div><div id="poza" ${ATRYBUT_PRYWATNE}></div>`);
    const prostokat = (x: number, y: number, w: number, h: number) => () => ({ left: x, top: y, width: w, height: h, right: x + w, bottom: y + h }) as DOMRect;
    b.querySelector('#a')!.getBoundingClientRect = prostokat(10, 20, 300, 40);
    b.querySelector('#poza')!.getBoundingClientRect = prostokat(10, 2000, 300, 40);
    expect(prywatneProstokaty(document, { szer: 1280, wys: 800 })).toEqual([{ x: 10, y: 20, szer: 300, wys: 40 }]);
  });
});

describe('A1-03 — zrzut domyślnie odznaczony na stronach z sekretami', () => {
  it('strony bezpieczeństwa i konta', () => {
    const b = dom('<main>zwykła strona</main>');
    for (const s of ['/dashboard/api-tokens', '/dashboard/settings', '/dashboard/webhooks/x', '/dashboard/iam']) expect(stronaZSekretami(s, b)).toBe(true);
    expect(stronaZSekretami('/dashboard/services/abc', b)).toBe(false);
    expect(stronaZSekretami('/dashboard/settingsy', b)).toBe(false);
  });

  it('dowolna strona, na której widać element prywatny albo pole hasła', () => {
    expect(stronaZSekretami('/dashboard/vps', dom(`<code ${ATRYBUT_PRYWATNE}>hasło root</code>`))).toBe(true);
    expect(stronaZSekretami('/dashboard/services/abc', dom('<input type="password">'))).toBe(true);
  });
});

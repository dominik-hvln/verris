/**
 * @jest-environment jsdom
 */
import { kodMostu } from '@verris/kreator';

/**
 * Paczka 122 – mostek edycji na stronie w ramce podglądu (jsdom). Ramka = prawdziwy <iframe> w dokumencie testu,
 * mostek działa w jej oknie. jsdom nie ustawia `event.source` w postMessage, więc rodzica ramki zastępuje obiekt
 * z `postMessage` zbierającym wiadomości (te same, które w przeglądarce dostaje edytor), a wiadomości „od edytora”
 * mają `source` = ten obiekt.
 */

interface Wiadomosc {
  v: number;
  typ: string;
  [k: string]: unknown;
}

const STRONA =
  '<header class="naglowek"><a class="logo" href="./"><span class="logo-nazwa" data-k="firma.nazwa" data-k-max="80">Salon Ola</span></a></header>' +
  '<main>' +
  '<section id="hero" data-k-sekcja="hero"><h1 data-k="strony.0.sekcje.0.dane.naglowek" data-k-max="20">Fryzjer <em class="wyr">z pasją</em></h1>' +
  '<a class="btn" href="#kontakt" data-k="strony.0.sekcje.0.dane.przyciski.0.etykieta" data-k-max="40">Umów wizytę</a>' +
  '<div class="ob" data-k-obraz="strony.0.sekcje.0.dane.obraz"><img alt="Wnętrze" src="data:,"></div></section>' +
  '<section id="faq" data-k-sekcja="faq"><h2 data-k="strony.0.sekcje.1.dane.naglowek" data-k-max="120">Pytania</h2>' +
  '<p data-k="strony.0.sekcje.1.dane.pytania.0.odpowiedz" data-k-max="1200" data-k-wiele="1">Pierwsza linia</p>' +
  '<p class="cena" data-k-formularz="strony.0.sekcje.1.dane.pakiety.0.cenaBrutto">99 zł</p>' +
  '<a class="inny" href="https://example.com/">Link</a><button type="button" class="karuzela-btn">Dalej</button></section>' +
  '</main>' +
  '<footer><span class="logo-nazwa" data-k="firma.nazwa" data-k-max="80">Salon Ola</span></footer>';

let ramka: HTMLIFrameElement;
let odebrane: Wiadomosc[];
let rodzic: { postMessage: (m: Wiadomosc, cel: string) => void };

async function zaladuj(tryb: 'edycja' | 'zaznacz', przed?: (w: Window) => void) {
  ramka = document.createElement('iframe');
  document.body.appendChild(ramka);
  const w = ramka.contentWindow!;
  rodzic = {
    postMessage: (m, cel) => {
      expect(cel).toBe('*');
      odebrane.push(JSON.parse(JSON.stringify(m)) as Wiadomosc);
    },
  };
  Object.defineProperty(w, 'parent', { configurable: true, get: () => rodzic });
  przed?.(w);
  const d = ramka.contentDocument!;
  d.open();
  d.write(`<!doctype html><html><head></head><body>${STRONA}</body></html>`);
  d.close();
  const s = d.createElement('script');
  s.textContent = kodMostu({ tryb });
  d.body.appendChild(s);
  await chwila();
  return { w, d };
}
const chwila = () => new Promise((r) => setTimeout(r, 0));
const ostatnia = (typ: string) => [...odebrane].reverse().find((m) => m.typ === typ);
const k = (d: Document, sciezka: string) => [...d.querySelectorAll<HTMLElement>('[data-k]')].find((e) => e.getAttribute('data-k') === sciezka)!;

function klik(el: Element) {
  el.dispatchEvent(new (el.ownerDocument.defaultView as Window & typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true }));
}
function klawisz(el: Element, key: string, opcje: KeyboardEventInit = {}) {
  const e = new (el.ownerDocument.defaultView as Window & typeof globalThis).KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opcje });
  el.dispatchEvent(e);
  return e;
}
function wpiszNaKoniec(el: HTMLElement, tekst: string) {
  el.appendChild(el.ownerDocument.createTextNode(tekst));
}
function wklej(el: HTMLElement, dane: Record<string, string>) {
  const W = el.ownerDocument.defaultView as Window & typeof globalThis;
  const e = new W.Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(e, 'clipboardData', { value: { getData: (t: string) => dane[t] ?? '' } });
  el.dispatchEvent(e);
  return e;
}
function kursorNaKoncu(el: HTMLElement) {
  const d = el.ownerDocument;
  const r = d.createRange();
  r.selectNodeContents(el);
  r.collapse(false);
  const sel = d.defaultView!.getSelection()!;
  sel.removeAllRanges();
  sel.addRange(r);
}

beforeEach(() => {
  odebrane = [];
});
afterEach(() => {
  ramka?.remove();
});

describe('mostek – tryb edycji', () => {
  it('start: elementy dostają tabindex, obraz rolę przycisku, mostek zgłasza gotowość (v:1)', async () => {
    const { d } = await zaladuj('edycja');
    expect(k(d, 'strony.0.sekcje.1.dane.naglowek').getAttribute('tabindex')).toBe('0');
    // Link jest już fokusowalny – bez tabindex.
    expect(k(d, 'strony.0.sekcje.0.dane.przyciski.0.etykieta').hasAttribute('tabindex')).toBe(false);
    expect(d.querySelector('[data-k-obraz]')!.getAttribute('role')).toBe('button');
    expect(ostatnia('gotowe')).toEqual({ v: 1, typ: 'gotowe', scrollY: 0 });
    // Pasek w Shadow DOM: jedyny nowy element strony.
    expect(d.querySelectorAll('verris-edycja').length).toBe(1);
    expect(d.querySelector('verris-edycja')!.shadowRoot!.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Działania sekcji');
  });

  it('klik w tekst → contenteditable plaintext-only i zaznaczenie sekcji; Enter kończy i wysyła {typ:"tekst"}', async () => {
    const { d } = await zaladuj('edycja');
    const h2 = k(d, 'strony.0.sekcje.1.dane.naglowek');
    klik(h2);
    expect(h2.getAttribute('contenteditable')).toBe('plaintext-only');
    expect(h2.getAttribute('role')).toBe('textbox');
    expect(d.activeElement).toBe(h2);
    expect(d.querySelector('#faq')!.hasAttribute('data-kreator-zaznaczona')).toBe(true);
    wpiszNaKoniec(h2, ' i odpowiedzi');
    klawisz(h2, 'Enter');
    expect(h2.hasAttribute('contenteditable')).toBe(false);
    expect(h2.hasAttribute('role')).toBe(false);
    await chwila();
    expect(ostatnia('zaznacz')).toEqual({ v: 1, typ: 'zaznacz', sekcja: 'faq' });
    expect(ostatnia('tekst')).toEqual({ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.1.dane.naglowek', wartosc: 'Pytania i odpowiedzi' });
  });

  it('Esc cofa zmianę i przywraca dokładnie te węzły (wyróżnienie <em>), bez wiadomości', async () => {
    const { d } = await zaladuj('edycja');
    const h1 = k(d, 'strony.0.sekcje.0.dane.naglowek');
    klik(h1);
    h1.textContent = 'Coś zupełnie innego';
    klawisz(h1, 'Escape');
    expect(h1.querySelector('em.wyr')?.textContent).toBe('z pasją');
    expect(h1.textContent).toBe('Fryzjer z pasją');
    await chwila();
    expect(ostatnia('tekst')).toBeUndefined();
  });

  it('blur zapisuje; ta sama ścieżka w innym miejscu strony (stopka) dostaje nowy tekst', async () => {
    const { d } = await zaladuj('edycja');
    const [naglowek, stopka] = [...d.querySelectorAll<HTMLElement>('.logo-nazwa')];
    klik(naglowek!);
    naglowek!.textContent = 'Salon Ala';
    naglowek!.blur();
    await chwila();
    expect(ostatnia('tekst')).toEqual({ v: 1, typ: 'tekst', sciezka: 'firma.nazwa', wartosc: 'Salon Ala' });
    expect(stopka!.textContent).toBe('Salon Ala');
  });

  it('wklejenie HTML → czysty tekst, przycięty do limitu; licznik przy elemencie', async () => {
    const { d } = await zaladuj('edycja');
    const h1 = k(d, 'strony.0.sekcje.0.dane.naglowek'); // limit 20, tekst 15 znaków
    klik(h1);
    kursorNaKoncu(h1);
    const e = wklej(h1, { 'text/html': '<b onclick="x()">Bardzo</b>', 'text/plain': ' Bardzo długi tekst' });
    expect(e.defaultPrevented).toBe(true);
    expect(h1.querySelector('b')).toBeNull();
    expect(h1.textContent).toBe('Fryzjer z pasją Bard');
    const licznik = d.querySelector('verris-edycja')!.shadowRoot!.querySelector('.licznik')!;
    expect(licznik.textContent).toBe('20 / 20');
    expect(licznik.classList.contains('pelny')).toBe(true);
    klawisz(h1, 'Enter');
    await chwila();
    expect(ostatnia('tekst')?.wartosc).toBe('Fryzjer z pasją Bard');
  });

  it('pisanie znak po znaku (keydown → beforeinput → wstawienie przez przeglądarkę → input): każdy znak raz, licznik zgodny', async () => {
    const { d } = await zaladuj('edycja');
    const W = d.defaultView as Window & typeof globalThis;
    const h2 = k(d, 'strony.0.sekcje.1.dane.naglowek');
    klik(h2);
    kursorNaKoncu(h2);
    for (const znak of ' i odpowiedzi!') {
      const kd = klawisz(h2, znak);
      const bi = new W.InputEvent('beforeinput', { bubbles: true, cancelable: true, inputType: 'insertText', data: znak });
      h2.dispatchEvent(bi);
      // Domyślne zachowanie przeglądarki: wstawienie znaku, jeśli ani keydown, ani beforeinput go nie zablokowały.
      if (!kd.defaultPrevented && !bi.defaultPrevented) wpiszNaKoniec(h2, znak);
      h2.dispatchEvent(new W.InputEvent('input', { bubbles: true, inputType: 'insertText', data: znak }));
    }
    expect(h2.textContent).toBe('Pytania i odpowiedzi!');
    expect(d.querySelector('verris-edycja')!.shadowRoot!.querySelector('.licznik')!.textContent).toBe('21 / 120');
    klawisz(h2, 'Enter');
    await chwila();
    expect(odebrane.filter((m) => m.typ === 'tekst')).toEqual([{ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.1.dane.naglowek', wartosc: 'Pytania i odpowiedzi!' }]);
  });

  it('pole wielowierszowe: Enter wstawia nową linię (zapis jako \\n), wartość bez znaków sterujących', async () => {
    const { d } = await zaladuj('edycja');
    const p = k(d, 'strony.0.sekcje.1.dane.pytania.0.odpowiedz');
    klik(p);
    expect(p.getAttribute('aria-multiline')).toBe('true');
    kursorNaKoncu(p);
    klawisz(p, 'Enter');
    expect(p.hasAttribute('contenteditable')).toBe(true);
    wklej(p, { 'text/plain': 'Druga\u0007 linia' });
    p.blur();
    await chwila();
    expect(ostatnia('tekst')).toEqual({ v: 1, typ: 'tekst', sciezka: 'strony.0.sekcje.1.dane.pytania.0.odpowiedz', wartosc: 'Pierwsza linia\nDruga linia' });
  });

  it('przeglądarka bez plaintext-only: contenteditable="true", wklejanie dalej jako tekst, <br> → spacja w polu jednowierszowym', async () => {
    const { d } = await zaladuj('edycja', (w) => {
      Object.defineProperty((w as Window & typeof globalThis).HTMLElement.prototype, 'contentEditable', {
        configurable: true,
        get: () => 'inherit',
        set: (v: string) => {
          if (v === 'plaintext-only') throw new SyntaxError('nieobsługiwane');
        },
      });
    });
    const h2 = k(d, 'strony.0.sekcje.1.dane.naglowek');
    klik(h2);
    expect(h2.getAttribute('contenteditable')).toBe('true');
    kursorNaKoncu(h2);
    expect(wklej(h2, { 'text/plain': ' <img src=x onerror=alert(1)>' }).defaultPrevented).toBe(true);
    expect(h2.querySelector('img')).toBeNull();
    h2.appendChild(d.createElement('br'));
    wpiszNaKoniec(h2, 'dalej');
    h2.blur();
    await chwila();
    expect(ostatnia('tekst')?.wartosc).toBe('Pytania <img src=x onerror=alert(1)> dalej');
    expect(h2.querySelector('br')).toBeNull();
  });

  it('klik w link/przycisk nie nawiguje; link z tekstem edytuje etykietę; przyciski strony działają', async () => {
    const { d } = await zaladuj('edycja');
    const zwykly = d.querySelector<HTMLAnchorElement>('a.inny')!;
    const ev = new (d.defaultView as Window & typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true });
    zwykly.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    const btn = k(d, 'strony.0.sekcje.0.dane.przyciski.0.etykieta');
    const ev2 = new (d.defaultView as Window & typeof globalThis).MouseEvent('click', { bubbles: true, cancelable: true });
    btn.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
    expect(btn.getAttribute('contenteditable')).toBe('plaintext-only');
    const strony = jest.fn();
    d.querySelector('.karuzela-btn')!.addEventListener('click', strony);
    klik(d.querySelector('.karuzela-btn')!);
    expect(strony).toHaveBeenCalled();
  });

  it('obraz → {typ:"obraz"}, cena → polecenie "opcje" ze ścieżką pola, pasek sekcji → polecenia', async () => {
    const { d } = await zaladuj('edycja');
    klik(d.querySelector('[data-k-obraz] img')!);
    klik(d.querySelector('[data-k-formularz]')!);
    await chwila();
    expect(ostatnia('obraz')).toEqual({ v: 1, typ: 'obraz', sciezka: 'strony.0.sekcje.0.dane.obraz' });
    expect(ostatnia('polecenie')).toEqual({ v: 1, typ: 'polecenie', sekcja: 'faq', polecenie: 'opcje', sciezka: 'strony.0.sekcje.1.dane.pakiety.0.cenaBrutto' });
    const cien = d.querySelector('verris-edycja')!.shadowRoot!;
    const pasek = cien.querySelector<HTMLElement>('[role="toolbar"]')!;
    expect(pasek.hidden).toBe(false);
    // Ostatnia sekcja – „w dół” nieaktywne.
    expect(cien.querySelector('[data-polecenie="w-dol"]')!.getAttribute('aria-disabled')).toBe('true');
    klik(cien.querySelector('[data-polecenie="w-gore"]')!);
    klik(cien.querySelector('[data-polecenie="w-dol"]')!);
    klik(cien.querySelector('[data-polecenie="ai"]')!);
    await chwila();
    const polecenia = odebrane.filter((m) => m.typ === 'polecenie').map((m) => m.polecenie);
    expect(polecenia).toEqual(['opcje', 'w-gore', 'ai']);
  });

  it('wiadomości z edytora: „zaznaczono” podświetla sekcję, „tekst-z-zewnatrz” ustawia tekst (bez HTML); obce źródło ignorowane', async () => {
    const { w, d } = await zaladuj('edycja');
    const W = w as Window & typeof globalThis;
    w.dispatchEvent(new W.MessageEvent('message', { data: { v: 1, typ: 'zaznaczono', sekcja: 'hero' }, source: rodzic as unknown as Window }));
    expect(d.querySelector('#hero')!.hasAttribute('data-kreator-zaznaczona')).toBe(true);
    // Miniatura w skali 0,5 – pasek powiększony odwrotnie (czytelny); skala spoza (0, 1] ignorowana.
    const pasek = d.querySelector('verris-edycja')!.shadowRoot!.querySelector<HTMLElement>('[role="toolbar"]')!;
    w.dispatchEvent(new W.MessageEvent('message', { data: { v: 1, typ: 'skala', skala: 0.5 }, source: rodzic as unknown as Window }));
    expect(pasek.style.transform).toBe('scale(2)');
    w.dispatchEvent(new W.MessageEvent('message', { data: { v: 1, typ: 'skala', skala: 7 }, source: rodzic as unknown as Window }));
    expect(pasek.style.transform).toBe('scale(2)');
    w.dispatchEvent(new W.MessageEvent('message', { data: { v: 1, typ: 'tekst-z-zewnatrz', sciezka: 'firma.nazwa', wartosc: '<b>Nowa</b>' }, source: rodzic as unknown as Window }));
    expect(d.querySelectorAll('.logo-nazwa b').length).toBe(0);
    expect([...d.querySelectorAll('.logo-nazwa')].map((e) => e.textContent)).toEqual(['<b>Nowa</b>', '<b>Nowa</b>']);
    // Wiadomość nie od rodzica (np. z innej ramki) – bez zmian.
    w.dispatchEvent(new W.MessageEvent('message', { data: { v: 1, typ: 'tekst-z-zewnatrz', sciezka: 'firma.nazwa', wartosc: 'Obca' }, source: w }));
    expect(d.querySelector('.logo-nazwa')!.textContent).toBe('<b>Nowa</b>');
  });

  it('klawiatura: Enter na elemencie zaczyna edycję; Ctrl+Z poza edycją → skrót do edytora', async () => {
    const { d } = await zaladuj('edycja');
    const h2 = k(d, 'strony.0.sekcje.1.dane.naglowek');
    h2.focus();
    klawisz(h2, 'Enter');
    expect(h2.getAttribute('contenteditable')).toBe('plaintext-only');
    // W trakcie edycji Ctrl+Z zostaje w elemencie (cofanie przeglądarki).
    klawisz(h2, 'z', { ctrlKey: true });
    klawisz(h2, 'Escape');
    klawisz(h2, 'z', { ctrlKey: true });
    klawisz(h2, 'z', { metaKey: true, shiftKey: true });
    await chwila();
    expect(odebrane.filter((m) => m.typ === 'skrot').map((m) => m.skrot)).toEqual(['cofnij', 'ponow']);
  });
});

describe('mostek – tryb „zaznacz” (telefon)', () => {
  it('stuknięcie w tekst nie otwiera edycji – wysyła zaznaczenie sekcji ze ścieżką pola', async () => {
    const { d } = await zaladuj('zaznacz');
    const h2 = k(d, 'strony.0.sekcje.1.dane.naglowek');
    klik(h2);
    expect(h2.hasAttribute('contenteditable')).toBe(false);
    await chwila();
    expect(ostatnia('zaznacz')).toEqual({ v: 1, typ: 'zaznacz', sekcja: 'faq', sciezka: 'strony.0.sekcje.1.dane.naglowek' });
    expect(ostatnia('tekst')).toBeUndefined();
  });
});

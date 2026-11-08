/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { Obraz } from '@verris/kreator/klient';
import { WyborZdjecia, bladPliku } from './wybor-zdjecia';
import { importujZdjecie, listaZasobow, szukajZdjec } from './akcje';
import type { ZasobKreatora } from './typy';

/**
 * Paczka 122 – dialog wyboru zdjęcia: zakładki z klawiatury, siatka z biblioteki konta, wyszukiwarka bibliotek
 * zewnętrznych (miniatury przez proxy, import przez API), punkt ostrości, wymagany alt / „dekoracyjne”, odmowa
 * SVG/HEIC/za dużych plików przed wysłaniem, Esc zamyka.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
jest.mock('./akcje', () => ({
  listaZasobow: jest.fn(),
  szukajZdjec: jest.fn(),
  importujZdjecie: jest.fn(),
  adresyZasobow: jest.fn(),
  usunZasob: jest.fn(),
}));

const ZASOB: ZasobKreatora = {
  id: '3f2a9c4e-8b1d-4f6a-9c2e-1a2b3c4d5e6f',
  zrodlo: 'wlasne',
  autor: null,
  licencja: null,
  licencjaUrl: null,
  zrodloUrl: null,
  szerokosc: 1800,
  wysokosc: 1200,
  bajty: 400_000,
  alt: null,
  createdAt: '2026-11-08T10:00:00Z',
  adres: 'https://api.verris.test/kreator/z/abc/',
  miniatura: 'https://api.verris.test/kreator/z/abc/480.webp',
};
const OBRAZ: Obraz = { alt: '', zrodlo: 'placeholder', proporcje: '3:2', podpis: 'Zdjęcie: wnętrze', opisDoWyszukania: 'hair salon interior' };

let root: Root;
let el: HTMLDivElement;
beforeEach(() => {
  el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  jest.mocked(listaZasobow).mockResolvedValue({ ok: true, dane: { zasoby: [ZASOB], razem: 1, strona: 1, naStrone: 48, miejsce: { zajete: 400_000, limit: 500 * 1048576 } } });
  jest.mocked(szukajZdjec).mockResolvedValue({
    ok: true,
    dane: {
      dostawcy: [{ id: 'pixabay', nazwa: 'Pixabay' }, { id: 'openverse', nazwa: 'Openverse' }],
      dostawca: 'pixabay',
      zrodlo: 'Pixabay',
      wyniki: [{ id: '195893', miniatura: 'https://api.verris.test/kreator/biblioteka/m/tok', szerokosc: 4000, wysokosc: 2250, autor: 'Josch13', licencja: 'pixabay', zrodloUrl: 'https://pixabay.com/x' }],
      razem: 1,
      strona: 1,
      naStrone: 24,
    },
  });
  jest.mocked(importujZdjecie).mockResolvedValue({ ok: true, dane: { zasob: { ...ZASOB, id: '7b6c5d4e-3f2a-4b1c-8d9e-0f1a2b3c4d5e', zrodlo: 'pixabay', autor: 'Josch13', licencja: 'pixabay', licencjaUrl: 'https://pixabay.com/service/license-summary/', zrodloUrl: 'https://pixabay.com/x' } } });
});
afterEach(() => {
  act(() => root.unmount());
  el.remove();
  jest.clearAllMocks();
});

const czekaj = () => act(async () => {
  await new Promise((r) => setTimeout(r, 0));
});

async function otworz(props: Partial<Parameters<typeof WyborZdjecia>[0]> = {}) {
  const onWybierz = jest.fn();
  const onZamknij = jest.fn();
  await act(async () => {
    root.render(<WyborZdjecia obraz={OBRAZ} sciezka="strony.0.sekcje.0.dane.obraz" otwarty onWybierz={onWybierz} onZamknij={onZamknij} {...props} />);
  });
  return { onWybierz, onZamknij };
}

const zakladka = (nazwa: string) => [...document.querySelectorAll<HTMLElement>('[role="tab"]')].find((t) => t.textContent === nazwa)!;
const przycisk = (tekst: string) => [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === tekst)!;
const klawisz = (cel: Element, key: string) =>
  act(async () => {
    cel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    await new Promise((r) => setTimeout(r, 0));
  });

function wpisz(pole: HTMLInputElement, tekst: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(pole, tekst);
    pole.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('WyborZdjecia', () => {
  it('zakładki: strzałka w prawo przechodzi do „Twoje zdjęcia”, Enter w siatce wybiera; alt wymagany, „dekoracyjne” = pusty alt', async () => {
    const { onWybierz, onZamknij } = await otworz();
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    expect(zakladka('Wgraj').getAttribute('aria-selected')).toBe('true');
    zakladka('Wgraj').focus();
    await klawisz(zakladka('Wgraj'), 'ArrowRight');
    await czekaj();
    expect(zakladka('Twoje zdjęcia').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(zakladka('Twoje zdjęcia'));
    expect(listaZasobow).toHaveBeenCalledWith(1);
    const opcja = document.querySelector<HTMLElement>('[role="listbox"] [role="option"]')!;
    expect(opcja.querySelector('img')!.getAttribute('src')).toBe(ZASOB.miniatura);
    expect(document.body.textContent).toContain('1 zdjęcie');
    await klawisz(opcja, 'Enter');

    // Kadr: podgląd w proporcjach z modelu, alt wymagany.
    expect(document.body.textContent).toContain('Podgląd kadru (3:2)');
    await act(async () => przycisk('Użyj zdjęcia').click());
    expect(document.body.textContent).toContain('Opisz, co widać na zdjęciu');
    expect(onWybierz).not.toHaveBeenCalled();
    const dekoracja = document.querySelector<HTMLInputElement>('input[type=checkbox]')!;
    await act(async () => dekoracja.click());
    await act(async () => przycisk('Użyj zdjęcia').click());
    expect(onWybierz).toHaveBeenCalledTimes(1);
    const o = onWybierz.mock.calls[0]![0] as Obraz;
    expect(o).toMatchObject({ alt: '', zrodlo: 'wlasne', zasobId: ZASOB.id, szerokosc: 1800, wysokosc: 1200, proporcje: '3:2', podpis: 'Zdjęcie: wnętrze', ogniskowa: { x: 0.5, y: 0.5 } });
    expect(o.autor).toBeUndefined();
    expect(onZamknij).toHaveBeenCalled();
  });

  it('biblioteka: fraza z opisDoWyszukania, miniatury przez proxy API, źródło i licencja; „Użyj” importuje, punkt ostrości z kliknięcia', async () => {
    const { onWybierz } = await otworz({ stronaId: 's-1' });
    await act(async () => zakladka('Biblioteka').click());
    await czekaj();
    expect(szukajZdjec).toHaveBeenCalledWith({ q: 'hair salon interior', strona: 1 });
    expect(document.querySelector<HTMLInputElement>('input[role="searchbox"], form[role="search"] input')!.value).toBe('hair salon interior');
    const img = document.querySelector<HTMLImageElement>('[role="option"] img')!;
    expect(img.src).toBe('https://api.verris.test/kreator/biblioteka/m/tok');
    expect(document.body.textContent).toContain('Zdjęcia z Pixabay');
    // przełącznik dostawcy (radiogroup, nie natywny select)
    expect([...document.querySelectorAll('[role="radio"]')].map((r) => r.textContent)).toEqual(['Pixabay', 'Openverse']);
    expect(document.querySelector('select')).toBeNull();

    expect(przycisk('Użyj').disabled).toBe(true);
    await act(async () => document.querySelector<HTMLElement>('[role="option"]')!.click());
    expect(document.body.textContent).toContain('Autor: Josch13 · Licencja Pixabay');
    await act(async () => przycisk('Użyj').click());
    await czekaj();
    expect(importujZdjecie).toHaveBeenCalledWith({ dostawca: 'pixabay', id: '195893', stronaId: 's-1' });

    const suwak = document.querySelector<HTMLElement>('[role="slider"]')!;
    suwak.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 100, right: 200, bottom: 100, x: 0, y: 0, toJSON: () => ({}) });
    await act(async () => suwak.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50, clientY: 80 })));
    await klawisz(suwak, 'ArrowRight');
    expect(document.querySelector<HTMLImageElement>('img[data-kadr]')!.style.objectPosition).toBe('30% 80%');
    wpisz(document.querySelector<HTMLInputElement>('input:not([type])')!, 'Fotel fryzjerski przy oknie');
    await act(async () => przycisk('Użyj zdjęcia').click());
    expect(onWybierz.mock.calls[0]![0]).toMatchObject({
      alt: 'Fotel fryzjerski przy oknie',
      zrodlo: 'pixabay',
      zasobId: '7b6c5d4e-3f2a-4b1c-8d9e-0f1a2b3c4d5e',
      ogniskowa: { x: 0.3, y: 0.8 },
      autor: 'Josch13',
      licencja: 'pixabay',
      licencjaUrl: 'https://pixabay.com/service/license-summary/',
    });
  }, 10_000);

  it('wgrywanie: SVG, HEIC i za duży plik odrzucone przed wysłaniem, po polsku', async () => {
    expect(bladPliku({ name: 'logo.svg', size: 100, type: 'image/svg+xml' })).toMatch(/SVG nie są obsługiwane/);
    expect(bladPliku({ name: 'IMG_1.HEIC', size: 100, type: '' })).toMatch(/HEIC/);
    expect(bladPliku({ name: 'a.jpg', size: 16 * 1024 * 1024, type: 'image/jpeg' })).toMatch(/za duże.*limit 15 MB/);
    expect(bladPliku({ name: 'a.gif', size: 100, type: 'image/gif' })).toMatch(/nie jest obsługiwanym zdjęciem/);
    expect(bladPliku({ name: 'a.jpg', size: 100, type: 'image/jpeg' })).toBeNull();

    const wyslane = jest.fn();
    const Xhr = jest.fn(() => ({ open: jest.fn(), send: wyslane, upload: {} }));
    Object.assign(window, { XMLHttpRequest: Xhr });
    await otworz();
    const pole = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const plik = new File(['<svg/>'], 'logo.svg', { type: 'image/svg+xml' });
    Object.defineProperty(pole, 'files', { value: [plik], configurable: true });
    await act(async () => pole.dispatchEvent(new Event('change', { bubbles: true })));
    expect(document.querySelector('[role="alert"], .text-crit, [class*="crit"]')?.textContent ?? document.body.textContent).toMatch(/SVG nie są obsługiwane/);
    expect(wyslane).not.toHaveBeenCalled();
  });

  it('Esc zamyka dialog', async () => {
    const { onZamknij } = await otworz();
    await act(async () => void window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(onZamknij).toHaveBeenCalled();
  });
});

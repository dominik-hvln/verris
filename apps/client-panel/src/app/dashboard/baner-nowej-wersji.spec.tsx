/**
 * @jest-environment jsdom
 */
import { readFileSync } from 'fs';
import { join } from 'path';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { BanerNowejWersji } from '@verris/ui';

/**
 * Prod 12.10: karta panelu otwarta przed wdrożeniem → nieobsłużone „UnrecognizedActionError: Server Action …
 * was not found”; odpytywanie (baner awarii, dzwonek) cicho przestawało działać do ręcznego odświeżenia.
 * Decyzja właściciela 12.10: nie przeładowywać samemu (przepadłby wpisany formularz) — baner z przyciskiem.
 */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

describe('baner „Jest nowa wersja panelu”', () => {
  // jsdom nie pozwala podmienić location.reload — każde wywołanie wypisuje „Not implemented: navigation”
  // przez console.error; to liczymy jako przeładowanie.
  const errSpy = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  const przeladowania = () =>
    errSpy.mock.calls.filter((c) => /Not implemented: navigation/.test(String(c[0]?.message ?? c[0]))).length;
  let el: HTMLDivElement;
  let root: Root;

  const bladWersji = () =>
    Object.assign(new Error('Server Action "40aa" was not found on the server.'), { name: 'UnrecognizedActionError' });
  const odrzucenie = (reason: unknown) => {
    const e = Object.assign(new Event('unhandledrejection', { cancelable: true }), { reason });
    act(() => {
      window.dispatchEvent(e);
    });
    return e;
  };
  const tekst = () => el.querySelector('[data-baner-nowej-wersji]')?.textContent ?? '';
  const przycisk = (nazwa: RegExp) =>
    [...el.querySelectorAll('button')].find((b) => nazwa.test(`${b.textContent} ${b.getAttribute('aria-label') ?? ''}`))!;

  beforeEach(async () => {
    errSpy.mockClear();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
    await act(async () => root.render(<BanerNowejWersji />));
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });
  afterAll(() => errSpy.mockRestore());

  it('przed błędem: pusty region aria-live (polite), bez treści', () => {
    const region = el.querySelector('[data-baner-nowej-wersji]')!;
    expect(region.getAttribute('role')).toBe('status');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(tekst()).toBe('');
  });

  it('UnrecognizedActionError → baner z przyciskiem „Odśwież”, błąd przechwycony, bez przeładowania', () => {
    expect(odrzucenie(bladWersji()).defaultPrevented).toBe(true);
    expect(tekst()).toContain('Jest nowa wersja panelu. Odśwież stronę, żeby dalej działała poprawnie.');
    expect(przycisk(/Odśwież/).getAttribute('type')).toBe('button');
    expect(przeladowania()).toBe(0);
  });

  it('ChunkLoadError jako błąd okna → baner', () => {
    const e = new ErrorEvent('error', {
      cancelable: true,
      error: Object.assign(new Error('Loading chunk 12 failed'), { name: 'ChunkLoadError' }),
    });
    act(() => {
      window.dispatchEvent(e);
    });
    expect(e.defaultPrevented).toBe(true);
    expect(tekst()).toContain('Jest nowa wersja panelu');
  });

  it('zwykły błąd → nic: bez banera i bez połykania', () => {
    expect(odrzucenie(new Error('fetch failed')).defaultPrevented).toBe(false);
    expect(odrzucenie(undefined).defaultPrevented).toBe(false);
    expect(tekst()).toBe('');
    expect(przeladowania()).toBe(0);
  });

  it('„Odśwież” → przeładowanie strony', () => {
    odrzucenie(bladWersji());
    act(() => przycisk(/Odśwież/).click());
    expect(przeladowania()).toBe(1);
  });

  it('zamknięcie → znika; kolejny błąd wersji → wraca', () => {
    odrzucenie(bladWersji());
    act(() => przycisk(/Zamknij komunikat/).click());
    expect(tekst()).toBe('');
    odrzucenie(bladWersji());
    expect(tekst()).toContain('Jest nowa wersja panelu');
    expect(przeladowania()).toBe(0);
  });

  it('odmontowanie zdejmuje nasłuch', () => {
    act(() => root.unmount());
    expect(odrzucenie(bladWersji()).defaultPrevented).toBe(false);
    root = createRoot(el);
  });

  it.each([
    'apps/client-panel/src/app/dashboard/layout.tsx',
    'apps/admin-panel/src/components/admin-shell.tsx',
    'apps/staff-panel/src/components/staff-shell.tsx',
  ])('%s: powłoka zalogowanej części montuje baner', (plik) => {
    const kod = readFileSync(join(__dirname, '..', '..', '..', '..', '..', plik), 'utf8');
    expect(kod).toMatch(/import \{[^}]*\bBanerNowejWersji\b[^}]*\} from "@verris\/ui";/);
    expect(kod).toMatch(/<BanerNowejWersji \/>/);
  });

  it.each(['client-panel', 'admin-panel', 'staff-panel'])(
    '%s: Tailwind skanuje plik banera (libs/ui leży poza katalogiem panelu)',
    (panel) => {
      const css = readFileSync(join(__dirname, '..', '..', '..', '..', panel, 'src', 'app', 'globals.css'), 'utf8');
      expect(css).toContain('@source "../../../../libs/ui/src/components/baner-nowej-wersji.tsx";');
    },
  );
});

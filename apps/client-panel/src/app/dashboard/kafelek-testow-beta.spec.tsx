/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { SCENARIUSZE_BETA, type PostepBetaDto } from '@verris/contracts/klient';
import { KLUCZ_ZWINIECIA, KafelekTestowBeta } from './kafelek-testow-beta';

/** Decyzja 06.11 — po ukończeniu testów kafelek „Testy (beta)” na pulpicie da się zwinąć (pamięta to przeglądarka). */
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const kroki = Object.fromEntries(SCENARIUSZE_BETA.filter((s) => !s.opcjonalny).flatMap((s) => s.kroki.map((k) => [k.id, 'x'] as const)));
const gotowy: PostepBetaDto = { tester: true, kroki, uwagi: {}, zaktualizowano: null };

describe('KafelekTestowBeta – zwijanie po ukończeniu', () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    localStorage.clear();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });
  const przycisk = (t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === t)!;

  it('„Zwiń” zostawia jedną linijkę z podziękowaniem i jest zapamiętane; „Rozwiń” wraca do pełnego kafelka', () => {
    act(() => root.render(<KafelekTestowBeta postep={gotowy} />));
    expect(el.querySelector('[data-kafelek-testow]')?.getAttribute('data-kafelek-testow')).toBe('ukonczone');
    act(() => przycisk('Zwiń').click());
    expect(el.querySelector('[data-kafelek-testow]')?.getAttribute('data-kafelek-testow')).toBe('zwiniety');
    expect(el.textContent).toContain('wszystkie kroki odhaczone – dziękujemy!');
    expect(localStorage.getItem(KLUCZ_ZWINIECIA)).toBe('1');

    act(() => root.unmount());
    root = createRoot(el);
    act(() => root.render(<KafelekTestowBeta postep={gotowy} />));
    expect(el.querySelector('[data-kafelek-testow]')?.getAttribute('data-kafelek-testow')).toBe('zwiniety');

    act(() => przycisk('Rozwiń').click());
    expect(el.querySelector('[data-kafelek-testow]')?.getAttribute('data-kafelek-testow')).toBe('ukonczone');
    expect(localStorage.getItem(KLUCZ_ZWINIECIA)).toBeNull();
  });

  it('w trakcie testów nie da się zwinąć – zapamiętane zwinięcie nie chowa postępu', () => {
    localStorage.setItem(KLUCZ_ZWINIECIA, '1');
    act(() => root.render(<KafelekTestowBeta postep={{ ...gotowy, kroki: {} }} />));
    expect(el.querySelector('[data-kafelek-testow]')?.getAttribute('data-kafelek-testow')).toBe('w-toku');
    expect(przycisk('Zwiń')).toBeUndefined();
  });
});

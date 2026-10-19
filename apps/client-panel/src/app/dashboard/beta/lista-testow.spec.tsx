/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { LICZBA_KROKOW_BETA, type PostepBetaDto } from '@verris/contracts';

/**
 * PB-26 — strona „Testy (beta)”: ptaszek zapisuje się od razu (błąd API go cofa), uwaga — raz, po chwili bez pisania.
 */
const mockKrok = jest.fn();
const mockUwaga = jest.fn();
const mockBlad = jest.fn();
jest.mock('./beta-actions', () => ({
  ustawKrokBetaAction: (...a: unknown[]) => mockKrok(...a),
  ustawUwageBetaAction: (...a: unknown[]) => mockUwaga(...a),
}));
jest.mock('sonner', () => ({ toast: { error: (...a: unknown[]) => mockBlad(...a), success: jest.fn() } }));

import { ListaTestowBeta, ODSTEP_ZAPISU_UWAGI_MS } from './lista-testow';
import { nastepnyScenariusz, zastosujKrok } from './postep-beta';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const pusty: PostepBetaDto = { tester: true, kroki: {}, uwagi: {}, zaktualizowano: null };

describe('postęp testera — logika', () => {
  it('zastosujKrok dodaje i usuwa krok bez ruszania reszty; „Kontynuuj” wskazuje pierwszy niedokończony scenariusz', () => {
    const p = zastosujKrok(pusty, 's01.k1', true, new Date('2026-10-20T10:00:00Z'));
    expect(p.kroki).toEqual({ 's01.k1': '2026-10-20T10:00:00.000Z' });
    expect(zastosujKrok(p, 's01.k1', false).kroki).toEqual({});
    expect(nastepnyScenariusz({})?.id).toBe('s01');
    const s01 = { 's01.k1': 'x', 's01.k2': 'x', 's01.k3': 'x', 's01.k4': 'x' };
    expect(nastepnyScenariusz(s01)?.id).toBe('s02');
  });
});

describe('ListaTestowBeta', () => {
  let root: Root;
  let el: HTMLDivElement;
  beforeEach(() => {
    jest.useFakeTimers();
    mockKrok.mockReset();
    mockUwaga.mockReset();
    mockBlad.mockReset();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
    jest.useRealTimers();
  });

  const licznik = () => el.querySelector('[data-postep-beta]')?.textContent ?? '';

  it('odhaczenie: widok od razu, zapis w API; błąd zapisu cofa ptaszek i mówi o tym', async () => {
    mockKrok.mockResolvedValueOnce({ ok: true, postep: { ...pusty, kroki: { 's01.k1': '2026-10-20T10:00:00.000Z' }, zaktualizowano: '2026-10-20T10:00:00.000Z' } });
    await act(async () => root.render(<ListaTestowBeta poczatkowy={pusty} />));
    expect(licznik()).toContain(`0 z ${LICZBA_KROKOW_BETA}`);

    const k1 = el.querySelector<HTMLInputElement>('[data-krok="s01.k1"]')!;
    await act(async () => k1.click());
    expect(mockKrok).toHaveBeenCalledWith('s01.k1', true);
    expect(licznik()).toContain(`1 z ${LICZBA_KROKOW_BETA}`);

    mockKrok.mockResolvedValueOnce({ ok: false, blad: 'Brak połączenia' });
    const k2 = el.querySelector<HTMLInputElement>('[data-krok="s01.k2"]')!;
    await act(async () => k2.click());
    expect(mockKrok).toHaveBeenLastCalledWith('s01.k2', true);
    expect(k2.checked).toBe(false);
    expect(licznik()).toContain(`1 z ${LICZBA_KROKOW_BETA}`);
    expect(mockBlad).toHaveBeenCalledWith('Brak połączenia');
  });

  it('uwaga: zapis jeden raz, po chwili bez pisania, z ostatnią treścią', async () => {
    mockUwaga.mockResolvedValue({ ok: true, postep: { ...pusty, uwagi: { s05: 'Mail po 2 min' }, zaktualizowano: '2026-10-20T10:00:00.000Z' } });
    await act(async () => root.render(<ListaTestowBeta poczatkowy={pusty} />));
    const pole = el.querySelector<HTMLTextAreaElement>('[data-uwaga="s05"]')!;
    const ustaw = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    for (const t of ['Mail', 'Mail po', 'Mail po 2 min']) {
      await act(async () => {
        ustaw.call(pole, t);
        pole.dispatchEvent(new Event('input', { bubbles: true }));
      });
    }
    expect(mockUwaga).not.toHaveBeenCalled();
    await act(async () => {
      jest.advanceTimersByTime(ODSTEP_ZAPISU_UWAGI_MS);
    });
    expect(mockUwaga).toHaveBeenCalledTimes(1);
    expect(mockUwaga).toHaveBeenCalledWith('s05', 'Mail po 2 min');
    expect(el.textContent).toContain('Zapisano');
  });
});

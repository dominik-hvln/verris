/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const pobierz = jest.fn();
jest.mock('@/app/dashboard/services/[id]/podglad-actions', () => ({ pobierzPodgladAction: (...a: unknown[]) => pobierz(...a) }));

import { PodgladPrzedDns } from './PodgladPrzedDns';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/** 15.10 — tymczasowy adres podglądu strony przed zmianą DNS (white label: bez adresu serwera). */
describe('PodgladPrzedDns', () => {
  let root: Root;
  let el: HTMLElement;
  beforeEach(() => {
    pobierz.mockReset();
    el = document.createElement('div');
    document.body.appendChild(el);
    root = createRoot(el);
  });
  afterEach(() => {
    act(() => root.unmount());
    el.remove();
  });

  it('podgląd wyłączony albo konto nieaktywne → nic', async () => {
    pobierz.mockResolvedValue(null);
    await act(async () => root.render(<PodgladPrzedDns serviceId="s1" />));
    expect(pobierz).toHaveBeenCalledWith('s1');
    expect(el.innerHTML).toBe('');
  });

  it('jest adres → link w nowej karcie z datą ważności i domeną klienta', async () => {
    pobierz.mockResolvedValue({ url: 'https://pabc.podglad-verris.pl/', wygasa: '2026-10-22T10:00:00.000Z', domena: 'sklep.pl' });
    await act(async () => root.render(<PodgladPrzedDns serviceId="s1" />));
    const a = el.querySelector('a')!;
    expect(a.getAttribute('href')).toBe('https://pabc.podglad-verris.pl/');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toContain('noopener');
    expect(el.textContent).toContain('sklep.pl');
    expect(el.textContent).toContain('22 października');
  });
});

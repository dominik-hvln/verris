/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const potwierdz = jest.fn();
const ukrycieWhoisAction = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock('../actions', () => ({ ukrycieWhoisAction: (...a: unknown[]) => ukrycieWhoisAction(...a) }));

import { DomainWhoisPrivacy } from './domain-whois-privacy';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderuj(props: Parameters<typeof DomainWhoisPrivacy>[0]) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<DomainWhoisPrivacy {...props} />));
  return { el, root };
}

/** A-14 — opcja widoczna tylko z ceną ustawioną przez admina; włączenie po potwierdzeniu z kwotą. */
describe('DomainWhoisPrivacy', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bez ceny i wyłączone → nic nie renderuje', async () => {
    const { el, root } = await renderuj({ domainId: 'd1', enabled: false, pricePerYear: null });
    expect(el.textContent).toBe('');
    act(() => root.unmount());
  });

  it('bez ceny, ale włączone → można wyłączyć', async () => {
    const { el, root } = await renderuj({ domainId: 'd1', enabled: true, pricePerYear: null });
    expect(el.textContent).toContain('Ukrycie danych w WHOIS: włączone');
    expect(el.querySelector('button')?.textContent).toBe('Wyłącz');
    act(() => root.unmount());
  });

  it('z ceną: pokazuje cenę za rok, potwierdzenie z kwotą za rozpoczęte lata, potem stan „włączone”', async () => {
    const zaDwaLata = new Date(Date.now() + 1.5 * 365 * 24 * 3600_000).toISOString();
    const { el, root } = await renderuj({ domainId: 'd1', enabled: false, pricePerYear: '19.99', expiresAt: zaDwaLata });
    expect(el.textContent).toContain('19,99 K za rok');
    potwierdz.mockResolvedValue(true);
    ukrycieWhoisAction.mockResolvedValue({ ok: true });
    await act(async () => el.querySelector('button')!.click());
    expect(potwierdz.mock.calls[0][0]).toContain('39,98 K (2 lata');
    expect(ukrycieWhoisAction).toHaveBeenCalledWith('d1', true);
    expect(el.textContent).toContain('Ukrycie danych w WHOIS: włączone');
    act(() => root.unmount());
  });

  it('anulowane potwierdzenie → bez wywołania API', async () => {
    const { el, root } = await renderuj({ domainId: 'd1', enabled: false, pricePerYear: '19.99' });
    potwierdz.mockResolvedValue(false);
    await act(async () => el.querySelector('button')!.click());
    expect(ukrycieWhoisAction).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const potwierdz = jest.fn();
const serweryNazwAction = jest.fn();
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock('../actions', () => ({ serweryNazwAction: (...a: unknown[]) => serweryNazwAction(...a) }));

import { DomainNameservers } from './domain-nameservers';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const przycisk = (el: HTMLElement, t: string) => [...el.querySelectorAll('button')].find((b) => b.textContent === t)!;

/** t1 07.10 — domena na nieistniejących ns1/ns2.verris.pl; panel nie miał zmiany NS. */
describe('DomainNameservers', () => {
  beforeEach(() => jest.clearAllMocks());

  it('ostrzega, gdy domena nie wskazuje na Verris; „Wstaw serwery Verris” + zapis po potwierdzeniu', async () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () =>
      root.render(<DomainNameservers domainId="d1" nameservers={['ns1.verris.pl', 'ns2.verris.pl']} defaults={['ns3.verris.pl', 'ns4.verris.pl']} />),
    );
    expect(el.textContent).toContain('ns1.verris.pl, ns2.verris.pl');
    expect(el.textContent).toContain('Domena nie wskazuje na serwery Verris');

    await act(async () => przycisk(el, 'Zmień').click());
    await act(async () => przycisk(el, 'Wstaw serwery Verris').click());
    expect(el.querySelector('textarea')!.value).toBe('ns3.verris.pl\nns4.verris.pl');

    potwierdz.mockResolvedValue(true);
    serweryNazwAction.mockResolvedValue({ ok: true, nameservers: ['ns3.verris.pl', 'ns4.verris.pl'] });
    await act(async () => przycisk(el, 'Zapisz serwery').click());
    expect(serweryNazwAction).toHaveBeenCalledWith('d1', ['ns3.verris.pl', 'ns4.verris.pl']);
    expect(el.textContent).toContain('ns3.verris.pl, ns4.verris.pl');
    expect(el.textContent).not.toContain('Domena nie wskazuje');
    expect(el.querySelector('textarea')).toBeNull();
    act(() => root.unmount());
  });

  it('bez potwierdzenia nic nie wysyła', async () => {
    const el = document.createElement('div');
    const root = createRoot(el);
    await act(async () => root.render(<DomainNameservers domainId="d1" nameservers={['a.example.com', 'b.example.com']} defaults={[]} />));
    expect(el.textContent).not.toContain('Domena nie wskazuje');
    await act(async () => przycisk(el, 'Zmień').click());
    potwierdz.mockResolvedValue(false);
    await act(async () => przycisk(el, 'Zapisz serwery').click());
    expect(serweryNazwAction).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});

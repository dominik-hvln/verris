/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** G-08 — zakup płatnego certyfikatu: cena brutto z cennika, potwierdzenie z kwotą, dopiero potem zamówienie. */
const mockFetch = jest.fn();
const mockOrder = jest.fn();
const mockCheck = jest.fn();
const mockPotwierdz = jest.fn();
jest.mock('@/app/dashboard/services/[id]/hosting-ssl-actions', () => ({
  fetchPaidSslAction: (...a: unknown[]) => mockFetch(...a),
  orderPaidSslAction: (...a: unknown[]) => mockOrder(...a),
  checkPaidSslAction: (...a: unknown[]) => mockCheck(...a),
}));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => mockPotwierdz(...a) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));

import { SslPlatne } from './SslPlatne';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
// jsdom nie ma scrollIntoView, a lista Select przewija się do aktywnej opcji.
Element.prototype.scrollIntoView = jest.fn();

const oferta = [
  { productId: 5, name: 'PositiveSSL', wildcard: false, priceGross: '89.99' },
  { productId: 7, name: 'PositiveSSL Wildcard', wildcard: true, priceGross: '499.00' },
];
const zamowienie = {
  id: 'o1', domain: 'firma.pl', wildcard: false, productName: 'PositiveSSL', status: 'VALIDATING', validation: 'DNS', approverEmail: null,
  dnsRecord: { name: '@', type: 'TXT', value: 'abc123' }, dnsRecordAdded: true, priceGross: '89.99', expiresAt: null, problem: null, createdAt: '2026-10-05T10:00:00Z',
};

async function renderuj() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<SslPlatne serviceId="s1" domains={[{ name: 'firma.pl' }, { name: 'sklep.pl' }]} />));
  return { el, root };
}
const przycisk = (el: HTMLElement, tekst: string) => [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst))!;
async function wybierz(el: HTMLElement, pole: string, opcja: string) {
  await act(async () => (el.querySelector(`button[aria-label="${pole}"]`) as HTMLButtonElement).click());
  const li = [...el.querySelectorAll('li[role="option"]')].find((o) => o.textContent?.includes(opcja)) as HTMLElement;
  await act(async () => li.click());
}

describe('SslPlatne', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bez cennika i zamówień — nic nie renderuje', async () => {
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta: [], zamowienia: [] } });
    const { el, root } = await renderuj();
    expect(el.textContent).toBe('');
    act(() => root.unmount());
  });

  it('pokazuje cenę brutto; potwierdzenie z kwotą i domeną, potem zamówienie z walidacją DNS', async () => {
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta, zamowienia: [] } });
    mockPotwierdz.mockResolvedValue(true);
    mockOrder.mockResolvedValue({ ok: true, dane: zamowienie });
    const { el, root } = await renderuj();
    expect(el.textContent).toContain('Cena: 89,99 K brutto za 1 rok');
    expect(el.textContent).toContain('OV i EV');
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta, zamowienia: [zamowienie] } });
    await act(async () => przycisk(el, 'Zamów certyfikat').click());
    expect(mockPotwierdz.mock.calls[0][0]).toContain('pobierzemy 89,99 K za certyfikat PositiveSSL dla firma.pl na 1 rok');
    expect(mockOrder).toHaveBeenCalledWith('s1', { domain: 'firma.pl', productId: 5, validation: 'DNS' });
    expect(el.textContent).toContain('oczekuje na weryfikację');
    expect(el.textContent).toContain('@ TXT abc123');
    act(() => root.unmount());
  });

  it('wildcard + e-mail: host *.domena i adres weryfikacji z listy', async () => {
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta, zamowienia: [] } });
    mockPotwierdz.mockResolvedValue(true);
    mockOrder.mockResolvedValue({ ok: true, dane: zamowienie });
    const { el, root } = await renderuj();
    await wybierz(el, 'Rodzaj certyfikatu', 'Wildcard');
    await wybierz(el, 'Weryfikacja domeny', 'E-mail');
    await wybierz(el, 'Adres do weryfikacji', 'hostmaster@');
    expect(el.textContent).toContain('499,00 K');
    await act(async () => przycisk(el, 'Zamów certyfikat').click());
    expect(mockPotwierdz.mock.calls[0][0]).toContain('dla *.firma.pl');
    expect(mockOrder).toHaveBeenCalledWith('s1', { domain: 'firma.pl', productId: 7, validation: 'EMAIL', approverEmail: 'hostmaster@firma.pl' });
    act(() => root.unmount());
  });

  it('anulowane potwierdzenie → bez zamówienia; błąd API widoczny dla klienta', async () => {
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta, zamowienia: [] } });
    const { el, root } = await renderuj();
    mockPotwierdz.mockResolvedValue(false);
    await act(async () => przycisk(el, 'Zamów certyfikat').click());
    expect(mockOrder).not.toHaveBeenCalled();
    mockPotwierdz.mockResolvedValue(true);
    mockOrder.mockResolvedValue({ ok: false, blad: 'Brak wystarczających środków w portfelu. Doładuj portfel i spróbuj ponownie.' });
    await act(async () => przycisk(el, 'Zamów certyfikat').click());
    expect(el.textContent).toContain('Brak wystarczających środków w portfelu');
    act(() => root.unmount());
  });

  it('„Sprawdź teraz” podmienia zamówienie na świeży stan', async () => {
    mockFetch.mockResolvedValue({ ok: true, dane: { oferta, zamowienia: [zamowienie] } });
    mockCheck.mockResolvedValue({ ok: true, dane: { ...zamowienie, status: 'INSTALLED', expiresAt: '2027-10-05T00:00:00Z' } });
    const { el, root } = await renderuj();
    await act(async () => przycisk(el, 'Sprawdź teraz').click());
    expect(mockCheck).toHaveBeenCalledWith('s1', 'o1');
    expect(el.textContent).toContain('zainstalowany');
    expect(el.textContent).toContain('ważny do');
    act(() => root.unmount());
  });
});

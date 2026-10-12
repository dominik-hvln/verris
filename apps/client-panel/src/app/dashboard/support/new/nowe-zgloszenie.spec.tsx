/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** PB-43 — formularz zgłoszenia: wybór usługi (jedyna domyślnie), a przy awarii listy — komunikat zamiast pustki. */
const mockUslugi = jest.fn();
const mockWyslij = jest.fn();
jest.mock('../actions', () => ({
  createTicketWithFiles: (...a: unknown[]) => mockWyslij(...a),
  fetchBetaStatus: async () => false,
  fetchKbSuggestions: async () => [],
  fetchUslugiDoZgloszenia: () => mockUslugi(),
}));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn(), refresh: jest.fn() }) }));
jest.mock('next/link', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
jest.mock('sonner', () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock('@/components/panel/pole-zalacznikow', () => ({ PoleZalacznikow: () => null }));

import NewTicketPage from './page';
import { nazwaDostepna } from '@/a11y/nazwa-dostepna';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Element.prototype.scrollIntoView = jest.fn();

async function renderuj() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<NewTicketPage />));
  return { el, root };
}
const ukryte = (el: HTMLElement) => (el.querySelector('input[name="subscriptionId"]') as HTMLInputElement | null)?.value;

describe('nowe zgłoszenie — usługa', () => {
  beforeEach(() => jest.clearAllMocks());

  it('jedyna usługa wybrana od razu i trafia do wysyłki', async () => {
    mockUslugi.mockResolvedValue([{ id: 's1', nazwa: 'sklep.pl (wnbgswgc)' }]);
    mockWyslij.mockResolvedValue({ success: true });
    const { el, root } = await renderuj();
    expect(ukryte(el)).toBe('s1');
    expect(el.textContent).toContain('sklep.pl (wnbgswgc)');

    (el.querySelector('#subject') as HTMLInputElement).value = 'Strona nie działa';
    (el.querySelector('#message') as HTMLTextAreaElement).value = 'Od rana błąd 500 na stronie.';
    await act(async () => (el.querySelector('form') as HTMLFormElement).requestSubmit());
    const fd = mockWyslij.mock.calls[0][0] as FormData;
    expect(fd.get('subscriptionId')).toBe('s1');
    act(() => root.unmount());
  });

  it('kilka usług: domyślnie bez wyboru, klient wskazuje usługę z listy', async () => {
    mockUslugi.mockResolvedValue([{ id: 's1', nazwa: 'a.pl' }, { id: 's2', nazwa: 'b.pl' }]);
    const { el, root } = await renderuj();
    expect(ukryte(el)).toBe('');
    await act(async () => (el.querySelector('[role="combobox"]#usluga') as HTMLElement).click());
    const li = [...el.querySelectorAll('li[role="option"]')].find((o) => o.textContent?.includes('b.pl')) as HTMLElement;
    await act(async () => li.click());
    expect(ukryte(el)).toBe('s2');
    act(() => root.unmount());
  });

  it('lista usług niedostępna — czytelny komunikat, formularz dalej działa', async () => {
    mockUslugi.mockResolvedValue(null);
    const { el, root } = await renderuj();
    expect(el.textContent).toContain('Nie udało się wczytać listy usług');
    expect(ukryte(el)).toBeUndefined();
    expect(el.querySelector('#subject')).not.toBeNull();
    act(() => root.unmount());
  });
});

/**
 * P-12 (VoiceOver 12.10): oba pola wyboru były czytane jako placeholder („— wybierz temat —”) zamiast
 * etykiety. Nazwa dostępna = widoczna etykieta, powiązana programowo (aria-labelledby → <label>).
 */
describe('nowe zgłoszenie — nazwy pól wyboru (P-12)', () => {
  it('„Czego dotyczy zgłoszenie?” i „Której usługi dotyczy?” mają nazwę z widocznej etykiety', async () => {
    mockUslugi.mockResolvedValue([{ id: 's1', nazwa: 'a.pl' }, { id: 's2', nazwa: 'b.pl' }]);
    const { el, root } = await renderuj();
    const pola = [...el.querySelectorAll<HTMLElement>('[role="combobox"]')];
    expect(pola).toHaveLength(2);
    for (const [pole, etykieta] of [
      [pola[0]!, 'Czego dotyczy zgłoszenie?'],
      [pola[1]!, 'Której usługi dotyczy?'],
    ] as const) {
      expect(nazwaDostepna(pole)).toBe(etykieta);
      const lbl = document.getElementById(pole.getAttribute('aria-labelledby') ?? '');
      expect(lbl?.tagName).toBe('LABEL');
      expect(lbl?.textContent?.trim()).toBe(etykieta);
      expect(pole.getAttribute('aria-expanded')).toBe('false');
    }
    act(() => root.unmount());
  });
});

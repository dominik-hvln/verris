/**
 * @jest-environment jsdom
 */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * Asystent panelu — układ asystenta z verris.pl (decyzja 6.11.2026), kolory z tokenów panelu.
 * AI Act art. 50 (od 2.08.2026) — informacja o AI widoczna od otwarcia okna; odpowiedzi oznaczone maszynowo.
 * Nazwa bez „AI” (decyzja właściciela 05.10).
 */
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
const mockAsk = jest.fn();
const mockStatus = jest.fn();
jest.mock('@/app/dashboard/assistant-actions', () => ({
  fetchAiStatusAction: (...a: unknown[]) => mockStatus(...a),
  askHostingAssistantAction: (...a: unknown[]) => mockAsk(...a),
}));

import HostingAssistant, { SUGGESTIONS } from './HostingAssistant';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | null = null;
afterEach(() => {
  if (root) act(() => root!.unmount());
  root = null;
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

async function renderuj(props: { mozeZglaszac?: boolean } = {}) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  root = createRoot(el);
  await act(async () => root!.render(<HostingAssistant {...props} />));
  await act(async () => undefined);
  return el;
}

const fab = (el: HTMLElement) => el.querySelector<HTMLButtonElement>('button[aria-label="Masz pytanie? Otwórz asystenta AI"]');

async function otworz(el: HTMLElement) {
  await act(async () => fab(el)!.click());
  return el.querySelector<HTMLElement>('[role="dialog"]')!;
}

async function zapytaj(el: HTMLElement, tekst: string) {
  const pole = el.querySelector('textarea')!;
  const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
  await act(async () => {
    set.call(pole, tekst);
    pole.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // Enter wysyła (Shift+Enter — nowa linia), jak na www.
  await act(async () => {
    pole.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  });
  await act(async () => undefined);
}

describe('Asystent w panelu klienta', () => {
  it('configured:false — nic się nie renderuje', async () => {
    mockStatus.mockResolvedValue({ configured: false });
    const el = await renderuj();
    expect(el.innerHTML).toBe('');
  });

  it('przycisk w rogu z aria-label i tekstem jak na www; otwarte okno: nagłówek, informacja o AI, chipy, stopka', async () => {
    mockStatus.mockResolvedValue({ configured: true });
    const el = await renderuj({ mozeZglaszac: true });
    const przycisk = fab(el)!;
    expect(przycisk).not.toBeNull();
    expect(przycisk.getAttribute('aria-haspopup')).toBe('dialog');
    expect(przycisk.className).toContain('h-12'); // 48 px — pigułka „Zgłoś uwagę” stoi 3.75rem nad nim
    expect(przycisk.textContent).toContain('Masz pytanie?');
    expect(przycisk.textContent).toContain('Odpowiem w kilka sekund'); // 6.11 — podpis wybrany przez Dominika, jak na www
    // 6.11 (uwaga Dominika): sygnet w kółku, nie w kwadracie — jak na makiecie verris.pl.
    const sygnet = przycisk.querySelector('svg')!;
    expect(sygnet.querySelector('circle')).not.toBeNull();
    expect(sygnet.querySelector('rect')).toBeNull();

    const okno = await otworz(el);
    expect(okno.getAttribute('aria-modal')).toBe('true');
    expect(okno.className).toContain('sm:w-[420px]');
    expect(okno.className).toContain('inset-0'); // telefon: pełny ekran
    expect(okno.className).toContain('v2-motyw-tresci'); // motyw jasny/ciemny poza kolumną treści
    const tytul = el.querySelector(`#${okno.getAttribute('aria-labelledby')}`)!;
    expect(tytul.textContent).toBe('Asystent Verris');
    expect(tytul.textContent).not.toMatch(/\bAI\b/);
    expect(el.querySelector('button[aria-label="Zamknij asystenta"]')).not.toBeNull();

    const info = el.querySelector('#asystent-ai-info')!;
    expect(info.textContent).toContain('Rozmawiasz z asystentem AI');
    expect(el.querySelector('textarea')!.getAttribute('aria-describedby')).toBe('asystent-ai-info');

    const chipy = [...el.querySelectorAll('button')].map((b) => b.textContent);
    for (const s of SUGGESTIONS) expect(chipy).toContain(s);

    expect(okno.textContent).toContain('Odpowiedzi mogą zawierać błędy');
    expect(el.querySelector('a[href="/dashboard/support/new"]')?.textContent).toBe('Napisz do zespołu');
    expect(el.querySelectorAll('[data-ai-generated="true"]').length).toBe(0); // powitanie to tekst panelu
  });

  it('odpowiedź ze źródłami: chipy z linkami do artykułów Bazy wiedzy, oznaczona data-ai-generated; chipy podpowiedzi znikają', async () => {
    mockStatus.mockResolvedValue({ configured: true });
    mockAsk.mockResolvedValue({
      ok: true,
      dane: {
        available: true,
        answer: 'Rekord A ustaw na adres serwera.\n\nZmiana działa do 24 h.',
        sources: [
          { docId: 'd1', title: 'Podłączenie domeny', slug: 'podlaczenie-domeny' },
          { docId: 'd2', title: 'Notatka', slug: null },
        ],
      },
    });
    const el = await renderuj();
    await otworz(el);
    await zapytaj(el, 'Jak podłączyć domenę?');

    expect(mockAsk).toHaveBeenCalledWith({ question: 'Jak podłączyć domenę?', history: [], subscriptionId: null });
    const ai = el.querySelectorAll('[data-ai-generated="true"]');
    expect(ai.length).toBe(1);
    expect([...ai[0].querySelectorAll('p')].map((p) => p.textContent)).toEqual(['Rekord A ustaw na adres serwera.', 'Zmiana działa do 24 h.']);
    const zrodla = ai[0].querySelector('ul[aria-label="Źródła odpowiedzi"]')!;
    const link = zrodla.querySelector('a')!;
    expect(link.getAttribute('href')).toBe('/dashboard/knowledge?article=podlaczenie-domeny');
    expect(link.textContent).toBe('Podłączenie domeny');
    expect(zrodla.querySelectorAll('a').length).toBe(1); // źródło bez artykułu — chip bez linku
    expect(zrodla.textContent).toContain('Notatka');
    expect([...el.querySelectorAll('button')].map((b) => b.textContent)).not.toContain(SUGGESTIONS[0]);

    // Kolejne pytanie niesie historię rozmowy.
    mockAsk.mockResolvedValue({ ok: true, dane: { available: true, answer: 'Tak.', sources: [] } });
    await zapytaj(el, 'A SSL?');
    expect(mockAsk).toHaveBeenLastCalledWith({
      question: 'A SSL?',
      history: [
        { role: 'user', content: 'Jak podłączyć domenę?' },
        { role: 'assistant', content: 'Rekord A ustaw na adres serwera.\n\nZmiana działa do 24 h.' },
      ],
      subscriptionId: null,
    });
  });

  it('błąd akcji: komunikat z treścią i karta „Napisz do zespołu” z linkiem do nowego zgłoszenia', async () => {
    mockStatus.mockResolvedValue({ configured: true });
    mockAsk.mockResolvedValue({ ok: false, blad: 'Limit zapytań' });
    const el = await renderuj({ mozeZglaszac: true });
    await otworz(el);
    await zapytaj(el, 'Pytanie');
    expect(el.querySelector('[role="log"]')!.textContent).toContain('Przepraszam, wystąpił błąd: Limit zapytań');
    expect(el.querySelectorAll('[data-ai-generated="true"]').length).toBe(0);
    const karta = [...el.querySelectorAll('a[href="/dashboard/support/new"]')].map((a) => a.textContent);
    expect(karta).toContain('Nowe zgłoszenie');
  });

  it('konto bez prawa do zgłoszeń: bez linków do nowego zgłoszenia', async () => {
    mockStatus.mockResolvedValue({ configured: true });
    mockAsk.mockResolvedValue({ ok: false, blad: 'x' });
    const el = await renderuj({ mozeZglaszac: false });
    await otworz(el);
    await zapytaj(el, 'Pytanie');
    expect(el.querySelector('a[href="/dashboard/support/new"]')).toBeNull();
  });

  it('Escape zamyka okno, fokus wraca na przycisk', async () => {
    jest.useFakeTimers();
    try {
      mockStatus.mockResolvedValue({ configured: true });
      const el = await renderuj();
      await otworz(el);
      expect(document.activeElement).toBe(el.querySelector('textarea'));
      await act(async () => {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(el.querySelector('[role="dialog"]')).toBeNull();
      await act(async () => {
        jest.runAllTimers();
      });
      expect(document.activeElement).toBe(fab(el));
    } finally {
      jest.useRealTimers();
    }
  });
});

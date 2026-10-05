/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** AI Act art. 50 (od 2.08.2026) — informacja o AI przy polu pytania od otwarcia okna; odpowiedzi oznaczone maszynowo. Nazwa bez „AI” (decyzja właściciela 05.10). */
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
const mockAsk = jest.fn();
jest.mock('@/app/dashboard/assistant-actions', () => ({
  fetchAiStatusAction: async () => ({ configured: true }),
  askHostingAssistantAction: (...a: unknown[]) => mockAsk(...a),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('informacja o AI widoczna przed pierwszym pytaniem; odpowiedź oznaczona data-ai-generated', async () => {
  const { default: HostingAssistant } = await import('./HostingAssistant');
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<HostingAssistant />));
  await act(async () => (el.querySelector('button[aria-label="Otwórz asystenta Verris"]') as HTMLButtonElement).click());
  const info = el.querySelector('#asystent-ai-info')!;
  expect(info.textContent).toContain('Odpowiedzi tworzy AI i mogą zawierać błędy');
  expect(el.querySelector('input')!.getAttribute('aria-describedby')).toBe('asystent-ai-info');
  expect(el.querySelectorAll('[data-ai-generated="true"]').length).toBe(0); // powitanie to tekst panelu
  mockAsk.mockResolvedValue({ ok: true, dane: { available: true, answer: 'Odnowienie 28.10.', sources: [] } });
  const input = el.querySelector('input')!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => { set.call(input, 'Kiedy odnowienie?'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => (el.querySelector('form') as HTMLFormElement).requestSubmit());
  const ai = el.querySelectorAll('[data-ai-generated="true"]');
  expect(ai.length).toBe(1);
  expect(ai[0].textContent).toContain('Odnowienie 28.10.');
  act(() => root.unmount());
});

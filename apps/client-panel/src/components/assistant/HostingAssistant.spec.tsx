/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

/** AI Act art. 50 (od 2.08.2026) — klient od pierwszego zdania wie, że rozmawia z AI; odpowiedzi oznaczone. */
jest.mock('next/navigation', () => ({ usePathname: () => '/dashboard' }));
const mockAsk = jest.fn();
jest.mock('@/app/dashboard/assistant-actions', () => ({
  fetchAiStatusAction: async () => ({ configured: true }),
  askHostingAssistantAction: (...a: unknown[]) => mockAsk(...a),
}));

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('nagłówek i powitanie mówią o AI; odpowiedź ma etykietę i data-ai-generated', async () => {
  const { default: HostingAssistant } = await import('./HostingAssistant');
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<HostingAssistant />));
  await act(async () => (el.querySelector('button[aria-label="Otwórz asystenta AI Verris"]') as HTMLButtonElement).click());
  expect(el.textContent).toContain('Asystent AI Verris');
  expect(el.textContent).toContain('Jestem asystentem AI Verris');
  expect(el.textContent).toContain('mogą zawierać błędy');
  expect(el.querySelectorAll('[data-ai-generated="true"]').length).toBe(1);
  act(() => root.unmount());
});

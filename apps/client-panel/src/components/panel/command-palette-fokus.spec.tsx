/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { CommandPalette } from './command-palette';

jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

/**
 * A3-8 (WCAG 2.4.3) — paleta „Szukaj lub zrób coś”: Tab wychodził spod przyciemnienia na stronę (24 z 25 Tabów
 * poza oknem), a Esc działał tylko w polu wpisywania. Na starym kodzie: fokus na body po Tab, paleta otwarta po Esc.
 */
let root: Root;
let kontener: HTMLElement;
beforeEach(() => {
  jest.useFakeTimers();
  kontener = document.createElement('div');
  document.body.appendChild(kontener);
  root = createRoot(kontener);
  act(() => root.render(<CommandPalette items={[{ label: 'Płatności', hint: 'strona', href: '/dashboard/billing' }]} />));
});
afterEach(() => {
  act(() => root.unmount());
  document.body.innerHTML = '';
  jest.useRealTimers();
});

const klawisz = (key: string, cel: EventTarget = document.activeElement ?? document.body) =>
  act(() => {
    cel.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });

function otworz() {
  const przycisk = kontener.querySelector<HTMLButtonElement>('button')!;
  przycisk.focus();
  act(() => przycisk.click());
  act(() => jest.advanceTimersByTime(20));
  return { przycisk, okno: document.querySelector<HTMLElement>('[role="dialog"]')! };
}

describe('paleta poleceń — fokus w oknie', () => {
  it('okno jest modalne, a Tab zostaje w oknie (fokus poza nim wraca do pola)', () => {
    const { okno } = otworz();
    expect(okno.getAttribute('aria-modal')).toBe('true');
    const pole = okno.querySelector('input')!;
    expect(document.activeElement).toBe(pole);
    // Fokus „uciekł” (np. kliknięcie w tło) — Tab przenosi go z powrotem do okna.
    (document.activeElement as HTMLElement).blur();
    const tab = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(tab);
    });
    expect(tab.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(pole);
  });

  it('Esc zamyka paletę także, gdy fokus nie jest w polu, i oddaje fokus przyciskowi', () => {
    const { przycisk } = otworz();
    (document.activeElement as HTMLElement).blur();
    klawisz('Escape', document.body);
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(przycisk);
  });
});

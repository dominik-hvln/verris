/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const requestVpsConsoleAction = jest.fn();
const utworzone: Array<{ url: string; opcje: unknown; zdarzenia: Record<string, () => void>; disconnect: jest.Mock; scaleViewport?: boolean }> = [];
jest.mock('./vps-actions', () => ({ requestVpsConsoleAction: (...a: unknown[]) => requestVpsConsoleAction(...a) }));
jest.mock(
  '@novnc/novnc',
  () => ({
    __esModule: true,
    default: class {
      zdarzenia: Record<string, () => void> = {};
      disconnect = jest.fn();
      sendCtrlAltDel = jest.fn();
      scaleViewport = false;
      constructor(_cel: HTMLElement, public url: string, public opcje: unknown) {
        utworzone.push(this as never);
      }
      addEventListener(nazwa: string, fn: () => void) {
        this.zdarzenia[nazwa] = fn;
      }
    },
  }),
);

import { VpsKonsola } from './vps-konsola';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

async function renderuj() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<VpsKonsola vpsId="v1" onClose={jest.fn()} />));
  await act(async () => new Promise((r) => setTimeout(r, 0)));
  return { el, root };
}

/** Q-07 — sesja z naszego API trafia prosto do noVNC; hasła nie wyświetlamy; zamknięcie rozłącza. */
describe('VpsKonsola', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    utworzone.length = 0;
  });

  it('łączy noVNC adresem i jednorazowym hasłem sesji, bez pokazywania hasła', async () => {
    requestVpsConsoleAction.mockResolvedValue({ ok: true, data: { wssUrl: 'wss://konsola/x', password: 'tajne-vnc' } });
    const { el, root } = await renderuj();
    expect(requestVpsConsoleAction).toHaveBeenCalledWith('v1');
    expect(utworzone).toHaveLength(1);
    expect(utworzone[0].url).toBe('wss://konsola/x');
    expect(utworzone[0].opcje).toEqual({ credentials: { password: 'tajne-vnc' } });
    expect(utworzone[0].scaleViewport).toBe(true);
    expect(el.textContent).not.toContain('tajne-vnc');

    await act(async () => utworzone[0].zdarzenia.connect());
    expect(el.textContent).toContain('połączono');

    const polaczenie = utworzone[0];
    act(() => root.unmount());
    expect(polaczenie.disconnect).toHaveBeenCalled();
  });

  it('odmowa API → komunikat, bez połączenia', async () => {
    requestVpsConsoleAction.mockResolvedValue({ ok: false, error: 'VPS jest wstrzymany z powodu braku środków.' });
    const { el, root } = await renderuj();
    expect(utworzone).toHaveLength(0);
    expect(el.textContent).toContain('wstrzymany');
    act(() => root.unmount());
  });
});

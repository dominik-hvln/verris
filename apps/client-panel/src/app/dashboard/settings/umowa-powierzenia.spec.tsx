/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const acceptDpa = jest.fn();
const aktualnaWersjaDpa = jest.fn();
jest.mock('./privacy-actions', () => ({ acceptDpa: (...a: unknown[]) => acceptDpa(...a) }));
jest.mock('./umowa-powierzenia-actions', () => ({ aktualnaWersjaDpa: (...a: unknown[]) => aktualnaWersjaDpa(...a) }));

import { UmowaPowierzenia } from './umowa-powierzenia';
import type { UserConsentRow } from './privacy-actions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const zgoda = (documentKind: UserConsentRow['documentKind'], documentVersion: string): UserConsentRow => ({
  id: `${documentKind}-${documentVersion}`,
  documentKind,
  documentVersion,
  locale: 'pl',
  grantedAt: '2026-11-03T10:00:00.000Z',
  withdrawnAt: null,
  source: 'SETTINGS',
});

async function renderuj(consents: UserConsentRow[], onAccepted = jest.fn()) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  const showToast = jest.fn();
  await act(async () => root.render(<UmowaPowierzenia consents={consents} onAccepted={onAccepted} showToast={showToast} />));
  await act(async () => undefined);
  return { el, root, showToast, onAccepted };
}

const przycisk = (el: HTMLElement, tekst: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst)) as HTMLButtonElement | undefined;

/** A2-06 — w panelu nie było akceptacji DPA ani egzemplarza PDF, choć www i DPA §12 to obiecują. */
describe('Umowa powierzenia w „Prywatność i dane”', () => {
  beforeEach(() => jest.clearAllMocks());

  it('bez akceptacji: przycisk „Akceptuję…”, bez linku do PDF; po kliknięciu akceptacja i odświeżenie zgód', async () => {
    aktualnaWersjaDpa.mockResolvedValue('1.1.0');
    acceptDpa.mockResolvedValue({ ok: true, version: '1.1.0' });
    const { el, root, onAccepted, showToast } = await renderuj([zgoda('TERMS', '1.1.0')]);
    expect(el.textContent).toContain('Nie zaakceptowano jeszcze umowy powierzenia');
    expect(el.querySelector('a[href="/api/dpa"]')).toBeNull();
    expect(el.querySelector('a[href="/legal/dpa"]')).not.toBeNull();
    await act(async () => przycisk(el, 'Akceptuję umowę powierzenia')!.click());
    expect(acceptDpa).toHaveBeenCalledTimes(1);
    expect(onAccepted).toHaveBeenCalled();
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('1.1.0'), 'success');
    act(() => root.unmount());
  });

  it('zaakceptowana aktualna wersja: status i link „Pobierz egzemplarz (PDF)”, bez przycisku akceptacji', async () => {
    aktualnaWersjaDpa.mockResolvedValue('1.1.0');
    const { el, root } = await renderuj([zgoda('DPA', '1.1.0')]);
    expect(el.textContent).toContain('Zaakceptowana: wersja 1.1.0');
    expect(el.querySelector('a[href="/api/dpa"]')?.textContent).toContain('Pobierz egzemplarz (PDF)');
    expect(przycisk(el, 'Akceptuję')).toBeUndefined();
    act(() => root.unmount());
  });

  it('starsza wersja: prośba o akceptację aktualnej; błąd API (np. brak NIP) jako komunikat', async () => {
    aktualnaWersjaDpa.mockResolvedValue('1.1.0');
    acceptDpa.mockResolvedValue({ ok: false, error: 'DPA jest dostępne wyłącznie dla klientów biznesowych (firma/NIP).' });
    const { el, root, showToast, onAccepted } = await renderuj([zgoda('DPA', '1.0.1')]);
    expect(el.textContent).toContain('Aktualna to 1.1.0');
    expect(el.querySelector('a[href="/api/dpa"]')).toBeNull();
    await act(async () => przycisk(el, 'Akceptuję umowę powierzenia')!.click());
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('firma/NIP'), 'error');
    expect(onAccepted).not.toHaveBeenCalled();
    act(() => root.unmount());
  });

  it('DPA nieopublikowana: bez przycisku i bez linku do PDF', async () => {
    aktualnaWersjaDpa.mockResolvedValue(null);
    const { el, root } = await renderuj([]);
    expect(el.textContent).toContain('nie jest jeszcze opublikowana');
    expect(przycisk(el, 'Akceptuję')).toBeUndefined();
    act(() => root.unmount());
  });
});

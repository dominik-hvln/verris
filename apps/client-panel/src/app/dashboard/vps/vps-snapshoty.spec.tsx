/**
 * @jest-environment jsdom
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';

const potwierdz = jest.fn();
const akcje = {
  fetchVpsSnapshots: jest.fn(),
  createVpsSnapshotAction: jest.fn(),
  deleteVpsSnapshotAction: jest.fn(),
  restoreVpsSnapshotAction: jest.fn(),
  fetchVpsOsImages: jest.fn(),
  rebuildVpsAction: jest.fn(),
  vpsActionStatus: jest.fn(),
};
jest.mock('next/navigation', () => ({ useRouter: () => ({ refresh: jest.fn() }) }));
jest.mock('sonner', () => ({ toast: { success: jest.fn(), error: jest.fn() } }));
jest.mock('@/components/panel/potwierdz', () => ({ potwierdz: (...a: unknown[]) => potwierdz(...a) }));
jest.mock('./vps-actions', () =>
  Object.fromEntries(Object.entries(akcje).map(([k, fn]) => [k, (...a: unknown[]) => (fn as jest.Mock)(...a)])),
);

import { VpsSnapshoty } from './vps-snapshoty';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

const snapshot = { id: 's1', description: 'przed aktualizacją', createdAt: '2026-10-01T10:00:00.000Z', sizeGb: '6.5', status: 'available' };

async function renderuj(onRootPassword = jest.fn()) {
  const el = document.createElement('div');
  document.body.appendChild(el);
  const root = createRoot(el);
  await act(async () => root.render(<VpsSnapshoty vpsId="v1" vpsName="produkcja" onRootPassword={onRootPassword} />));
  return { el, root };
}
const przycisk = (el: HTMLElement, tekst: string) =>
  [...el.querySelectorAll('button')].find((b) => b.textContent?.includes(tekst) || b.getAttribute('aria-label')?.includes(tekst))!;

/** Q-08 — lista snapshotów, potwierdzenia operacji niszczących, wyłączenie bez ceny, reinstalacja. */
describe('VpsSnapshoty', () => {
  beforeEach(() => jest.clearAllMocks());

  it('lista z datą i rozmiarem, cena za GB, licznik z odmianą', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: true, pricePerGbMonthly: '0.06', limit: 3, snapshots: [snapshot] } });
    const { el, root } = await renderuj();
    expect(el.textContent).toContain('przed aktualizacją');
    expect(el.textContent).toContain('6,5 GB');
    expect(el.textContent).toContain('2026');
    expect(el.textContent).toContain('0,06 K za GB miesięcznie');
    expect(el.textContent).toContain('1 snapshot · limit 3');
    act(() => root.unmount());
  });

  it('bez ceny i bez snapshotów → sekcja snapshotów ukryta (zostaje reinstalacja)', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: false, pricePerGbMonthly: null, limit: 3, snapshots: [] } });
    const { el, root } = await renderuj();
    expect(el.textContent).not.toContain('Snapshoty');
    expect(el.textContent).not.toContain('bezpłatnie');
    expect(el.textContent).toContain('Reinstalacja systemu');
    act(() => root.unmount());
  });

  it('limit osiągnięty → przycisk tworzenia wyłączony', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: true, pricePerGbMonthly: '0.06', limit: 1, snapshots: [snapshot] } });
    const { el, root } = await renderuj();
    expect(przycisk(el, 'Utwórz snapshot').disabled).toBe(true);
    act(() => root.unmount());
  });

  it('przywrócenie: potwierdzenie mówi o utracie danych; anulowanie nic nie wywołuje', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: true, pricePerGbMonthly: '0.06', limit: 3, snapshots: [snapshot] } });
    const { el, root } = await renderuj();
    potwierdz.mockResolvedValue(false);
    await act(async () => przycisk(el, 'Przywróć').click());
    expect(potwierdz.mock.calls[0][0]).toContain('bezpowrotnie utracone');
    expect(potwierdz.mock.calls[0][1]).toMatchObject({ niebezpieczne: true });
    expect(akcje.restoreVpsSnapshotAction).not.toHaveBeenCalled();

    potwierdz.mockResolvedValue(true);
    akcje.restoreVpsSnapshotAction.mockResolvedValue({ ok: true, data: { actionId: '55' } });
    await act(async () => przycisk(el, 'Przywróć').click());
    expect(akcje.restoreVpsSnapshotAction).toHaveBeenCalledWith('v1', 's1');
    expect(el.textContent).toContain('Przywracanie ze snapshotu w toku');
    act(() => root.unmount());
  });

  it('usunięcie snapshotu po potwierdzeniu', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: true, pricePerGbMonthly: '0.06', limit: 3, snapshots: [snapshot] } });
    akcje.deleteVpsSnapshotAction.mockResolvedValue({ ok: true });
    const { el, root } = await renderuj();
    potwierdz.mockResolvedValue(true);
    await act(async () => przycisk(el, 'Usuń snapshot').click());
    expect(potwierdz.mock.calls[0][0]).toContain('nie można cofnąć');
    expect(akcje.deleteVpsSnapshotAction).toHaveBeenCalledWith('v1', 's1');
    act(() => root.unmount());
  });

  it('reinstalacja: wybór systemu, potwierdzenie o wyczyszczeniu dysku, nowe hasło root przekazane wyżej', async () => {
    akcje.fetchVpsSnapshots.mockResolvedValue({ ok: true, data: { enabled: false, pricePerGbMonthly: null, limit: 3, snapshots: [] } });
    akcje.fetchVpsOsImages.mockResolvedValue({ ok: true, data: [{ name: 'debian-12', description: 'Debian 12' }] });
    akcje.rebuildVpsAction.mockResolvedValue({ ok: true, data: { actionId: '56', rootPassword: 'nowe' } });
    const haslo = jest.fn();
    const { el, root } = await renderuj(haslo);
    await act(async () => przycisk(el, 'Wybierz system').click());
    potwierdz.mockResolvedValue(true);
    await act(async () => przycisk(el, 'Reinstaluj').click());
    expect(potwierdz.mock.calls[0][0]).toContain('Debian 12');
    expect(potwierdz.mock.calls[0][0]).toContain('Cały dysk zostanie wyczyszczony');
    expect(akcje.rebuildVpsAction).toHaveBeenCalledWith('v1', 'debian-12');
    expect(haslo).toHaveBeenCalledWith('nowe');
    act(() => root.unmount());
  });
});

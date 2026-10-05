import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { VpsService } from './vps.service.js';

/**
 * Q-07/Q-08 — reguły usług panelu: własność VPS-a, cena (pusta = wyłączone) i limit snapshotów,
 * dziennik audytu, reinstalacja tylko z listy systemów, akcja tylko własnego serwera, konsola bez hasła w dzienniku.
 */
const DZIEN = 86_400_000;

function stanowisko(opcje: { cena?: string; limit?: string; aktywne?: number; okresKoniec?: Date } = {}) {
  const vps = {
    id: 'v1', userId: 'u1', status: 'RUNNING', hetznerServerId: '42',
    currentPeriodEnd: opcje.okresKoniec ?? new Date(Date.now() + 10 * DZIEN),
  };
  const snap = { id: 's1', vpsInstanceId: 'v1', hetznerImageId: '900', description: 'x', sizeGb: null, createdAt: new Date(), deletedAt: null };
  const ustawienia = [
    ...(opcje.cena !== undefined ? [{ key: 'vps.snapshotPricePerGbMonthly', value: opcje.cena }] : []),
    ...(opcje.limit !== undefined ? [{ key: 'vps.snapshotLimit', value: opcje.limit }] : []),
  ];
  const prisma = {
    vpsInstance: {
      findFirst: vi.fn(async ({ where }: { where: { id: string; userId: string } }) => (where.id === 'v1' && where.userId === 'u1' ? vps : null)),
      update: vi.fn(async () => ({})),
    },
    vpsSnapshot: {
      count: vi.fn(async () => opcje.aktywne ?? 0),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's-new', createdAt: new Date(), ...data })),
      findFirst: vi.fn(async ({ where }: { where: { id: string; vpsInstanceId: string } }) =>
        where.id === 's1' && where.vpsInstanceId === 'v1' ? snap : null,
      ),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({})),
    },
    platformSetting: { findMany: vi.fn(async () => ustawienia) },
  };
  const hetzner = {
    createSnapshot: vi.fn(async () => ({ image: { id: 900, status: 'creating', image_size: null }, actionId: 1 })),
    deleteImage: vi.fn(async () => undefined),
    rebuild: vi.fn(async () => ({ rootPassword: 'nowe-haslo', actionId: 55 })),
    getServer: vi.fn(async () => ({ server_type: { architecture: 'x86' } })),
    listSystemImages: vi.fn(async () => [{ name: 'debian-12', description: 'Debian 12' }, { name: 'ubuntu-24.04', description: 'Ubuntu 24.04' }]),
    getAction: vi.fn(async () => ({ status: 'running', progress: 40, resources: [{ id: 42, type: 'server' }] })),
    requestConsole: vi.fn(async () => ({ wssUrl: 'wss://x', password: 'tajne-vnc' })),
    listSnapshots: vi.fn(async () => []),
  };
  const audit = { record: vi.fn(async () => undefined) };
  const svc = new VpsService(
    prisma as never,
    { encrypt: (v: string) => `enc:${v}` } as never,
    audit as never,
    {} as never,
    hetzner as never,
    {} as never,
    { get: () => undefined } as never,
  );
  return { svc, prisma, hetzner, audit };
}

describe('VpsService — snapshoty (Q-08)', () => {
  it('cudzy VPS → 404, bez wywołania dostawcy', async () => {
    const s = stanowisko({ cena: '0.1' });
    await expect(s.svc.createSnapshot('obcy', 'v1')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.svc.console('obcy', 'v1')).rejects.toBeInstanceOf(NotFoundException);
    expect(s.hetzner.createSnapshot).not.toHaveBeenCalled();
    expect(s.hetzner.requestConsole).not.toHaveBeenCalled();
  });

  it('bez ceny snapshoty są wyłączone (nie „bezpłatnie”)', async () => {
    const s = stanowisko();
    await expect(s.svc.createSnapshot('u1', 'v1')).rejects.toBeInstanceOf(BadRequestException);
    expect((await s.svc.listSnapshots('u1', 'v1')).enabled).toBe(false);
    expect(s.hetzner.createSnapshot).not.toHaveBeenCalled();
  });

  it('limit snapshotów (domyślnie 3) → 409', async () => {
    const s = stanowisko({ cena: '0.1', aktywne: 3 });
    await expect(s.svc.createSnapshot('u1', 'v1')).rejects.toThrow('limit snapshotów dla tego serwera (3)');
    const t = stanowisko({ cena: '0.1', limit: '5', aktywne: 3 });
    await t.svc.createSnapshot('u1', 'v1', 'przed aktualizacją');
    expect(t.hetzner.createSnapshot).toHaveBeenCalledWith('42', { description: 'przed aktualizacją', labels: { 'verris-vps': 'v1' } });
  });

  it('utworzenie: zapis w bazie, audyt, stan „creating” do odpytywania', async () => {
    const s = stanowisko({ cena: '0.1' });
    const r = await s.svc.createSnapshot('u1', 'v1', 'opis');
    expect(r.status).toBe('creating');
    expect(s.prisma.vpsSnapshot.create).toHaveBeenCalledWith({ data: expect.objectContaining({ vpsInstanceId: 'v1', hetznerImageId: '900' }) });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'VPS_SNAPSHOT_CREATED', userId: 'u1' }));
  });

  it('VPS wstrzymany za brak płatności → bez snapshotu, przywracania i konsoli', async () => {
    const s = stanowisko({ cena: '0.1', okresKoniec: new Date(Date.now() - DZIEN) });
    await expect(s.svc.createSnapshot('u1', 'v1')).rejects.toBeInstanceOf(ConflictException);
    await expect(s.svc.restoreSnapshot('u1', 'v1', 's1')).rejects.toBeInstanceOf(ConflictException);
    await expect(s.svc.console('u1', 'v1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('przywrócenie: tylko snapshot tego VPS-a; rebuild z ID obrazu + audyt', async () => {
    const s = stanowisko({ cena: '0.1' });
    await expect(s.svc.restoreSnapshot('u1', 'v1', 'cudzy')).rejects.toBeInstanceOf(NotFoundException);
    expect(await s.svc.restoreSnapshot('u1', 'v1', 's1')).toEqual({ actionId: '55' });
    expect(s.hetzner.rebuild).toHaveBeenCalledWith('42', '900');
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'VPS_SNAPSHOT_RESTORED' }));
  });

  it('usunięcie: obraz już skasowany u dostawcy (404) = usunięty; inny błąd → klient go widzi', async () => {
    const s = stanowisko();
    s.hetzner.deleteImage.mockRejectedValueOnce(new NotFoundException());
    await s.svc.deleteSnapshot('u1', 'v1', 's1');
    expect(s.prisma.vpsSnapshot.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { deletedAt: expect.any(Date) } });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'VPS_SNAPSHOT_DELETED' }));

    const t = stanowisko();
    t.hetzner.deleteImage.mockRejectedValueOnce(new ConflictException('Na serwerze trwa inna operacja.'));
    await expect(t.svc.deleteSnapshot('u1', 'v1', 's1')).rejects.toBeInstanceOf(ConflictException);
    expect(t.prisma.vpsSnapshot.update).not.toHaveBeenCalled();
  });
});

describe('VpsService — reinstalacja, akcje, konsola', () => {
  it('reinstalacja tylko z listy systemów (nie np. ID cudzego snapshotu); nowe hasło raz, zaszyfrowane w bazie', async () => {
    const s = stanowisko();
    await expect(s.svc.rebuild('u1', 'v1', '123456')).rejects.toBeInstanceOf(BadRequestException);
    expect(s.hetzner.rebuild).not.toHaveBeenCalled();
    expect(await s.svc.rebuild('u1', 'v1', 'debian-12')).toEqual({ actionId: '55', rootPassword: 'nowe-haslo' });
    expect(s.hetzner.listSystemImages).toHaveBeenCalledWith('x86');
    expect(s.prisma.vpsInstance.update).toHaveBeenCalledWith({ where: { id: 'v1' }, data: { rootPasswordEnc: 'enc:nowe-haslo' } });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'VPS_REBUILT', details: expect.objectContaining({ image: 'debian-12' }) }));
  });

  it('stan akcji: tylko akcja dotycząca serwera klienta', async () => {
    const s = stanowisko();
    expect(await s.svc.actionStatus('u1', 'v1', '55')).toEqual({ status: 'running', progress: 40 });
    s.hetzner.getAction.mockResolvedValueOnce({ status: 'success', progress: 100, resources: [{ id: 999, type: 'server' }] });
    await expect(s.svc.actionStatus('u1', 'v1', '56')).rejects.toBeInstanceOf(NotFoundException);
    await expect(s.svc.actionStatus('u1', 'v1', '../servers')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('konsola: URL i hasło tylko w odpowiedzi; dziennik bez hasła', async () => {
    const s = stanowisko();
    expect(await s.svc.console('u1', 'v1')).toEqual({ wssUrl: 'wss://x', password: 'tajne-vnc' });
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'VPS_CONSOLE_OPENED' }));
    expect(JSON.stringify(s.audit.record.mock.calls)).not.toContain('tajne-vnc');
  });
});

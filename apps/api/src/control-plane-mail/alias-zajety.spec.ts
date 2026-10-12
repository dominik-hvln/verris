import { ConflictException } from '@nestjs/common';
import { ControlPlaneMailService } from './control-plane-mail.service.js';

/**
 * 12.10 (prod) — dodanie aliasu abuse@verris.pl do zgloszenia@ dawało 500 „Wewnętrzny błąd serwera”, bo abuse@ był
 * już aliasem kontakt@ (aliasEmail jest unikalny, create kończył się P2002). Zajęty adres = 409 z nazwą skrzynki.
 */
function zbuduj(o: { alias?: { targetId: string; target: { email: string } } | null; skrzynka?: { id: string } | null; createBlad?: unknown } = {}) {
  const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
    if (o.createBlad) throw o.createBlad;
    return { id: 'a1', ...data };
  });
  const prisma = {
    controlPlaneMailbox: {
      findUnique: vi.fn(async ({ where }: { where: { id?: string; email?: string } }) =>
        where.id ? { id: where.id, email: 'zgloszenia@verris.pl', userId: null, usedBytes: 0n, aliases: [], forwards: [] } : (o.skrzynka ?? null),
      ),
    },
    controlPlaneMailAlias: { findUnique: vi.fn(async () => o.alias ?? null), create },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const mapSync = { writeMapsToDisk: vi.fn(async () => undefined) };
  const svc = new ControlPlaneMailService(prisma as never, audit as never, mapSync as never, {} as never, {} as never, { get: () => undefined } as never);
  return { svc, create };
}

describe('Poczta zespołu — alias zajęty przez inną skrzynkę (12.10)', () => {
  it('abuse@ przypisany do kontakt@ → 409 z nazwą skrzynki, bez próby zapisu', async () => {
    const { svc, create } = zbuduj({ alias: { targetId: 'mb-kontakt', target: { email: 'kontakt@verris.pl' } } });
    const p = svc.addAlias('mb-zgl', { aliasEmail: 'abuse@verris.pl' } as never, 'admin');
    await expect(p).rejects.toBeInstanceOf(ConflictException);
    await expect(p).rejects.toThrow('kontakt@verris.pl');
    expect(create).not.toHaveBeenCalled();
  });

  it('alias już na tej skrzynce → 409 „już wskazuje na tę skrzynkę”', async () => {
    const { svc } = zbuduj({ alias: { targetId: 'mb-zgl', target: { email: 'zgloszenia@verris.pl' } } });
    await expect(svc.addAlias('mb-zgl', { aliasEmail: 'support@verris.pl' } as never, 'admin')).rejects.toThrow('już wskazuje na tę skrzynkę');
  });

  it('adres istniejącej skrzynki → 409', async () => {
    const { svc } = zbuduj({ skrzynka: { id: 'mb-kontakt' } });
    await expect(svc.addAlias('mb-zgl', { aliasEmail: 'kontakt@verris.pl' } as never, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('wyścig (P2002 przy zapisie) → 409, nie 500', async () => {
    const { svc } = zbuduj({ createBlad: Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }) });
    await expect(svc.addAlias('mb-zgl', { aliasEmail: 'abuse@verris.pl' } as never, 'admin')).rejects.toBeInstanceOf(ConflictException);
  });

  it('wolny adres → zapis jak dotąd', async () => {
    const { svc, create } = zbuduj();
    await expect(svc.addAlias('mb-zgl', { aliasEmail: 'abuse@verris.pl' } as never, 'admin')).resolves.toMatchObject({ aliasEmail: 'abuse@verris.pl' });
    expect(create).toHaveBeenCalledOnce();
  });
});

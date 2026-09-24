import { BadRequestException } from '@nestjs/common';
import { SshAccessService, sprawdzKlucze } from './ssh-access.service';

/**
 * C-21/C-22 — strona API. Skrypt węzła sprawdzony lokalnie: bez CageFS odmowa, user.conf i powłoka
 * spójne, AllowUsers tylko gdy istnieje, klucze klienta poza blokiem zostają, treść pliku klienta
 * nie trafia do kodu wykonywanego jako root.
 */
const ED = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFE8wyG93sBkAeXQeGPkHdudLWhIf+zJIuMJAkMR2Be4 jan@laptop';

function stanowisko() {
  const account = { id: 'a1', serverId: 'n1', status: 'ACTIVE', daUsername: 'klient1' };
  const prisma = {
    subscription: { findFirst: jest.fn(async () => ({ id: 's1', userId: 'u1', account })) },
    nodeTask: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
      create: jest.fn(async (a: { data: Record<string, unknown> }) => ({ id: 't1', ...a.data })),
    },
  };
  return { svc: new SshAccessService(prisma as never, { record: jest.fn(async () => undefined) } as never), prisma };
}

describe('SshAccessService', () => {
  it('klucze: normalizacja, bez duplikatów, base64 do skryptu', async () => {
    const s = stanowisko();
    await s.svc.ustawKlucze('s1', 'u1', [`  ${ED}  `, ED]);
    const data = (s.prisma.nodeTask.create.mock.calls[0] as unknown as [{ data: { kind: string; payload: { keys: string[]; keysB64: string; daUser: string } } }])[0].data;
    expect(data.kind).toBe('SSH_ACCESS');
    expect(data.payload.keys).toEqual([ED]);
    expect(Buffer.from(data.payload.keysB64, 'base64').toString()).toBe(ED);
    expect(data.payload.daUser).toBe('klient1');
  });

  it.each([
    [`command="rm -rf ~" ${ED}`],
    ['ssh-ed25519 AAAA'],
    ['ssh-dss AAAAB3NzaC1kc3MAAACBAP krotki'],
    [`${ED}\nssh-ed25519 AAAAC3Nz drugi`],
  ])('odrzuca %j', (k) => {
    expect(() => sprawdzKlucze([k])).toThrow(BadRequestException);
  });

  it('pusta lista = usunięcie kluczy z bloku Verris', () => {
    expect(sprawdzKlucze([])).toEqual([]);
  });

  it('włączenie: zadanie enable', async () => {
    const s = stanowisko();
    await s.svc.przelacz('s1', 'u1', true);
    expect(s.prisma.nodeTask.create).toHaveBeenCalledWith({ data: expect.objectContaining({ payload: { mode: 'enable', daUser: 'klient1' } }) });
  });
});

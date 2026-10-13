import { EcoPointsService } from './eco-points.service.js';

/**
 * Audyt 13.10 (webauthn verifyRegistration → awardPasskeyRegistered) — nagroda za passkey była deduplikowana
 * po credentialId: dodaj → usuń → dodaj klucz dawało kolejne 5 pkt za każdym razem.
 */
function baza() {
  const wpisy: Array<{ userId: string; reason: string; referenceId: string | null; delta: number }> = [];
  const user = { ecoPoints: 0 };
  const db = {
    ecoPointsLedgerEntry: {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        wpisy.find((w) => Object.entries(where).every(([k, v]) => (w as Record<string, unknown>)[k] === v)) ?? null,
      ),
      create: vi.fn(async ({ data }: { data: (typeof wpisy)[number] }) => { wpisy.push(data); return data; }),
    },
    user: { update: vi.fn(async ({ data }: { data: { ecoPoints: { increment: number } } }) => { user.ecoPoints += data.ecoPoints.increment; }) },
  };
  return { db, wpisy, user };
}

describe('Eko-punkty — passkey raz na konto', () => {
  it('rejestracja → usunięcie → rejestracja nowego klucza: jeden wpis i 5 pkt', async () => {
    const b = baza();
    const svc = new EcoPointsService({} as never);
    expect(await svc.awardPasskeyRegistered(b.db as never, 'u1', 'klucz-1')).toBe(true);
    expect(await svc.awardPasskeyRegistered(b.db as never, 'u1', 'klucz-2')).toBe(false);
    expect(await svc.awardPasskeyRegistered(b.db as never, 'u1', 'klucz-3')).toBe(false);
    expect(b.wpisy).toHaveLength(1);
    expect(b.wpisy[0].referenceId).toBe('klucz-1');
    expect(b.user.ecoPoints).toBe(5);
  });

  it('inne konto dostaje swoją nagrodę', async () => {
    const b = baza();
    const svc = new EcoPointsService({} as never);
    await svc.awardPasskeyRegistered(b.db as never, 'u1', 'k');
    expect(await svc.awardPasskeyRegistered(b.db as never, 'u2', 'k2')).toBe(true);
  });
});

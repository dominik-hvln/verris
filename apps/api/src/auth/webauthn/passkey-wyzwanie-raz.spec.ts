vi.mock('@simplewebauthn/server', async (orig) => ({
  ...(await orig<typeof import('@simplewebauthn/server')>()),
  // Atrapa weryfikacji: przechodzi, gdy wyzwanie z odpowiedzi pasuje do zapisanego (jak prawdziwa).
  verifyRegistrationResponse: vi.fn(async (o: { response: { id: string }; expectedChallenge: (c: string) => boolean }) => ({
    verified: o.expectedChallenge('wyzwanie-1'),
    registrationInfo: {
      credential: { id: o.response.id, publicKey: new Uint8Array([1, 2, 3]), counter: 0, transports: ['internal'] },
      credentialDeviceType: 'multiDevice',
      credentialBackedUp: true,
    },
  })),
}));

import { WebAuthnService } from './webauthn.service.js';

/**
 * Noc 15.10 (rewalidacja audytu 13.10, pkt 3): wyzwanie rejestracji passkey było tylko porównywane, a czyszczone przy
 * zapisie — N równoległych rejestracji N kluczy na to samo wyzwanie widziało „0 kluczy” i każda przyznawała punkty EKO
 * (wymienialne na kredyt w portfelu). Teraz wyzwanie jest zużywane atomowo przed zapisem klucza: przechodzi jedna.
 */
function serwis() {
  let wyzwanie: string | null = 'wyzwanie-1';
  const klucze: string[] = [];
  const prisma = {
    user: {
      findUnique: vi.fn(async () => ({ id: 'u1', email: 'jan@firma.pl', firstName: 'Jan', webauthnChallenge: 'wyzwanie-1', webauthnChallengeExpires: new Date(Date.now() + 60_000) })),
      updateMany: vi.fn(async ({ where }: { where: { webauthnChallenge: string } }) => {
        await new Promise((r) => setImmediate(r));
        if (wyzwanie !== where.webauthnChallenge) return { count: 0 };
        wyzwanie = null;
        return { count: 1 };
      }),
      update: vi.fn(async () => ({})),
    },
    webAuthnCredential: {
      count: vi.fn(async () => klucze.length),
      create: vi.fn(async ({ data }: { data: { credentialId: string } }) => { klucze.push(data.credentialId); return data; }),
    },
    $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  const eco = { safeAward: vi.fn((_k: string, fn: () => Promise<void>) => void fn()), awardPasskeyRegistered: vi.fn(async () => true) };
  const config = { get: (k: string) => ({ WEBAUTHN_RP_ID: 'panel.verris.pl', WEBAUTHN_ORIGINS: 'https://panel.verris.pl' })[k] };
  const svc = new WebAuthnService(prisma as never, config as never, eco as never, { send: vi.fn(async () => undefined) } as never, { record: vi.fn(async () => undefined) } as never);
  return { svc, eco, klucze };
}

describe('passkey — wyzwanie rejestracji zużywane raz', () => {
  it('5 równoległych rejestracji na jedno wyzwanie: jeden klucz, jedna nagroda EKO, reszta odrzucona', async () => {
    const { svc, eco, klucze } = serwis();
    const wyniki = await Promise.allSettled([1, 2, 3, 4, 5].map((i) => svc.verifyRegistration('u1', { id: `klucz-${i}` } as never, 'MacBook')));
    expect(wyniki.filter((w) => w.status === 'fulfilled')).toHaveLength(1);
    expect(klucze).toHaveLength(1);
    expect(eco.awardPasskeyRegistered).toHaveBeenCalledTimes(1);
  });
});

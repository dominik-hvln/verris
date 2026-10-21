import { CryptoService } from '../../src/common/crypto/crypto.service.js';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { GitDeployService } from '../../src/subscriptions/git-deploy.service.js';
import { prisma, rozlacz, utworzPlan, utworzWezel, wyczyscBaze } from './setup.js';

/**
 * 21.10 — ustawienia wdrożeń z Gita na prawdziwej bazie: zmienne leżą w bazie tylko zaszyfrowane, zadanie pull
 * dostaje je jako .env, po zadaniu (sukces) ich nie ma w payloadzie, a usunięcie konta kasuje ustawienia.
 */
async function konto() {
  const plan = await utworzPlan();
  const w = await utworzWezel();
  const user = await prisma().user.create({ data: { email: `git-${Date.now()}@test.verris.pl`, passwordHash: 'x' } });
  const sub = await prisma().subscription.create({ data: { userId: user.id, planId: plan.id, interval: 'MONTH', priceAmount: 45, status: 'ACTIVE' } });
  const account = await prisma().account.create({
    data: { userId: user.id, subscriptionId: sub.id, serverId: w.id, daUsername: 'gitk1', domain: 'git-test.pl', status: 'ACTIVE' } as never,
  });
  return { user, sub, account };
}

function usluga() {
  const p = prisma() as never;
  const da = { assertDomainOwnedBySubscription: async (_s: string, _u: string, d: string) => d };
  return new GitDeployService(p, new AuditService(p), da as never, { get: () => undefined } as never, new CryptoService({ get: () => 'klucz-testowy-git' } as never));
}

describe('Wdrożenia z Gita — budowanie i zmienne (baza)', () => {
  beforeEach(wyczyscBaze);
  afterAll(rozlacz);

  it('zmienne zaszyfrowane w bazie, w zadaniu jako .env; nazwy w stanie, wartości nigdzie', async () => {
    const { user, sub, account } = await konto();
    const git = usluga();
    const stan = await git.ustawKonfiguracje(sub.id, user.id, { domain: 'git-test.pl', budowanie: 'npm-build', zmienne: { ustaw: { API_KEY: 'sk-tajne-123', NAZWA: 'Moja firma' } } });
    expect(stan.konfiguracje).toEqual([expect.objectContaining({ katalog: '', budowanie: 'npm-build', zmienne: ['API_KEY', 'NAZWA'] })]);
    expect(JSON.stringify(stan)).not.toContain('sk-tajne-123');

    const wiersz = await prisma().gitKonfiguracja.findFirstOrThrow({ where: { accountId: account.id } });
    expect(wiersz.zmienneEnc).toBeTruthy();
    expect(wiersz.zmienneEnc).not.toContain('sk-tajne-123');

    await git.zlec(sub.id, user.id, 'pull', { domain: 'git-test.pl' });
    const zadanie = await prisma().nodeTask.findFirstOrThrow({ where: { accountId: account.id, kind: 'GIT_DEPLOY' } });
    const payload = zadanie.payload as { build: string; envSecret: string };
    expect(payload.build).toBe('npm-build');
    expect(Buffer.from(payload.envSecret, 'base64').toString()).toBe("API_KEY=sk-tajne-123\nNAZWA='Moja firma'");

    const dziennik = await prisma().auditLog.findMany({ where: { action: 'HOSTING_GIT_CONFIG_UPDATED' } });
    expect(dziennik).toHaveLength(1);
    expect(JSON.stringify(dziennik[0].details)).not.toContain('sk-tajne-123');
  });

  it('usunięcie wszystkich zmiennych czyści szyfrogram; usunięcie konta kasuje ustawienia (kaskada)', async () => {
    const { user, sub, account } = await konto();
    const git = usluga();
    await git.ustawKonfiguracje(sub.id, user.id, { domain: 'git-test.pl', dir: 'app', budowanie: '', zmienne: { ustaw: { A: '1' } } });
    await git.ustawKonfiguracje(sub.id, user.id, { domain: 'git-test.pl', dir: 'app', budowanie: 'composer', zmienne: { usun: ['A'] } });
    const w = await prisma().gitKonfiguracja.findFirstOrThrow({ where: { accountId: account.id } });
    expect(w).toMatchObject({ budowanie: 'composer', zmienneEnc: null, dir: 'app' });
    await expect(
      prisma().$executeRawUnsafe(`UPDATE "GitKonfiguracja" SET "budowanie" = 'rm -rf' WHERE "id" = '${w.id}'`),
    ).rejects.toThrow();
    await prisma().account.delete({ where: { id: account.id } });
    expect(await prisma().gitKonfiguracja.count()).toBe(0);
  });
});

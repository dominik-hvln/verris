import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DomainRegistrarService, rozpoczeteLata } from './domain-registrar.service.js';
import { WhoisPrivacyDto } from './dto/registrar.dto.js';
import { RegistrarProviderFactory } from './registrar.provider.js';

/** A-14 — ukrycie danych w WHOIS (decyzja właściciela 2026-10-05): płatne, cena ustawiana przez admina. */

const ZA_DWA_LATA = new Date(Date.now() + 1.5 * 365 * 24 * 3600_000); // 1,5 roku → 2 rozpoczęte lata

function zbuduj(opcje: { cena: string | null; domena?: Record<string, unknown>; provider?: Record<string, unknown> }) {
  const domena = { id: 'd1', name: 'jan.com', userId: 'u1', registrarExternalId: '777', whoisPrivacy: false, expiresAt: ZA_DWA_LATA, ...opcje.domena };
  const provider = { id: 'openprovider', setWhoisPrivacy: vi.fn(), price: vi.fn().mockResolvedValue({ amount: '40.00', currency: 'PLN' }), renew: vi.fn().mockResolvedValue({ provider: 'openprovider', providerOrderId: '777' }), ...opcje.provider };
  const db = {
    $queryRaw: vi.fn(),
    domainRegistrarOrder: {
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'o1', ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ id: 'o1', ...data })),
    },
    domain: { update: vi.fn() },
  };
  const prisma = {
    ...db,
    domain: { findFirst: vi.fn().mockResolvedValue(domena), update: vi.fn() },
    $transaction: vi.fn(async (cb: (d: typeof db) => unknown) => cb(db)),
  };
  const wallet = { debit: vi.fn().mockResolvedValue({ id: 'tx1' }), credit: vi.fn() };
  const audit = { record: vi.fn() };
  const settings = { getWhoisPrivacyPrice: vi.fn().mockResolvedValue(opcje.cena) };
  const nbp = { getRates: vi.fn().mockResolvedValue({ usdPln: 3.65, eurPln: 4.32 }) };
  const service = new DomainRegistrarService(
    prisma as never, audit as never, {} as never, { get: () => provider } as never, wallet as never,
    { get: () => undefined } as never, nbp as never, { safeAward: vi.fn() } as never, settings as never,
  );
  return { service, prisma, db, wallet, audit, provider };
}

describe('A-14 — włączenie ukrycia danych w WHOIS', () => {
  it('bez ceny w ustawieniach usługa niedostępna — bez opłaty i bez rejestratora', async () => {
    const { service, wallet, provider } = zbuduj({ cena: null });
    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', true)).rejects.toThrow('nie jest jeszcze dostępne');
    expect(wallet.debit).not.toHaveBeenCalled();
    expect(provider.setWhoisPrivacy).not.toHaveBeenCalled();
  });

  it('pobiera cenę × rozpoczęte lata do końca ważności PRZED rejestratorem, zapisuje stan i audyt', async () => {
    const kolejnosc: string[] = [];
    const { service, wallet, provider, prisma, audit, db } = zbuduj({ cena: '19.99' });
    wallet.debit.mockImplementation(async () => { kolejnosc.push('portfel'); return { id: 'tx1' }; });
    provider.setWhoisPrivacy.mockImplementation(async () => { kolejnosc.push('rejestrator'); });

    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', true)).resolves.toEqual({ whoisPrivacy: true });
    expect(kolejnosc).toEqual(['portfel', 'rejestrator']);
    expect(wallet.debit).toHaveBeenCalledWith(expect.objectContaining({
      amount: '39.98', description: 'Ukrycie danych w WHOIS — jan.com (2 lata)', idempotencyKey: 'domain-whois_privacy:o1',
    }));
    expect(db.domainRegistrarOrder.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'WHOIS_PRIVACY', years: 2 }) });
    expect(provider.setWhoisPrivacy).toHaveBeenCalledWith('777', true);
    expect(prisma.domain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whoisPrivacy: true }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOMAIN_WHOIS_PRIVACY_ENABLED' }));
  });

  it('zamówienie w toku → odmowa bez drugiej opłaty (dwuklik)', async () => {
    const { service, wallet, db } = zbuduj({ cena: '19.99' });
    db.domainRegistrarOrder.findFirst.mockResolvedValue({ id: 'o0' });
    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', true)).rejects.toThrow('w toku');
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('już włączone → nic nie pobiera', async () => {
    const { service, wallet } = zbuduj({ cena: '19.99', domena: { whoisPrivacy: true } });
    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', true)).resolves.toEqual({ whoisPrivacy: true });
    expect(wallet.debit).not.toHaveBeenCalled();
  });

  it('rejestr nie pozwala (.pl) → zwrot pieniędzy i zrozumiały komunikat, stan bez zmian', async () => {
    const { service, wallet, prisma } = zbuduj({
      cena: '19.99',
      domena: { name: 'jan.pl' },
      provider: { setWhoisPrivacy: vi.fn().mockRejectedValue(new Error('OpenProvider: Whois privacy is not supported for this extension')) },
    });
    const err = await service.setWhoisPrivacy('u1', 'u1', 'd1', true).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/Rejestr tej domeny nie pozwala ukryć danych w WHOIS/);
    expect(wallet.credit).toHaveBeenCalledWith(expect.objectContaining({ amount: '39.98', idempotencyKey: 'domain-whois_privacy-refund:o1' }));
    expect(prisma.domain.update).not.toHaveBeenCalled();
  });

  it('awaria rejestratora innego rodzaju → zwrot, błąd bez przekłamania', async () => {
    const { service, wallet } = zbuduj({
      cena: '19.99',
      provider: { setWhoisPrivacy: vi.fn().mockRejectedValue(new Error('OpenProvider nie odpowiada — spróbuj za chwilę.')) },
    });
    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', true)).rejects.toThrow('nie odpowiada');
    expect(wallet.credit).toHaveBeenCalled();
  });
});

describe('A-14 — wyłączenie i odnowienie', () => {
  it('wyłączenie: rejestrator + stan + audyt, bez opłaty i bez zwrotu', async () => {
    const { service, wallet, provider, prisma, audit } = zbuduj({ cena: '19.99', domena: { whoisPrivacy: true } });
    await expect(service.setWhoisPrivacy('u1', 'u1', 'd1', false)).resolves.toEqual({ whoisPrivacy: false });
    expect(provider.setWhoisPrivacy).toHaveBeenCalledWith('777', false);
    expect(wallet.debit).not.toHaveBeenCalled();
    expect(wallet.credit).not.toHaveBeenCalled();
    expect(prisma.domain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ whoisPrivacy: false }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'DOMAIN_WHOIS_PRIVACY_DISABLED' }));
  });

  it('odnowienie domeny z ukryciem danych dolicza cenę × lata — w wycenie osobno, w portfelu jedno obciążenie', async () => {
    const bez = zbuduj({ cena: '19.99' });
    const z = zbuduj({ cena: '19.99', domena: { whoisPrivacy: true } });
    const qBez = await bez.service.renewQuote('u1', 'd1', 2);
    const qZ = await z.service.renewQuote('u1', 'd1', 2);
    expect(qBez.whoisPrivacyAmount).toBeNull();
    expect(qZ.whoisPrivacyAmount).toBe('39.98');
    expect(Number(qZ.priceAmount)).toBeCloseTo(Number(qBez.priceAmount) + 39.98, 2);

    await z.service.renew('u1', 'u1', 'd1', 2);
    expect(z.wallet.debit).toHaveBeenCalledTimes(1);
    expect(z.wallet.debit).toHaveBeenCalledWith(expect.objectContaining({ amount: qZ.priceAmount, description: expect.stringContaining('z ukryciem danych w WHOIS') }));
  });

  it('rozpoczęte lata: brak daty i <1 rok → 1; 1,5 roku → 2', () => {
    const teraz = new Date('2026-10-05T00:00:00Z');
    expect(rozpoczeteLata(null, teraz)).toBe(1);
    expect(rozpoczeteLata(new Date('2027-01-01T00:00:00Z'), teraz)).toBe(1);
    expect(rozpoczeteLata(new Date('2026-01-01T00:00:00Z'), teraz)).toBe(1);
    expect(rozpoczeteLata(new Date('2028-04-05T00:00:00Z'), teraz)).toBe(2);
  });

  it('DTO wymaga wartości logicznej', () => {
    expect(validateSync(plainToInstance(WhoisPrivacyDto, { enabled: true }))).toEqual([]);
    expect(validateSync(plainToInstance(WhoisPrivacyDto, { enabled: 'tak' })).map((e) => e.property)).toEqual(['enabled']);
    expect(validateSync(plainToInstance(WhoisPrivacyDto, {})).map((e) => e.property)).toEqual(['enabled']);
  });
});

describe('A-14 — OpenProvider: is_private_whois_enabled', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H',
  };
  afterEach(() => vi.unstubAllGlobals());

  it('PUT /v1/domains/{id} z { is_private_whois_enabled }, odczyt w domainInfo', async () => {
    const zapytania: { url: string; method?: string; body?: string }[] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method?: string; body?: string }) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      zapytania.push({ url, method: init.method, body: init.body });
      return new Response(JSON.stringify({ code: 0, data: { owner_handle: 'JK1', is_locked: true, is_private_whois_enabled: true } }));
    }));
    const op = new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get();
    await op.setWhoisPrivacy('777', true);
    expect(zapytania[0]).toMatchObject({ method: 'PUT', body: JSON.stringify({ is_private_whois_enabled: true }) });
    expect(zapytania[0].url).toMatch(/\/v1\/domains\/777$/);
    await expect(op.domainInfo('777')).resolves.toMatchObject({ privateWhois: true });
  });

  it('brak pola w odpowiedzi → privateWhois null (nie „wyłączone”)', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      new Response(JSON.stringify(url.endsWith('/auth/login') ? { code: 0, data: { token: 't' } } : { code: 0, data: { owner_handle: 'JK1' } }))));
    const op = new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get();
    await expect(op.domainInfo('777')).resolves.toMatchObject({ privateWhois: null });
  });
});

import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { DomainRegistrarService } from './domain-registrar.service.js';
import { OpenproviderWebhookController, sprawdzWebhookOp } from './openprovider-webhook.controller.js';
import { RegistrarProviderFactory } from './registrar.provider.js';

/**
 * t1 07.10 — webhooki OpenProvidera. Przy okazji: transfer wychodzący nie był obsługiwany wcale —
 * domena przeniesiona do innego rejestratora zostawała na koncie z przypomnieniami o odnowieniu.
 */
const KLUCZ = 'k'.repeat(32);
const SEKRET = 's'.repeat(32);
const podpisz = (raw: string, t = Math.floor(Date.now() / 1000), sekret = SEKRET) =>
  `t=${t},v1=${createHmac('sha256', sekret).update(`${t}.${raw}`).digest('hex')}`;

describe('podpis webhooka OpenProvidera', () => {
  const raw = JSON.stringify({ id: 1, eventType: 'testEvent' });
  const ok = { raw: Buffer.from(raw), auth: `Bearer ${KLUCZ}`, podpis: podpisz(raw), apiKey: KLUCZ, secret: SEKRET };

  it('poprawny klucz i podpis → przyjęte', () => {
    expect(sprawdzWebhookOp(ok)).toBe(true);
  });

  it('zły klucz, brak podpisu, podpis innym sekretem, zmieniona treść, stary znacznik czasu → odrzucone', () => {
    expect(sprawdzWebhookOp({ ...ok, auth: 'Bearer zly' })).toBe(false);
    expect(sprawdzWebhookOp({ ...ok, auth: undefined })).toBe(false);
    expect(sprawdzWebhookOp({ ...ok, podpis: undefined })).toBe(false);
    expect(sprawdzWebhookOp({ ...ok, podpis: podpisz(raw, undefined, 'inny') })).toBe(false);
    expect(sprawdzWebhookOp({ ...ok, raw: Buffer.from(raw.replace('testEvent', 'outgoingTransferCompleted')) })).toBe(false);
    expect(sprawdzWebhookOp({ ...ok, podpis: podpisz(raw, Math.floor(Date.now() / 1000) - 301) })).toBe(false);
  });
});

describe('kontroler webhooka', () => {
  const raw = JSON.stringify({ id: 7, eventType: 'testEvent' });
  const zbuduj = (env: Record<string, string>) => {
    const registrar = { zdarzenieOp: vi.fn() };
    const c = new OpenproviderWebhookController({ get: (k: string) => env[k] } as never, registrar as never);
    return { c, registrar };
  };
  const req = { rawBody: Buffer.from(raw) } as never;

  it('bez kluczy w konfiguracji → 404 (webhook wyłączony)', async () => {
    await expect(zbuduj({}).c.odbierz(req, `Bearer ${KLUCZ}`, podpisz(raw))).rejects.toBeInstanceOf(NotFoundException);
  });

  it('zły podpis → 401 i nic nie robi; dobry → przekazuje zdarzenie', async () => {
    const { c, registrar } = zbuduj({ OPENPROVIDER_WEBHOOK_API_KEY: KLUCZ, OPENPROVIDER_WEBHOOK_SECRET: SEKRET });
    await expect(c.odbierz(req, `Bearer ${KLUCZ}`, podpisz(raw, undefined, 'x'))).rejects.toBeInstanceOf(UnauthorizedException);
    expect(registrar.zdarzenieOp).not.toHaveBeenCalled();
    await expect(c.odbierz(req, `Bearer ${KLUCZ}`, podpisz(raw))).resolves.toEqual({ ok: true });
    expect(registrar.zdarzenieOp).toHaveBeenCalledWith({ id: 7, eventType: 'testEvent' });
  });

  it('podpisana, ale nie-JSON → 400', async () => {
    const { c } = zbuduj({ OPENPROVIDER_WEBHOOK_API_KEY: KLUCZ, OPENPROVIDER_WEBHOOK_SECRET: SEKRET });
    await expect(c.odbierz({ rawBody: Buffer.from('{') } as never, `Bearer ${KLUCZ}`, podpisz('{'))).rejects.toBeInstanceOf(BadRequestException);
  });
});

function usluga(o: { domena?: Record<string, unknown> | null; provider?: Record<string, unknown>; env?: Record<string, string> } = {}) {
  const domena = o.domena === undefined
    ? { id: 'd1', name: 'jan.com', userId: 'u1', registrarExternalId: '456', expiresAt: new Date('2027-08-08T00:00:00Z') }
    : o.domena;
  const prisma = {
    domain: { findFirst: vi.fn().mockResolvedValue(domena), update: vi.fn(), findMany: vi.fn().mockResolvedValue([]) },
    domainRegistrarOrder: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const audit = { record: vi.fn() };
  const provider = { id: 'openprovider', ...o.provider };
  const env = o.env ?? {};
  const service = new DomainRegistrarService(
    prisma as never, audit as never, {} as never, { get: () => provider } as never, {} as never,
    { get: (k: string) => env[k] } as never, {} as never, {} as never, {} as never,
  );
  return { service, prisma, audit, provider };
}

describe('zdarzenia OpenProvidera', () => {
  it('outgoingTransferCompleted → domena bez obsługi rejestratora (bez odnowień i przypomnień), audyt', async () => {
    const { service, prisma, audit } = usluga();
    await service.zdarzenieOp({ id: 123, eventType: 'outgoingTransferCompleted', data: { domainId: 456, domain: 'jan.com', status: 'DEL' } });
    expect(prisma.domain.findFirst).toHaveBeenCalledWith({ where: { registrarExternalId: '456' } });
    expect(prisma.domain.update).toHaveBeenCalledWith({
      where: { id: 'd1' },
      data: expect.objectContaining({ registrarExternalId: null, registrarStatus: 'TRANSFERRED_OUT', expiresAt: null, autoRenew: false, whoisPrivacy: false }),
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTRAR_WEBHOOK', details: expect.objectContaining({ eventType: 'outgoingTransferCompleted', domain: 'jan.com' }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'DOMAIN_LEFT_REGISTRAR', userId: 'u1', details: { domain: 'jan.com', powod: 'TRANSFERRED_OUT', externalId: '456', expiresAt: '2027-08-08T00:00:00.000Z' },
    }));
  });

  it('powtórne doręczenie / nieznana domena → bez zmian w bazie', async () => {
    const { service, prisma } = usluga({ domena: null });
    await service.zdarzenieOp({ eventType: 'deletionCompleted', data: { domainId: 456 } });
    expect(prisma.domain.update).not.toHaveBeenCalled();
  });

  it('incomingTransferCompleted → ten sam przebieg co godzinne domykanie transferów', async () => {
    const { service } = usluga();
    const domknij = vi.spyOn(service, 'domknijTransfery').mockResolvedValue({ zakonczone: 1, nieudane: 0 });
    await service.zdarzenieOp({ eventType: 'incomingTransferCompleted', data: { domainId: 9 } });
    expect(domknij).toHaveBeenCalledTimes(1);
  });

  it('inne zdarzenia (testEvent, messageReceived) → tylko dziennik', async () => {
    const { service, prisma, audit } = usluga();
    const domknij = vi.spyOn(service, 'domknijTransfery');
    await service.zdarzenieOp({ id: 1, eventType: 'testEvent' });
    expect(domknij).not.toHaveBeenCalled();
    expect(prisma.domain.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledTimes(1);
  });
});

describe('codzienne sprawdzenie (gdy webhook nie doszedł)', () => {
  it('DEL/FAI u rejestratora → domena odeszła; aktywna i błąd zapytania → bez zmian', async () => {
    const stany: Record<string, unknown> = { '1': { state: 'failed' }, '2': { state: 'active' } };
    const { service, prisma } = usluga({
      provider: { domainInfo: vi.fn(async (id: string) => { if (!stany[id]) throw new Error('timeout'); return stany[id]; }) },
    });
    prisma.domain.findMany.mockResolvedValue([{ registrarExternalId: '1' }, { registrarExternalId: '2' }, { registrarExternalId: '3' }]);
    await expect(service.sprawdzOpuszczone()).resolves.toEqual({ sprawdzone: 3, odeszly: 1 });
    expect(prisma.domain.update).toHaveBeenCalledTimes(1);
    expect(prisma.domain.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ registrarStatus: 'REGISTRAR_DEL' }) }));
  });
});

describe('włączenie webhooka (admin)', () => {
  it('bez klucza i sekretu → jasny błąd, rejestrator nietknięty', async () => {
    const configureWebhook = vi.fn();
    await expect(usluga({ provider: { configureWebhook } }).service.wlaczWebhookOp('a1')).rejects.toThrow(/prod-ustaw-klucze.sh openprovider/);
    expect(configureWebhook).not.toHaveBeenCalled();
  });

  it('adres z PUBLIC_API_URL, klucz i sekret z konfiguracji, audyt', async () => {
    const configureWebhook = vi.fn();
    const { service, audit } = usluga({
      provider: { configureWebhook },
      env: { OPENPROVIDER_WEBHOOK_API_KEY: KLUCZ, OPENPROVIDER_WEBHOOK_SECRET: SEKRET, PUBLIC_API_URL: 'https://api.verris.pl/' },
    });
    await expect(service.wlaczWebhookOp('a1')).resolves.toEqual({ host: 'https://api.verris.pl/webhooks/openprovider' });
    expect(configureWebhook).toHaveBeenCalledWith('https://api.verris.pl/webhooks/openprovider', KLUCZ, SEKRET);
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'REGISTRAR_WEBHOOK_CONFIGURED', details: { host: 'https://api.verris.pl/webhooks/openprovider' } }));
  });

  it('OpenProvider: PUT /v1beta/resellers/{reseller_id z logowania} z notifications_settings', async () => {
    const cfg: Record<string, string> = { REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'H' };
    const fetchMock = vi.fn(async (url: string, _init: { method?: string; body: string }) => {
      if (url.endsWith('/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't', reseller_id: 314 } }));
      return new Response(JSON.stringify({ code: 0, data: { success: true } }));
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      await new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).get().configureWebhook!('https://api.verris.pl/webhooks/openprovider', KLUCZ, SEKRET);
      const [url, init] = fetchMock.mock.calls.find((c) => String(c[0]).includes('/resellers/'))!;
      expect(url).toMatch(/\/v1beta\/resellers\/314$/);
      expect(init.method).toBe('PUT');
      expect(JSON.parse(init.body)).toEqual({
        notifications_settings: { is_webhook_enabled: true, webhook_settings: { host: 'https://api.verris.pl/webhooks/openprovider', api_key: KLUCZ, signature_secret: SEKRET } },
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

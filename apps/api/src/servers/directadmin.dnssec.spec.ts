import { BadRequestException } from '@nestjs/common';
import { DirectAdminService } from './directadmin.service';

/**
 * F-06 — DNSSEC przez CMD_API_DNS_ADMIN action=dnssec (docs.directadmin.com: changelog 1.44.2/1.51.0,
 * „Maintaining DNS records” → DNSSEC). Kluczowe: nowe klucze tylko, gdy ich nie ma (zmiana DS przy
 * istniejącym wpisie u rejestratora zepsułaby rozwiązywanie domeny), cudza domena i konto zawieszone bez DA.
 */
const PODPISANA = new URLSearchParams({
  DS: 'firma.pl. IN DS 12345 13 2 ABCDEF\nfirma.pl. IN DS 12345 13 4 012345',
  ksk_id: '12345', zsk_id: '54321', signed_on: 'Thu Sep 25 12:00:00 2026', expiry: '1792000000',
}).toString();

function stanowisko(o: { odpowiedz?: string; status?: string } = {}) {
  const account = { id: 'a1', status: o.status ?? 'ACTIVE', serverId: 'srv1', daUsername: 'klient1', daPasswordEnc: 'enc' };
  const svc = new DirectAdminService({} as never, {} as never, {} as never, { record: jest.fn(async () => undefined) } as never);
  let stan = o.odpowiedz ?? 'error=0';
  const get = jest.fn(async (_p: string, _c?: unknown) => ({ data: stan }));
  const post = jest.fn(async (_p: string, body: string) => {
    const f = new URLSearchParams(body);
    if (f.get('sign_zone')) stan = PODPISANA;
    if (f.get('remove_dnssec')) stan = 'error=0';
    return { data: 'error=0&text=OK' };
  });
  jest.spyOn(svc, 'getClientForServer').mockResolvedValue({ client: { get, post } } as never);
  Object.assign(svc, {
    accountClientForSubscription: jest.fn(async () => ({ account, client: {} })),
    assertDomainOwnedBySubscription: jest.fn(async (_s: string, _u: string, d: string) => {
      if (d !== 'firma.pl') throw new BadRequestException('Ta domena nie należy do tej usługi.');
      return d;
    }),
  });
  const audit = (svc as unknown as { audit: { record: jest.Mock } }).audit;
  const kroki = () => post.mock.calls.map((c) => Object.fromEntries(new URLSearchParams(String(c[1]))));
  return { svc, get, post, audit, kroki };
}

describe('DNSSEC', () => {
  it('stan: rekordy DS rozdzielone, podpisana od, klucze', async () => {
    const s = stanowisko({ odpowiedz: PODPISANA });
    const r = await s.svc.getHostingDnssec('s1', 'u1', 'firma.pl');
    expect(s.get).toHaveBeenCalledWith('/CMD_API_DNS_ADMIN', expect.objectContaining({ params: { domain: 'firma.pl', action: 'dnssec', value: 'get_keys' } }));
    expect(r).toMatchObject({ domain: 'firma.pl', klucze: true, podpisana: true, ds: ['firma.pl. IN DS 12345 13 2 ABCDEF', 'firma.pl. IN DS 12345 13 4 012345'], blad: null });
  });

  it('włączenie bez kluczy: generate_keys, potem sign_zone; wpis w audycie', async () => {
    const s = stanowisko();
    const r = await s.svc.enableHostingDnssec('s1', 'u1', 'firma.pl');
    expect(s.kroki()).toEqual([
      { action: 'dnssec', domain: 'firma.pl', generate_keys: 'yes' },
      { action: 'dnssec', domain: 'firma.pl', sign_zone: 'yes' },
    ]);
    expect(r.podpisana).toBe(true);
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DNSSEC_ENABLED', details: { subscriptionId: 's1', domain: 'firma.pl', noweKlucze: true } }));
  });

  it('klucze już są → tylko podpis, bez nowych kluczy (DS u rejestratora zostaje ważny)', async () => {
    const s = stanowisko({ odpowiedz: new URLSearchParams({ ksk_id: '1', zsk_id: '2', DS: 'x' }).toString() });
    await s.svc.enableHostingDnssec('s1', 'u1', 'firma.pl');
    expect(s.kroki()).toEqual([{ action: 'dnssec', domain: 'firma.pl', sign_zone: 'yes' }]);
  });

  it('wyłączenie: remove_dnssec i audyt', async () => {
    const s = stanowisko({ odpowiedz: PODPISANA });
    const r = await s.svc.disableHostingDnssec('s1', 'u1', 'firma.pl');
    expect(s.kroki()).toEqual([{ action: 'dnssec', domain: 'firma.pl', remove_dnssec: 'yes' }]);
    expect(r.podpisana).toBe(false);
    expect(s.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'HOSTING_DNSSEC_DISABLED' }));
  });

  it.each([
    ['cudza domena', 'cudza.pl', {}],
    ['konto zawieszone', 'firma.pl', { status: 'SUSPENDED' }],
  ])('%s → 400 bez zmian w DA', async (_n, domena, opcje) => {
    const s = stanowisko(opcje);
    await expect(s.svc.enableHostingDnssec('s1', 'u1', domena)).rejects.toBeInstanceOf(BadRequestException);
    await expect(s.svc.disableHostingDnssec('s1', 'u1', domena)).rejects.toBeInstanceOf(BadRequestException);
    expect(s.post).not.toHaveBeenCalled();
  });

  it('DNSSEC wyłączony na węźle (błąd DA) → komunikat w stanie, nie wyjątek', async () => {
    const r = await stanowisko({ odpowiedz: 'error=1&text=DNSSEC is not enabled' }).svc.getHostingDnssec('s1', 'u1', 'firma.pl');
    expect(r).toMatchObject({ podpisana: false, blad: 'DNSSEC is not enabled' });
  });
});

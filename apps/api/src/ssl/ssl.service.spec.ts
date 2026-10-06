import { ConflictException } from '@nestjs/common';
import { Prisma } from '@verris/database';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, X509Certificate } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { RegistrarProviderFactory, type SslOrderInfo } from '../domains/registrar.provider.js';
import { naDto, rekordWalidacji, SslService, wygenerujCsr } from './ssl.service.js';

/** Minimalny czytnik DER — tyle, ile trzeba, żeby rozebrać CSR (SEQ { info, alg, BIT STRING podpis }). */
function czytaj(buf: Buffer, off = 0): { tag: number; start: number; end: number; next: number } {
  const tag = buf[off];
  let len = buf[off + 1];
  let start = off + 2;
  if (len & 0x80) {
    const n = len & 0x7f;
    len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | buf[off + 2 + i];
    start += n;
  }
  return { tag, start, end: start + len, next: start + len };
}
const derZPem = (pem: string) => Buffer.from(pem.replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), 'base64');

describe('G-08 CSR i rekord weryfikacyjny', () => {
  it('CSR: podpis klucza pasuje do CertificationRequestInfo, CN = domena, klucz RSA 2048', () => {
    const { privateKeyPem, csr } = wygenerujCsr('*.firma.pl');
    const der = derZPem(csr);
    const cala = czytaj(der);
    const info = czytaj(der, cala.start);
    const alg = czytaj(der, info.next);
    const sig = czytaj(der, alg.next);
    expect(sig.tag).toBe(0x03);
    const infoBytes = der.subarray(cala.start, info.end);
    const podpis = der.subarray(sig.start + 1, sig.end);
    const pub = createPublicKey(createPrivateKey(privateKeyPem));
    expect(verify('sha256', infoBytes, pub, podpis)).toBe(true);
    expect(infoBytes.includes(Buffer.from('*.firma.pl'))).toBe(true);
    expect(pub.asymmetricKeyDetails?.modulusLength).toBe(2048);
  });

  it('CSR przechodzi weryfikację openssl (gdy jest w systemie)', () => {
    let openssl = true;
    try {
      execFileSync('openssl', ['version']);
    } catch {
      openssl = false;
    }
    if (!openssl) return;
    const dir = mkdtempSync(join(tmpdir(), 'csr-'));
    writeFileSync(join(dir, 'r.csr'), wygenerujCsr('firma.pl').csr);
    const out = execFileSync('openssl', ['req', '-in', join(dir, 'r.csr'), '-noout', '-verify', '-subject'], { stdio: 'pipe' }).toString();
    expect(out).toMatch(/CN\s*=\s*firma\.pl/);
    // OpenProvider wymaga kraju w CSR (sandbox D3 06.10: „invalid country code”).
    expect(out).toMatch(/C\s*=\s*PL/);
  });

  it('rekord: hash → TXT na „@”, nazwa hosta → CNAME z kropką, podrzędna nazwa względnie', () => {
    expect(rekordWalidacji('firma.pl', { record: 'firma.pl', value: '0453ff12' })).toEqual({ name: '@', type: 'TXT', value: '0453ff12' });
    expect(rekordWalidacji('firma.pl', { record: '_abc.firma.pl', value: 'x1.y2.sectigo.com' })).toEqual({ name: '_abc', type: 'CNAME', value: 'x1.y2.sectigo.com.' });
    expect(rekordWalidacji('firma.pl', { record: '*.firma.pl', value: 'abc' }).name).toBe('@');
  });
});

describe('G-08 OpenProvider SSL — wywołania wg dokumentacji /v1/ssl', () => {
  const cfg: Record<string, string> = {
    REGISTRAR_PROVIDER: 'openprovider', OPENPROVIDER_USERNAME: 'u', OPENPROVIDER_PASSWORD: 'p', OPENPROVIDER_OWNER_HANDLE: 'OP-H', OPENPROVIDER_API_BASE_URL: 'https://api.sandbox.openprovider.nl',
  };
  const ssl = () => new RegistrarProviderFactory({ get: (k: string) => cfg[k] } as never).getSsl();
  afterEach(() => vi.unstubAllGlobals());

  function stub(odp: (url: string, init: RequestInit) => unknown) {
    const f = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith('/v1/auth/login')) return new Response(JSON.stringify({ code: 0, data: { token: 't' } }));
      return new Response(JSON.stringify(odp(url, init)));
    });
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('produkty: GET /v1/ssl/products?with_price=true, koszt = cena resellera za 1 rok', async () => {
    const f = stub(() => ({
      code: 0,
      data: { results: [{ id: 5, name: 'PositiveSSL', brand_name: 'Sectigo', category: 'domain_validation', is_wildcard_supported: false, included_domains_count: 1, prices: [{ period: 2, price: { reseller: { price: 9, currency: 'EUR' } } }, { period: 1, price: { reseller: { price: 5.5, currency: 'EUR' } } }] }] },
    }));
    const [p] = await ssl().sslProducts();
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://api.sandbox.openprovider.nl/v1/ssl/products?with_price=true&limit=1000');
    expect(init.method).toBe('GET');
    expect(p).toEqual({ id: 5, name: 'PositiveSSL', brand: 'Sectigo', category: 'domain_validation', wildcard: false, singleDomain: true, cost: { amount: '5.5', currency: 'EUR' } });
  });

  it('zamówienie: POST /v1/ssl/orders z CSR, start_provision, metodą dns i uchwytem operatora — bez klucza prywatnego', async () => {
    const f = stub(() => ({ code: 0, data: { id: 77 } }));
    const { csr } = wygenerujCsr('firma.pl');
    await expect(ssl().sslCreateOrder({ productId: 5, years: 1, csr, hostName: 'firma.pl', validation: 'dns' })).resolves.toBe('77');
    const [url, init] = f.mock.calls[1];
    expect(url).toBe('https://api.sandbox.openprovider.nl/v1/ssl/orders');
    expect(init.method).toBe('POST');
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({
      product_id: 5, period: 1, csr, software_id: 'linux', start_provision: true, autorenew: 'off', signature_hash_algorithm: 'sha2',
      domain_validation_methods: [{ host_name: 'firma.pl', method: 'dns' }], organization_handle: 'OP-H', technical_handle: 'OP-H',
    });
    expect(String(init.body)).not.toContain('PRIVATE KEY');
  });

  it('zamówienie z e-mailem: approver_email i metoda email', async () => {
    const f = stub(() => ({ code: 0, data: { id: 78 } }));
    await ssl().sslCreateOrder({ productId: 5, years: 1, csr: 'CSR', hostName: 'firma.pl', validation: 'email', approverEmail: 'admin@firma.pl' });
    const body = JSON.parse(String(f.mock.calls[1][1].body));
    expect(body.approver_email).toBe('admin@firma.pl');
    expect(body.domain_validation_methods).toEqual([{ host_name: 'firma.pl', method: 'email' }]);
  });

  it('stan: ACT z certyfikatem = wydany, REQ = w toku z rekordem DNS, REJ = odrzucony', async () => {
    let odp: Record<string, unknown> = {};
    const f = stub(() => ({ code: 0, data: odp }));
    odp = { status: 'ACT', certificate: 'CERT', intermediate_certificate: 'CA' };
    await expect(ssl().sslOrder('77')).resolves.toEqual({ state: 'issued', certificate: 'CERT', caBundle: 'CA', dns: null });
    expect(f.mock.calls[1][0]).toBe('https://api.sandbox.openprovider.nl/v1/ssl/orders/77');
    odp = { status: 'REQ', certificate: '', additional_data: [{ dns_record: 'firma.pl', dns_value: 'abc' }] };
    await expect(ssl().sslOrder('77')).resolves.toMatchObject({ state: 'pending', dns: { record: 'firma.pl', value: 'abc' } });
    odp = { status: 'REJ' };
    await expect(ssl().sslOrder('77')).resolves.toMatchObject({ state: 'failed' });
  });

  it('bez OpenProvidera — sprzedaż niedostępna (bez wołania czegokolwiek)', () => {
    expect(() => new RegistrarProviderFactory({ get: () => undefined } as never).getSsl()).toThrow('Sprzedaż certyfikatów SSL jest chwilowo niedostępna.');
  });
});

// ---------------------------------------------------------------------------
// Cykl zamówienia na atrapach (pieniądze: test integracyjny ssl-certyfikaty.int-spec.ts)
// ---------------------------------------------------------------------------

/** Certyfikat samopodpisany (X.509 v3 bez rozszerzeń) na podany klucz — „wydany” przez atrapę wystawcy. */
function certyfikatDla(privateKeyPem: string): string {
  const d = (tag: number, body: Buffer) => {
    const n = body.length;
    return Buffer.concat([Buffer.from([tag, ...(n < 0x80 ? [n] : n < 0x100 ? [0x81, n] : [0x82, n >> 8, n & 0xff])]), body]);
  };
  const klucz = createPrivateKey(privateKeyPem);
  const alg = Buffer.from('300d06092a864886f70d01010b0500', 'hex');
  const nazwa = d(0x30, d(0x31, d(0x30, Buffer.concat([Buffer.from('0603550403', 'hex'), d(0x0c, Buffer.from('firma.pl'))]))));
  const czas = (t: Date) => d(0x17, Buffer.from(t.toISOString().replace(/[-:T]/g, '').slice(2, 14) + 'Z'));
  const tbs = d(0x30, Buffer.concat([
    d(0xa0, Buffer.from([0x02, 0x01, 0x02])), Buffer.from([0x02, 0x01, 0x01]), alg, nazwa,
    d(0x30, Buffer.concat([czas(new Date(Date.now() - 3600_000)), czas(new Date(Date.now() + 365 * 24 * 3600_000))])),
    nazwa, createPublicKey(klucz).export({ type: 'spki', format: 'der' }),
  ]));
  const cert = d(0x30, Buffer.concat([tbs, alg, d(0x03, Buffer.concat([Buffer.from([0]), sign('sha256', tbs, klucz)]))]));
  return `-----BEGIN CERTIFICATE-----\n${cert.toString('base64').match(/.{1,64}/g)!.join('\n')}\n-----END CERTIFICATE-----\n`;
}

function stanowisko(o: { createPada?: unknown; debitPada?: unknown; wystawcaPada?: boolean } = {}) {
  const rows: Record<string, Record<string, unknown>> = {};
  let n = 0;
  const merge = (id: string, data: Record<string, unknown>) => Object.assign(rows[id], data, { updatedAt: new Date() });
  const prisma = {
    subscription: { findFirst: vi.fn(async () => ({ id: 's1' })) },
    user: { findUnique: vi.fn(async () => ({ email: 'k@firma.pl', firstName: 'Ala', anonymizedAt: null })) },
    sslOrder: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        if (o.createPada) throw o.createPada;
        const id = `o${++n}`;
        rows[id] = { id, status: 'PENDING', dnsRecord: null, dnsRecordAddedAt: null, certificate: null, caBundle: null, expiresAt: null, walletTxId: null, lastError: null, providerOrderId: null, createdAt: new Date(), ...data };
        return rows[id];
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => merge(where.id, data)),
      updateMany: vi.fn(async ({ where, data }: { where: { id: string; status: string }; data: Record<string, unknown> }) => {
        if (rows[where.id]?.status !== where.status) return { count: 0 };
        merge(where.id, data);
        return { count: 1 };
      }),
      findUniqueOrThrow: vi.fn(async ({ where }: { where: { id: string } }) => rows[where.id]),
      findFirst: vi.fn(async ({ where }: { where: { id: string } }) => rows[where.id] ?? null),
      findMany: vi.fn(async () => Object.values(rows).filter((r) => r.status === 'VALIDATING' || r.status === 'ISSUED')),
    },
  };
  const audit = { record: vi.fn(async () => undefined) };
  const crypto = { encrypt: vi.fn((v: string) => `enc(${Buffer.from(v).toString('base64')})`), decrypt: vi.fn((v: string) => Buffer.from(v.slice(4, -1), 'base64').toString()) };
  const oplaty = new Map<string, { id: string }>();
  const wallet = {
    debit: vi.fn(async (i: { idempotencyKey: string }) => {
      if (o.debitPada) throw o.debitPada;
      const tx = oplaty.get(i.idempotencyKey) ?? { id: `tx-${oplaty.size + 1}` };
      oplaty.set(i.idempotencyKey, tx);
      return tx;
    }),
    credit: vi.fn(async () => ({ id: 'refund' })),
    findByIdempotencyKey: vi.fn(async (k: string) => oplaty.get(k) ?? null),
  };
  const settings = { getSslPrices: vi.fn(async () => ({ '5': { price: '99.99', name: 'PositiveSSL', wildcard: false } })) };
  const directAdmin = {
    listHostingDomainsForSubscription: vi.fn(async () => ({ domains: [{ name: 'firma.pl' }], fetchError: null })),
    createHostingDnsRecord: vi.fn(async () => ({ ok: true })),
    pasteCustomSslCertificate: vi.fn(async () => ({ ok: true })),
  };
  const wystawca = {
    sslCreateOrder: vi.fn(async () => {
      if (o.wystawcaPada) throw new Error('OpenProvider: Invalid CSR');
      return '77';
    }),
    sslOrder: vi.fn(async (): Promise<SslOrderInfo> => ({ state: 'pending', certificate: null, caBundle: null, dns: { record: 'firma.pl', value: 'abc123' } })),
    sslProducts: vi.fn(),
  };
  const notifications = { create: vi.fn(async () => undefined) };
  const mailer = { send: vi.fn(async () => undefined) };
  const svc = new SslService(
    prisma as never, audit as never, crypto as never, { getSsl: () => wystawca } as never, wallet as never, settings as never,
    directAdmin as never, notifications as never, mailer as never, { get: () => undefined } as never, {} as never,
  );
  return { svc, rows, prisma, audit, crypto, wallet, directAdmin, wystawca, notifications, mailer };
}
const zamowienie = { domain: 'Firma.pl', productId: 5, validation: 'DNS' as const };

describe('G-08 cykl zamówienia certyfikatu', () => {
  it('jedno obciążenie z kluczem zamówienia, wysłanie do wystawcy, rekord DNS dodany do strefy', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    expect(s.wallet.debit).toHaveBeenCalledTimes(1);
    expect(s.wallet.debit).toHaveBeenCalledWith(expect.objectContaining({ amount: '99.99', idempotencyKey: `ssl-order:${dto.id}`, type: 'CHARGE_USAGE' }));
    expect(s.wystawca.sslCreateOrder).toHaveBeenCalledWith(expect.objectContaining({ productId: 5, hostName: 'firma.pl', validation: 'dns' }));
    expect(s.directAdmin.createHostingDnsRecord).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', name: '@', type: 'TXT', value: 'abc123', ttl: 300 });
    expect(dto).toMatchObject({ status: 'VALIDATING', dnsRecord: { name: '@', type: 'TXT', value: 'abc123' }, dnsRecordAdded: true, problem: null });
  });

  it('klucz prywatny nie wychodzi niezaszyfrowany: w bazie tylko szyfrogram, nie w audycie, nie u wystawcy, nie w odpowiedzi', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    const row = s.rows[dto.id];
    const jawny = s.crypto.encrypt.mock.calls[0][0];
    expect(jawny).toContain('PRIVATE KEY');
    expect(row.privateKeyEnc).toBe(s.crypto.encrypt.mock.results[0].value);
    const wszystko = JSON.stringify([s.audit.record.mock.calls, s.wystawca.sslCreateOrder.mock.calls, s.wallet.debit.mock.calls, dto]);
    expect(wszystko).not.toContain('PRIVATE KEY');
    expect(wszystko).not.toContain(String(row.privateKeyEnc));
  });

  it('błąd wystawcy: zwrot z kluczem zwrotu, zamówienie FAILED, klient bez nazwy dostawcy', async () => {
    const s = stanowisko({ wystawcaPada: true });
    const err = (await s.svc.zamow('u1', 'u1', 's1', zamowienie).catch((e: unknown) => e)) as Error;
    expect(err.message).toBe('Nie udało się zamówić certyfikatu — opłata wróciła do portfela. Spróbuj ponownie później.');
    expect(err.message).not.toMatch(/openprovider/i);
    const [id] = Object.keys(s.rows);
    expect(s.wallet.credit).toHaveBeenCalledWith(expect.objectContaining({ amount: '99.99', type: 'REFUND', idempotencyKey: `ssl-order-refund:${id}` }));
    expect(s.rows[id].status).toBe('FAILED');
    expect(naDto(s.rows[id] as never).problem).toBe('Zamówienie nie powiodło się — opłata wróciła do portfela.');
  });

  it('brak środków: bez wystawcy, komunikat o doładowaniu', async () => {
    const s = stanowisko({ debitPada: new ConflictException('Insufficient wallet balance') });
    await expect(s.svc.zamow('u1', 'u1', 's1', zamowienie)).rejects.toThrow('Brak wystarczających środków w portfelu');
    expect(s.wystawca.sslCreateOrder).not.toHaveBeenCalled();
    expect(s.wallet.credit).not.toHaveBeenCalled();
  });

  it('drugie zamówienie w toku na tę samą domenę (indeks częściowy) → konflikt, bez obciążenia', async () => {
    const s = stanowisko({ createPada: new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'x' }) });
    await expect(s.svc.zamow('u1', 'u1', 's1', zamowienie)).rejects.toThrow('już w toku');
    expect(s.wallet.debit).not.toHaveBeenCalled();
  });

  it('domena spoza konta i adres weryfikacji spoza listy → odmowa przed obciążeniem', async () => {
    const s = stanowisko();
    await expect(s.svc.zamow('u1', 'u1', 's1', { ...zamowienie, domain: 'cudza.pl' })).rejects.toThrow('nie jest przypisana');
    await expect(s.svc.zamow('u1', 'u1', 's1', { ...zamowienie, validation: 'EMAIL', approverEmail: 'jan@firma.pl' })).rejects.toThrow('Wybierz adres');
    expect(s.wallet.debit).not.toHaveBeenCalled();
  });

  it('wydany → instalacja na koncie tym samym kluczem, status INSTALLED, data ważności z certyfikatu, powiadomienie', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    const klucz = s.crypto.decrypt(String(s.rows[dto.id].privateKeyEnc));
    const cert = certyfikatDla(klucz);
    s.wystawca.sslOrder.mockResolvedValue({ state: 'issued', certificate: cert, caBundle: 'CA', dns: null });
    const po = await s.svc.sprawdzTeraz('u1', 's1', dto.id);
    expect(s.directAdmin.pasteCustomSslCertificate).toHaveBeenCalledWith('s1', 'u1', { domain: 'firma.pl', certificate: cert, privateKey: klucz, caBundle: 'CA' });
    expect(po.status).toBe('INSTALLED');
    expect(po.expiresAt).toBe(new Date(new X509Certificate(cert).validTo).toISOString());
    expect(s.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ category: 'SSL', title: 'Certyfikat SSL dla firma.pl jest zainstalowany' }));
  });

  it('certyfikat na obcy klucz nie jest instalowany', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    const obcy = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' }) as string;
    s.wystawca.sslOrder.mockResolvedValue({ state: 'issued', certificate: certyfikatDla(obcy), caBundle: null, dns: null });
    const po = await s.svc.sprawdzTeraz('u1', 's1', dto.id);
    expect(po.status).toBe('VALIDATING');
    expect(s.directAdmin.pasteCustomSslCertificate).not.toHaveBeenCalled();
  });

  it('błąd instalacji: status ISSUED z neutralnym opisem, ponowienie przy kolejnym sprawdzeniu', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    const cert = certyfikatDla(s.crypto.decrypt(String(s.rows[dto.id].privateKeyEnc)));
    s.wystawca.sslOrder.mockResolvedValue({ state: 'issued', certificate: cert, caBundle: null, dns: null });
    s.directAdmin.pasteCustomSslCertificate.mockRejectedValueOnce(new Error('DirectAdmin: Unable to save certificate'));
    const po = await s.svc.sprawdzTeraz('u1', 's1', dto.id);
    expect(po.status).toBe('ISSUED');
    expect(po.problem).toContain('instalacja na koncie się nie udała');
    expect(JSON.stringify(po)).not.toMatch(/directadmin/i);
    await expect(s.svc.sprawdzTeraz('u1', 's1', dto.id)).resolves.toMatchObject({ status: 'INSTALLED' });
  });

  it('odrzucenie przez wystawcę po weryfikacji → zwrot i powiadomienie', async () => {
    const s = stanowisko();
    const dto = await s.svc.zamow('u1', 'u1', 's1', zamowienie);
    s.wystawca.sslOrder.mockResolvedValue({ state: 'failed', certificate: null, caBundle: null, dns: null });
    await s.svc.synchronizuj();
    expect(s.rows[dto.id].status).toBe('FAILED');
    expect(s.wallet.credit).toHaveBeenCalledWith(expect.objectContaining({ idempotencyKey: `ssl-order-refund:${dto.id}` }));
    expect(s.notifications.create).toHaveBeenCalledWith(expect.objectContaining({ title: 'Nie udało się wystawić certyfikatu SSL dla firma.pl' }));
  });
});

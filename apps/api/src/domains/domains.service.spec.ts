import type { Mock } from 'vitest';
import { EventEmitter } from 'node:events';
import * as dns from 'dns';
import * as tls from 'tls';
import { DomainChecklistStatus, DomainStatus } from '@verris/database';
import { DomainsService } from './domains.service.js';

vi.mock('tls', () => ({
  connect: vi.fn(),
}));

describe('DomainsService', () => {
  const prisma = {
    domain: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    domainChecklist: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  };
  const config = { get: () => 'test-secret' };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function service() {
    return new DomainsService(prisma as never, config as never);
  }

  it('stores an OK checklist when DNS and TLS are valid', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'example.test' });
    prisma.domainChecklist.create.mockImplementation(async (args) => ({ id: 'chk_1', ...args.data }));
    vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.10']);
    vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns.promises, 'resolveNs').mockResolvedValue(['ns1.example.test']);
    vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mx.example.test' }]);
    mockTls({ authorized: true, authorizationError: null, validTo: 'May 18 12:00:00 2027 GMT' });

    const result = await service().runChecklist('dom_1', 'user_1');

    expect(result.status).toBe(DomainChecklistStatus.OK);
    expect(prisma.domainChecklist.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        domainId: 'dom_1',
        hostname: 'example.test',
        status: DomainChecklistStatus.OK,
        issues: [],
      }),
    });
  });

  it('A-16: poprawny A/TLS nie wystarcza — bez rekordu TXT domena zostaje PENDING', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'example.test', status: DomainStatus.PENDING });
    vi.spyOn(dns.promises, 'resolveTxt').mockResolvedValue([['cos-innego']]);
    await expect(service().verifyDomain('dom_1', 'user_1')).rejects.toThrow('_verris-challenge.example.test');
    expect(prisma.domain.update).not.toHaveBeenCalled();
  });

  it('marks checklist FAILED when DNS and TLS are both missing', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'broken.test' });
    prisma.domainChecklist.create.mockImplementation(async (args) => ({ id: 'chk_fail', ...args.data }));
    vi.spyOn(dns.promises, 'resolve4').mockRejectedValue(new Error('ENOTFOUND'));
    vi.spyOn(dns.promises, 'resolve6').mockRejectedValue(new Error('ENOTFOUND'));
    vi.spyOn(dns.promises, 'resolveNs').mockResolvedValue([]);
    vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([]);
    mockTls({ authorized: false, authorizationError: 'self signed', validTo: 'May 18 12:00:00 2026 GMT' });

    const result = await service().runChecklist('dom_1', 'user_1');

    expect(result.status).toBe(DomainChecklistStatus.FAILED);
    expect(result.issues).toEqual(
      expect.arrayContaining([
        'Brak rekordu A/AAAA dla domeny głównej.',
        'self signed',
      ]),
    );
  });

  it('marks checklist WARNING when DNS resolves but TLS is not ready', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'partial.test' });
    prisma.domainChecklist.create.mockImplementation(async (args) => ({ id: 'chk_warn', ...args.data }));
    vi.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.55']);
    vi.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);
    vi.spyOn(dns.promises, 'resolveNs').mockResolvedValue(['ns1.partial.test']);
    vi.spyOn(dns.promises, 'resolveMx').mockResolvedValue([]);
    mockTls({ authorized: false, authorizationError: 'certificate has expired', validTo: 'May 18 12:00:00 2024 GMT' });

    const result = await service().runChecklist('dom_1', 'user_1');

    expect(result.status).toBe(DomainChecklistStatus.WARNING);
    expect(result.issues).toContain('certificate has expired');
  });

  it('A-16: aktywuje domenę po znalezieniu naszego rekordu TXT (także dzielonego na kawałki)', async () => {
    const dom = { id: 'dom_1', userId: 'user_1', name: 'example.test', status: DomainStatus.PENDING };
    prisma.domain.findFirst.mockResolvedValue(dom);
    prisma.domain.update.mockResolvedValue({ id: 'dom_1', status: DomainStatus.ACTIVE });
    const instance = service();
    const { recordName, recordValue } = instance.verificationRecord(dom);
    expect(recordName).toBe('_verris-challenge.example.test');
    const spy = vi.spyOn(dns.promises, 'resolveTxt').mockResolvedValue([[recordValue.slice(0, 10), recordValue.slice(10)]]);
    await expect(instance.verifyDomain('dom_1', 'user_1')).resolves.toEqual({ id: 'dom_1', status: DomainStatus.ACTIVE });
    expect(spy).toHaveBeenCalledWith('_verris-challenge.example.test');
    expect(prisma.domain.update).toHaveBeenCalledWith({ where: { id: 'dom_1' }, data: { status: DomainStatus.ACTIVE } });
  });

  it('A-16: wartość TXT jest inna dla innego właściciela tej samej nazwy', () => {
    const i = service();
    expect(i.verificationRecord({ id: 'd', name: 'x.pl', userId: 'u1' }).recordValue).not.toBe(
      i.verificationRecord({ id: 'd', name: 'x.pl', userId: 'u2' }).recordValue,
    );
  });

  it('A-16: cudza niezweryfikowana rezerwacja starsza niż 7 dni nie blokuje nazwy', async () => {
    prisma.domain.findUnique.mockResolvedValue({
      id: 'old', userId: 'squatter', name: 'x.pl', status: DomainStatus.PENDING, registrarProvider: null,
      createdAt: new Date(Date.now() - 8 * 86400000),
    });
    prisma.domain.create.mockResolvedValue({ id: 'new' });
    await expect(service().create('owner', { name: 'x.pl' } as never)).resolves.toEqual({ id: 'new' });
    expect(prisma.domain.delete).toHaveBeenCalledWith({ where: { id: 'old' } });
  });

  it('A-16: świeża albo zweryfikowana cudza domena nadal daje konflikt', async () => {
    prisma.domain.findUnique.mockResolvedValue({
      id: 'old', userId: 'other', name: 'x.pl', status: DomainStatus.ACTIVE, registrarProvider: null,
      createdAt: new Date(Date.now() - 30 * 86400000),
    });
    await expect(service().create('owner', { name: 'x.pl' } as never)).rejects.toThrow('już zarejestrowana');
    expect(prisma.domain.delete).not.toHaveBeenCalled();
  });
});

function mockTls(opts: {
  authorized: boolean;
  authorizationError: Error | string | null;
  validTo: string;
}) {
  (tls.connect as unknown as Mock).mockImplementation((options: unknown, cb?: () => void) => {
    const socket = new EventEmitter() as EventEmitter & {
      authorized: boolean;
      authorizationError: Error | string | null;
      getPeerCertificate: () => { valid_to: string };
      end: () => void;
      destroy: () => void;
    };
    socket.authorized = opts.authorized;
    socket.authorizationError = opts.authorizationError;
    socket.getPeerCertificate = () => ({ valid_to: opts.validTo });
    socket.end = vi.fn();
    socket.destroy = vi.fn();
    queueMicrotask(() => cb?.());
    return socket as unknown as tls.TLSSocket;
  });
}

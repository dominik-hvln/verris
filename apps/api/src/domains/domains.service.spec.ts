import { EventEmitter } from 'node:events';
import * as dns from 'dns';
import * as tls from 'tls';
import { DomainChecklistStatus, DomainStatus } from '@verris/database';
import { DomainsService } from './domains.service';

jest.mock('tls', () => ({
  connect: jest.fn(),
}));

describe('DomainsService', () => {
  const prisma = {
    domain: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    domainChecklist: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
  };
  const config = {};

  beforeEach(() => {
    jest.clearAllMocks();
  });

  function service() {
    return new DomainsService(prisma as never, config as never);
  }

  it('stores an OK checklist when DNS and TLS are valid', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'example.test' });
    prisma.domainChecklist.create.mockImplementation(async (args) => ({ id: 'chk_1', ...args.data }));
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.10']);
    jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);
    jest.spyOn(dns.promises, 'resolveNs').mockResolvedValue(['ns1.example.test']);
    jest.spyOn(dns.promises, 'resolveMx').mockResolvedValue([{ priority: 10, exchange: 'mx.example.test' }]);
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

  it('keeps the domain pending when checklist returns warning', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'example.test' });
    const instance = service();
    jest.spyOn(instance, 'runChecklist').mockResolvedValue({
      id: 'chk_1',
      domainId: 'dom_1',
      subscriptionId: null,
      hostname: 'example.test',
      status: DomainChecklistStatus.WARNING,
      requiredRecords: {},
      observedRecords: {},
      issues: ['TLS not ready'],
      checkedAt: new Date(),
      createdAt: new Date(),
    } as never);

    const domain = await instance.verifyDomain('dom_1', 'user_1');

    expect(domain).toEqual({ id: 'dom_1', userId: 'user_1', name: 'example.test' });
    expect(prisma.domain.update).not.toHaveBeenCalled();
  });

  it('marks checklist FAILED when DNS and TLS are both missing', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'broken.test' });
    prisma.domainChecklist.create.mockImplementation(async (args) => ({ id: 'chk_fail', ...args.data }));
    jest.spyOn(dns.promises, 'resolve4').mockRejectedValue(new Error('ENOTFOUND'));
    jest.spyOn(dns.promises, 'resolve6').mockRejectedValue(new Error('ENOTFOUND'));
    jest.spyOn(dns.promises, 'resolveNs').mockResolvedValue([]);
    jest.spyOn(dns.promises, 'resolveMx').mockResolvedValue([]);
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
    jest.spyOn(dns.promises, 'resolve4').mockResolvedValue(['203.0.113.55']);
    jest.spyOn(dns.promises, 'resolve6').mockResolvedValue([]);
    jest.spyOn(dns.promises, 'resolveNs').mockResolvedValue(['ns1.partial.test']);
    jest.spyOn(dns.promises, 'resolveMx').mockResolvedValue([]);
    mockTls({ authorized: false, authorizationError: 'certificate has expired', validTo: 'May 18 12:00:00 2024 GMT' });

    const result = await service().runChecklist('dom_1', 'user_1');

    expect(result.status).toBe(DomainChecklistStatus.WARNING);
    expect(result.issues).toContain('certificate has expired');
  });

  it('activates the domain only when checklist is OK', async () => {
    prisma.domain.findFirst.mockResolvedValue({ id: 'dom_1', userId: 'user_1', name: 'example.test' });
    prisma.domain.update.mockResolvedValue({ id: 'dom_1', status: DomainStatus.ACTIVE });
    const instance = service();
    jest.spyOn(instance, 'runChecklist').mockResolvedValue({
      id: 'chk_1',
      domainId: 'dom_1',
      subscriptionId: null,
      hostname: 'example.test',
      status: DomainChecklistStatus.OK,
      requiredRecords: {},
      observedRecords: {},
      issues: [],
      checkedAt: new Date(),
      createdAt: new Date(),
    } as never);

    await expect(instance.verifyDomain('dom_1', 'user_1')).resolves.toEqual({
      id: 'dom_1',
      status: DomainStatus.ACTIVE,
    });
    expect(prisma.domain.update).toHaveBeenCalledWith({
      where: { id: 'dom_1' },
      data: { status: DomainStatus.ACTIVE },
    });
  });
});

function mockTls(opts: {
  authorized: boolean;
  authorizationError: Error | string | null;
  validTo: string;
}) {
  (tls.connect as unknown as jest.Mock).mockImplementation((options: unknown, cb?: () => void) => {
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
    socket.end = jest.fn();
    socket.destroy = jest.fn();
    queueMicrotask(() => cb?.());
    return socket as unknown as tls.TLSSocket;
  });
}

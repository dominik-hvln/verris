import { ServiceUnavailableException } from '@nestjs/common';
import { UnrecoverableError } from 'bullmq';
import { ProvisioningQueueService, categorizeProvisioningError, kategoriaBledu } from './provisioning-queue.service';
import { BladEtapuProvisioningu } from './provisioning-error';

describe('categorizeProvisioningError', () => {
  it.each([
    'DirectAdmin timeout after 30000ms',
    'ECONNRESET while calling DA',
    '502 Bad Gateway from node',
    'All compute nodes are at capacity',
  ])('marks retry-safe infrastructure failures as transient: %s', (message) => {
    expect(categorizeProvisioningError(message)).toBe('transient');
  });

  it.each([
    'DirectAdmin credentials rejected',
    'domain already exists',
    'validation failed: invalid domain',
  ])('marks operator/data errors as permanent: %s', (message) => {
    expect(categorizeProvisioningError(message)).toBe('permanent');
  });
});


describe('kategoriaBledu — status HTTP przed prozą', () => {
  it.each([
    'Brak węzłów hostingowych odpowiadających na sygnał życia. Skontaktuj się z BOK.',
    'Sprzedaż wstrzymana: trwa serwis infrastruktury. Spróbuj ponownie za chwilę.',
  ])('503 z wyboru węzła jest przejściowy: %s', (m) => {
    expect(kategoriaBledu(new ServiceUnavailableException(m))).toBe('transient');
  });

  it('przyczyna w błędzie etapu nadal decyduje (błąd etapu to też 503)', () => {
    expect(kategoriaBledu(new BladEtapuProvisioningu('createAccount', 'Unable to Create User', 'x'))).toBe('permanent');
  });
});

describe('ProvisioningQueueService — twarda porażka kończy job', () => {
  function stanowisko(blad: Error) {
    const prisma = {
      account: { findUnique: jest.fn(async () => null) },
      subscription: { update: jest.fn(async () => ({})) },
      subscriptionEvent: { create: jest.fn(async () => ({})) },
    };
    const walletLedger = { credit: jest.fn(async () => ({})) };
    const audit = { record: jest.fn(async () => undefined) };
    const provisioning = { provisionForSubscription: jest.fn(async () => Promise.reject(blad)) };
    const svc = new ProvisioningQueueService(prisma as never, provisioning as never, walletLedger as never, audit as never, {} as never);
    const job = (attemptsMade: number) => ({
      id: 'j1', attemptsMade,
      data: { type: 'wallet', subscriptionId: 's1', userId: 'u1', domain: 'firma.pl', refundAmount: '45' },
    });
    const uruchom = (attemptsMade: number) => (svc as unknown as { runJob: (j: unknown) => Promise<void> }).runJob(job(attemptsMade));
    return { uruchom, walletLedger, prisma };
  }

  it('błąd trwały przy 1. próbie: zwrot + UnrecoverableError (BullMQ nie ponawia i nie założy konta po zwrocie)', async () => {
    const s = stanowisko(new BladEtapuProvisioningu('createAccount', 'Unable to Create User — A valid IP was not provided', 'Failed'));
    await expect(s.uruchom(0)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(s.walletLedger.credit).toHaveBeenCalledTimes(1);
  });

  it('błąd przejściowy przy 1. próbie: bez zwrotu, zwykły błąd (BullMQ ponowi)', async () => {
    const blad = new ServiceUnavailableException('Sprzedaż wstrzymana: trwa serwis infrastruktury.');
    const s = stanowisko(blad);
    await expect(s.uruchom(0)).rejects.toBe(blad);
    expect(s.walletLedger.credit).not.toHaveBeenCalled();
  });

  it('błąd przejściowy przy ostatniej próbie: zwrot + koniec', async () => {
    const s = stanowisko(new ServiceUnavailableException('trwa serwis'));
    await expect(s.uruchom(2)).rejects.toBeInstanceOf(UnrecoverableError);
    expect(s.walletLedger.credit).toHaveBeenCalledTimes(1);
  });
});

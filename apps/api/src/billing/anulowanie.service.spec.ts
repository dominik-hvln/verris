import { AnulowanieService } from './anulowanie.service.js';

function setup(inv: Record<string, unknown> | null, opts: { stripeFails?: boolean; raced?: boolean } = {}) {
  const calls: string[] = [];
  const prisma = {
    invoice: {
      findUnique: vi.fn().mockResolvedValue(inv),
      updateMany: vi.fn().mockImplementation(async () => {
        calls.push('local');
        return { count: opts.raced ? 0 : 1 };
      }),
    },
  };
  const audit = { record: vi.fn() };
  const stripe = {
    voidInvoice: vi.fn().mockImplementation(async () => {
      calls.push('stripe');
      if (opts.stripeFails) throw new Error('stripe down');
      return { id: 'in_1', status: 'void' };
    }),
  };
  const svc = new AnulowanieService(prisma as never, audit as never, stripe as never);
  return { svc, prisma, audit, stripe, calls };
}

const base = { id: 'f1', number: 'VDR/2026/09/0003', userId: 'u1', provider: null, providerRef: null };
const run = (s: AnulowanieService) => s.anuluj({ invoiceId: 'f1', powod: 'błędnie wystawiony', aktorUserId: 'a1' });

describe('M-08 — anulowanie dokumentu', () => {
  it('nieopłacony dokument panelu: VOID + audyt z powodem, bez Stripe', async () => {
    const t = setup({ ...base, status: 'OPEN' });
    await expect(run(t.svc)).resolves.toMatchObject({ status: 'VOID' });
    expect(t.stripe.voidInvoice).not.toHaveBeenCalled();
    expect(t.audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'INVOICE_VOIDED', details: expect.objectContaining({ powod: 'błędnie wystawiony' }) }));
  });

  it.each(['PAID', 'UNCOLLECTIBLE', 'VOID'])('%s: odmowa, nic się nie zmienia', async (status) => {
    const t = setup({ ...base, status });
    await expect(run(t.svc)).rejects.toThrow();
    expect(t.prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('faktura Stripe: najpierw unieważnienie w Stripe, potem lokalnie', async () => {
    const t = setup({ ...base, status: 'OPEN', provider: 'STRIPE', providerRef: 'in_1' });
    await run(t.svc);
    expect(t.calls).toEqual(['stripe', 'local']);
  });

  it('błąd Stripe: lokalny status bez zmian', async () => {
    const t = setup({ ...base, status: 'OPEN', provider: 'STRIPE', providerRef: 'in_1' }, { stripeFails: true });
    await expect(run(t.svc)).rejects.toThrow('stripe down');
    expect(t.prisma.invoice.updateMany).not.toHaveBeenCalled();
  });

  it('wyścig (ktoś opłacił w międzyczasie): odmowa i brak audytu', async () => {
    const t = setup({ ...base, status: 'OPEN' }, { raced: true });
    await expect(run(t.svc)).rejects.toThrow();
    expect(t.audit.record).not.toHaveBeenCalled();
  });
});

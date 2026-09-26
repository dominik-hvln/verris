import type { Mock } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { ClientWebhooksService } from './client-webhooks.service.js';
import { postWebhookBezpiecznie } from '../common/net/webhook-post.js';

vi.mock('../common/net/webhook-post.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  postWebhookBezpiecznie: vi.fn(),
}));

vi.mock('../status/status-webhook.service.js', () => ({
  assertPublicWebhookUrl: vi.fn(async (u: string) => {
    if (!u.startsWith('https://') || u.includes('127.0.0.1')) throw new Error('Webhook URL must use HTTPS.');
  }),
}));

/** L-10 — webhooki klienta: zapis z sekretem, zdarzenia po zadaniu, dostawa z podpisem i ponowieniem. */
function stanowisko() {
  const endpoints: Record<string, unknown>[] = [];
  const deliveries: Record<string, unknown>[] = [];
  const prisma = {
    clientWebhookEndpoint: {
      count: vi.fn(async () => endpoints.length),
      create: vi.fn(async (a: { data: Record<string, unknown> }) => { const e = { id: `e${endpoints.length + 1}`, createdAt: new Date(), isActive: true, ...a.data }; endpoints.push(e); return e; }),
      findMany: vi.fn(async () => endpoints.map((e) => ({ id: e.id }))),
      findFirst: vi.fn(async () => endpoints[0] ?? null),
      deleteMany: vi.fn(async () => ({ count: 1 })),
    },
    clientWebhookDelivery: {
      createMany: vi.fn(async (a: { data: Record<string, unknown>[] }) => { deliveries.push(...a.data); return { count: a.data.length }; }),
      create: vi.fn(async () => ({})),
      findMany: vi.fn(async () => [{ id: 'd1' }]),
      updateMany: vi.fn(async () => ({ count: 1 })),
      findUnique: vi.fn(async () => ({ id: 'd1', event: 'task.completed', createdAt: new Date(0), payload: { a: 1 }, attempts: 1, endpoint: { url: 'https://hook.example.com/x', secretEnc: 'enc:whsec_test' } })),
      update: vi.fn(async () => ({})),
    },
    subscription: { findFirst: vi.fn(async () => ({ id: 's1', userId: 'u1' })) },
  };
  const crypto = { encrypt: (v: string) => `enc:${v}`, decrypt: (v: string) => v.replace(/^enc:/, '') };
  const svc = new ClientWebhooksService(prisma as never, crypto as never, { record: vi.fn(async () => undefined) } as never);
  return { svc, prisma, deliveries };
}

describe('ClientWebhooksService', () => {
  afterEach(() => vi.restoreAllMocks());

  it('dodaje adres z zaszyfrowanym sekretem pokazanym raz; zły adres i zdarzenie → 400', async () => {
    const s = stanowisko();
    const r = await s.svc.dodaj('u1', { url: 'https://hook.example.com/x', events: ['task.completed'] });
    expect(r.sekret).toMatch(/^whsec_/);
    expect(s.prisma.clientWebhookEndpoint.create).toHaveBeenCalledWith({ data: expect.objectContaining({ secretEnc: `enc:${r.sekret}` }) });
    await expect(s.svc.dodaj('u1', { url: 'http://127.0.0.1/x', events: ['task.completed'] })).rejects.toThrow(BadRequestException);
    await expect(s.svc.dodaj('u1', { url: 'https://hook.example.com/x', events: ['user.deleted'] })).rejects.toThrow(BadRequestException);
  });

  it('zadanie klienta po zakończeniu → zdarzenie dla właściciela; zadanie operatorskie → nic', async () => {
    const s = stanowisko();
    await s.svc.dodaj('u1', { url: 'https://hook.example.com/x', events: ['task.completed'] });
    await s.svc.poZadaniu({ id: 't1', kind: 'WP_UPDATE', accountId: 'a1', payload: { domain: 'a.pl', mode: 'update' } }, true);
    expect(s.deliveries).toEqual([expect.objectContaining({ event: 'task.completed', payload: expect.objectContaining({ zadanie: 't1', domena: 'a.pl', usluga: 's1' }) })]);
    await s.svc.poZadaniu({ id: 't2', kind: 'HOSTING_PROFILE', accountId: 'a1', payload: {} }, true);
    expect(s.deliveries).toHaveLength(1);
  });

  it('dostawa z podpisem HMAC; błąd HTTP → ponowienie z opóźnieniem', async () => {
    const s = stanowisko();
    const wyslij = (postWebhookBezpiecznie as Mock).mockResolvedValueOnce(200).mockResolvedValueOnce(500);
    await s.svc.dostarczaj();
    const [, naglowki, body] = wyslij.mock.calls[0] as [string, Record<string, string>, string];
    expect(naglowki['x-verris-signature']).toBe(createHmac('sha256', 'whsec_test').update(body).digest('hex'));
    expect(s.prisma.clientWebhookDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'SENT' }) }));
    await s.svc.dostarczaj();
    expect(s.prisma.clientWebhookDelivery.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING', lastError: 'HTTP 500' }) }));
  });
});

describe('ClientWebhooksService — zdarzenia rozliczeń (L-10)', () => {
  it('invoice.issued / subscription.* są na liście zdarzeń do wyboru', async () => {
    const s = stanowisko();
    const r = await s.svc.dodaj('u1', { url: 'https://hook.example.com/x', events: ['invoice.issued', 'subscription.renewed', 'subscription.past_due'] });
    expect(r.sekret).toMatch(/^whsec_/);
    await s.svc.emit('u1', 'invoice.issued', { numer: 'VFV/1' });
    expect(s.deliveries).toEqual([expect.objectContaining({ event: 'invoice.issued' })]);
  });
});

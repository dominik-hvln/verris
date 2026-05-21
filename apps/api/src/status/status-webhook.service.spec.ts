import {
  StatusWebhookDeliveryStatus,
  StatusWebhookEvent,
} from '@verris/database';
import { createHmac } from 'node:crypto';
import { assertPublicWebhookUrl, StatusWebhookService } from './status-webhook.service';

describe('StatusWebhookService', () => {
  const prisma = {
    statusWebhookEndpoint: {
      findMany: jest.fn(),
    },
    statusWebhookDelivery: {
      createMany: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
    },
  };
  const crypto = {
    decrypt: jest.fn((value: string) => value.replace('enc:', '')),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  it('returns zero when no endpoints subscribe to the event', async () => {
    prisma.statusWebhookEndpoint.findMany.mockResolvedValue([]);
    const service = new StatusWebhookService(prisma as never, crypto as never);
    await expect(service.enqueue(StatusWebhookEvent.INCIDENT_CREATED, {})).resolves.toBe(0);
    expect(prisma.statusWebhookDelivery.createMany).not.toHaveBeenCalled();
  });

  it('enqueues deliveries only for active endpoints subscribed to the event', async () => {
    prisma.statusWebhookEndpoint.findMany.mockResolvedValue([{ id: 'hook_1' }, { id: 'hook_2' }]);
    prisma.statusWebhookDelivery.createMany.mockResolvedValue({ count: 2 });

    const service = new StatusWebhookService(prisma as never, crypto as never);
    await expect(
      service.enqueue(StatusWebhookEvent.INCIDENT_CREATED, { incidentId: 'inc_1' }),
    ).resolves.toBe(2);

    expect(prisma.statusWebhookEndpoint.findMany).toHaveBeenCalledWith({
      where: { isActive: true, events: { has: StatusWebhookEvent.INCIDENT_CREATED } },
      select: { id: true },
    });
    expect(prisma.statusWebhookDelivery.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          endpointId: 'hook_1',
          event: StatusWebhookEvent.INCIDENT_CREATED,
          status: StatusWebhookDeliveryStatus.PENDING,
        }),
        expect.objectContaining({
          endpointId: 'hook_2',
          event: StatusWebhookEvent.INCIDENT_CREATED,
          status: StatusWebhookDeliveryStatus.PENDING,
        }),
      ],
    });
  });

  it('signs delivery payloads with HMAC and marks successful deliveries as sent', async () => {
    const delivery = {
      id: 'del_1',
      endpointId: 'hook_1',
      event: StatusWebhookEvent.INCIDENT_CREATED,
      payload: { incidentId: 'inc_1' },
      attempts: 0,
      createdAt: new Date('2026-05-18T09:00:00.000Z'),
      endpoint: {
        id: 'hook_1',
        url: 'https://8.8.8.8/webhook',
        secretEnc: 'enc:super-secret',
      },
    };
    prisma.statusWebhookDelivery.findMany.mockResolvedValue([{ id: delivery.id }]);
    prisma.statusWebhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.statusWebhookDelivery.findUnique.mockResolvedValue({ ...delivery, attempts: 1 });
    prisma.statusWebhookDelivery.update.mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 204 });

    const service = new StatusWebhookService(prisma as never, crypto as never);
    await service.deliverPending();

    const body = JSON.stringify({
      id: delivery.id,
      event: delivery.event,
      createdAt: delivery.createdAt.toISOString(),
      payload: delivery.payload,
    });
    expect(global.fetch).toHaveBeenCalledWith(
      delivery.endpoint.url,
      expect.objectContaining({
        method: 'POST',
        body,
        redirect: 'manual',
        headers: expect.objectContaining({
          'x-verris-signature': createHmac('sha256', 'super-secret').update(body).digest('hex'),
        }),
      }),
    );
    expect(prisma.statusWebhookDelivery.update).toHaveBeenCalledWith({
      where: { id: delivery.id },
      data: expect.objectContaining({
        status: StatusWebhookDeliveryStatus.SENT,
        responseStatus: 204,
        lastError: null,
      }),
    });
  });

  it('retries failed deliveries and moves them to FAILED after the final attempt', async () => {
    const retry = {
        id: 'del_retry',
        endpointId: 'hook_1',
        event: StatusWebhookEvent.INCIDENT_CREATED,
        payload: {},
        attempts: 2,
        createdAt: new Date(),
        endpoint: { id: 'hook_1', url: 'https://8.8.8.8/retry', secretEnc: null },
      };
    const fail = {
        id: 'del_fail',
        endpointId: 'hook_2',
        event: StatusWebhookEvent.INCIDENT_CREATED,
        payload: {},
        attempts: 5,
        createdAt: new Date(),
        endpoint: { id: 'hook_2', url: 'https://8.8.4.4/fail', secretEnc: null },
      };
    prisma.statusWebhookDelivery.findMany.mockResolvedValue([{ id: retry.id }, { id: fail.id }]);
    prisma.statusWebhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.statusWebhookDelivery.findUnique
      .mockResolvedValueOnce(retry)
      .mockResolvedValueOnce(fail);
    (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });

    const service = new StatusWebhookService(prisma as never, crypto as never);
    await service.deliverPending();

    expect(prisma.statusWebhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del_retry' },
      data: expect.objectContaining({
        status: StatusWebhookDeliveryStatus.PENDING,
        attempts: 2,
        lastError: 'HTTP 500',
      }),
    });
    expect(prisma.statusWebhookDelivery.update).toHaveBeenCalledWith({
      where: { id: 'del_fail' },
      data: expect.objectContaining({
        status: StatusWebhookDeliveryStatus.FAILED,
        attempts: 5,
        nextAttemptAt: null,
      }),
    });
  });

  it('omits signature header when endpoint has no secret', async () => {
    const delivery = {
      id: 'del_plain',
      endpointId: 'hook_plain',
      event: StatusWebhookEvent.INCIDENT_CREATED,
      payload: {},
      attempts: 0,
      createdAt: new Date(),
      endpoint: { id: 'hook_plain', url: 'https://8.8.8.8/plain', secretEnc: null },
    };
    prisma.statusWebhookDelivery.findMany.mockResolvedValue([{ id: delivery.id }]);
    prisma.statusWebhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.statusWebhookDelivery.findUnique.mockResolvedValue({ ...delivery, attempts: 1 });
    prisma.statusWebhookDelivery.update.mockResolvedValue({});
    (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 });

    const service = new StatusWebhookService(prisma as never, crypto as never);
    await service.deliverPending();

    const headers = (global.fetch as jest.Mock).mock.calls[0][1].headers as Record<string, string>;
    expect(headers['x-verris-signature']).toBeUndefined();
  });

  it('schedules retry when fetch throws a network error', async () => {
    const delivery = {
      id: 'del_net',
      endpointId: 'hook_1',
      event: StatusWebhookEvent.INCIDENT_CREATED,
      payload: {},
      attempts: 1,
      createdAt: new Date(),
      endpoint: { id: 'hook_1', url: 'https://8.8.8.8/net', secretEnc: null },
    };
    prisma.statusWebhookDelivery.findMany.mockResolvedValue([{ id: delivery.id }]);
    prisma.statusWebhookDelivery.updateMany.mockResolvedValue({ count: 1 });
    prisma.statusWebhookDelivery.findUnique.mockResolvedValue(delivery);
    (global.fetch as jest.Mock).mockRejectedValue(new Error('ECONNRESET'));

    const service = new StatusWebhookService(prisma as never, crypto as never);
    await service.deliverPending();

    expect(prisma.statusWebhookDelivery.update).toHaveBeenCalledWith({
      where: { id: delivery.id },
      data: expect.objectContaining({
        status: StatusWebhookDeliveryStatus.PENDING,
        attempts: 1,
        lastError: 'ECONNRESET',
        nextAttemptAt: expect.any(Date),
      }),
    });
  });

  it('rejects private webhook targets before delivery', async () => {
    await expect(assertPublicWebhookUrl('https://127.0.0.1/webhook')).rejects.toThrow(
      /private|public hostname/i,
    );
    await expect(assertPublicWebhookUrl('http://8.8.8.8/webhook')).rejects.toThrow(/HTTPS/i);
  });
});

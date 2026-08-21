import { BadRequestException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { createHmac } from 'crypto';
import { StripeService } from './stripe.service';

type ConfigMap = Record<string, string | undefined>;

function makeService(config: ConfigMap): StripeService {
  const configService = {
    get: <T>(key: string): T | undefined => config[key] as unknown as T,
  };
  return new StripeService(configService as never);
}

function signPayload(secret: string, payload: string, timestamp: number): string {
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${payload}`, 'utf8')
    .digest('hex');
  return `t=${timestamp},v1=${signature}`;
}

const WEBHOOK_SECRET = 'whsec_test_secret';

describe('StripeService', () => {
  describe('configuration flags', () => {
    it('is not configured without a secret key', () => {
      const service = makeService({});
      expect(service.isConfigured()).toBe(false);
      expect(service.isWebhookConfigured()).toBe(false);
    });

    it('reports configured when secret + webhook secret are present', () => {
      const service = makeService({
        stripeSecretKey: 'sk_test_123',
        stripeWebhookSecret: WEBHOOK_SECRET,
      });
      expect(service.isConfigured()).toBe(true);
      expect(service.isWebhookConfigured()).toBe(true);
    });
  });

  describe('verifyWebhookSignature', () => {
    it('accepts a valid, fresh signature', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      const payload = JSON.stringify({ id: 'evt_1', type: 'invoice.paid' });
      const ts = Math.floor(Date.now() / 1000);
      const header = signPayload(WEBHOOK_SECRET, payload, ts);
      expect(() => service.verifyWebhookSignature(Buffer.from(payload), header)).not.toThrow();
    });

    it('rejects a tampered payload (signature mismatch)', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      const ts = Math.floor(Date.now() / 1000);
      const header = signPayload(WEBHOOK_SECRET, '{"id":"evt_1"}', ts);
      expect(() =>
        service.verifyWebhookSignature(Buffer.from('{"id":"evt_TAMPERED"}'), header),
      ).toThrow(UnauthorizedException);
    });

    it('rejects a signature signed with a different secret', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      const payload = '{"id":"evt_1"}';
      const ts = Math.floor(Date.now() / 1000);
      const header = signPayload('whsec_other_secret', payload, ts);
      expect(() => service.verifyWebhookSignature(Buffer.from(payload), header)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a timestamp outside the tolerance window (replay protection)', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      const payload = '{"id":"evt_1"}';
      const staleTs = Math.floor(Date.now() / 1000) - 3600;
      const header = signPayload(WEBHOOK_SECRET, payload, staleTs);
      expect(() => service.verifyWebhookSignature(Buffer.from(payload), header)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a missing signature header', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      expect(() => service.verifyWebhookSignature(Buffer.from('{}'), undefined)).toThrow(
        UnauthorizedException,
      );
    });

    it('rejects a malformed signature header', () => {
      const service = makeService({ stripeWebhookSecret: WEBHOOK_SECRET });
      expect(() => service.verifyWebhookSignature(Buffer.from('{}'), 'not-a-valid-header')).toThrow(
        UnauthorizedException,
      );
    });

    it('fails closed when no webhook secret is configured', () => {
      const service = makeService({});
      expect(() => service.verifyWebhookSignature(Buffer.from('{}'), 't=1,v1=abc')).toThrow(
        ServiceUnavailableException,
      );
    });
  });

  describe('parseEvent', () => {
    it('parses a well-formed event', () => {
      const service = makeService({});
      const raw = Buffer.from(
        JSON.stringify({ id: 'evt_1', type: 'invoice.paid', data: { object: { id: 'in_1' } } }),
      );
      const event = service.parseEvent(raw);
      expect(event.id).toBe('evt_1');
      expect(event.type).toBe('invoice.paid');
      expect(event.data.object.id).toBe('in_1');
    });

    it('throws on invalid JSON', () => {
      const service = makeService({});
      expect(() => service.parseEvent(Buffer.from('not json'))).toThrow(BadRequestException);
    });

    it('throws on a structurally invalid event', () => {
      const service = makeService({});
      expect(() => service.parseEvent(Buffer.from(JSON.stringify({ id: 'evt_1' })))).toThrow(
        BadRequestException,
      );
    });
  });
});

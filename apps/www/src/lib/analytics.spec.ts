import { events } from './analytics';
import { readConsent } from './cookie-consent';
import { relayLeadToCapi } from './relay-capi';

/**
 * CL-05 — deduplikacja Lead: przeglądarka (dataLayer → GTM, Meta Pixel) i serwer (Conversions API)
 * dostają JEDEN `event_id`. Meta scala zdarzenia tylko przy identycznym `event_id` i nazwie:
 * https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
 *
 * Relay do CAPI idzie wyłącznie po zgodzie marketingowej.
 */

jest.mock('./relay-capi', () => ({ relayLeadToCapi: jest.fn(async () => undefined) }));
jest.mock('./cookie-consent', () => ({ readConsent: jest.fn() }));

const w = globalThis as unknown as {
  window?: { dataLayer: Record<string, unknown>[]; fbq?: jest.Mock; location: { href: string } };
};
const relay = relayLeadToCapi as jest.Mock;
const zgoda = readConsent as jest.Mock;
const poRelay = () => new Promise((r) => setImmediate(r));

beforeEach(() => {
  w.window = { dataLayer: [], fbq: jest.fn(), location: { href: 'https://verris.pl/kontakt' } };
  relay.mockClear();
});
afterEach(() => {
  delete w.window;
});

describe('CL-05 generateLead — jeden event_id dla dataLayer, Pixela i CAPI', () => {
  it('ze zgodą marketingową: ten sam event_id w trzech miejscach', async () => {
    zgoda.mockReturnValue({ v: 1, ts: 't', functional: false, analytics: false, marketing: true });
    const eventId = events.generateLead('kontakt');
    await poRelay();

    expect(eventId).toBeTruthy();
    expect(w.window!.dataLayer).toEqual([
      expect.objectContaining({ event: 'generate_lead', event_id: eventId, currency: 'PLN' }),
    ]);
    expect(w.window!.fbq).toHaveBeenCalledWith('track', 'Lead', expect.any(Object), { eventID: eventId });
    expect(relay).toHaveBeenCalledTimes(1);
    expect(relay).toHaveBeenCalledWith(expect.objectContaining({ eventId, method: 'kontakt' }));
  });

  it('bez zgody marketingowej: nic nie idzie do CAPI', async () => {
    zgoda.mockReturnValue({ v: 1, ts: 't', functional: true, analytics: true, marketing: false });
    events.generateLead('kontakt');
    await poRelay();
    expect(relay).not.toHaveBeenCalled();
  });

  it('każdy lead ma własny event_id (dwa leady ≠ jedno zdarzenie)', () => {
    zgoda.mockReturnValue(null);
    expect(events.generateLead('a')).not.toBe(events.generateLead('b'));
  });
});

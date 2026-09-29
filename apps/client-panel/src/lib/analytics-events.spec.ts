import { trackBeginCheckout, trackPurchase } from "./analytics-events";
import { readConsent } from "./cookie-consent";
import { relayPurchaseToCapi } from "./meta-capi";

/**
 * CL-05 — deduplikacja zakupu: jedno zdarzenie zakupu = jeden `event_id` współdzielony przez
 * dataLayer (GTM), Meta Pixel (`eventID`) i Conversions API (serwer). Meta scala zdarzenia
 * tylko przy identycznym `event_id` i nazwie:
 * https://developers.facebook.com/docs/marketing-api/conversions-api/deduplicate-pixel-and-server-events
 *
 * `event_id` zakupu wynika z `transactionId`, więc odświeżenie strony potwierdzenia nie tworzy
 * drugiego zakupu. Relay do CAPI wyłącznie po zgodzie marketingowej.
 */

jest.mock("./meta-capi", () => ({ relayPurchaseToCapi: jest.fn(async () => undefined) }));
jest.mock("./cookie-consent", () => ({ readConsent: jest.fn() }));

const w = globalThis as unknown as {
  window?: { dataLayer: Record<string, unknown>[]; fbq?: jest.Mock; location: { href: string } };
};
const relay = relayPurchaseToCapi as jest.Mock;
const zgoda = readConsent as jest.Mock;
const poRelay = () => new Promise((r) => setImmediate(r));
const zakup = { transactionId: "sub_123", value: 49.99, items: [{ item_name: "Hosting Start" }] };

beforeEach(() => {
  w.window = { dataLayer: [], fbq: jest.fn(), location: { href: "https://panel.verris.pl/x" } };
  relay.mockClear();
});
afterEach(() => {
  delete w.window;
});

describe("CL-05 trackPurchase — jeden event_id dla dataLayer, Pixela i CAPI", () => {
  it("ze zgodą marketingową: ten sam event_id w trzech miejscach", async () => {
    zgoda.mockReturnValue({ v: 1, ts: "t", functional: false, analytics: false, marketing: true });
    const eventId = trackPurchase(zakup);
    await poRelay();

    expect(eventId).toBe("purchase-sub_123");
    const purchase = w.window!.dataLayer.find((e) => e.event === "purchase");
    expect(purchase).toMatchObject({ event_id: eventId, ecommerce: { transaction_id: "sub_123" } });
    expect(w.window!.fbq).toHaveBeenCalledWith("track", "Purchase", expect.any(Object), { eventID: eventId });
    expect(relay).toHaveBeenCalledTimes(1);
    expect(relay).toHaveBeenCalledWith(expect.objectContaining({ eventId, value: 49.99 }));
  });

  it("ten sam zakup wysłany drugi raz (odświeżenie) → ten sam event_id", () => {
    zgoda.mockReturnValue(null);
    expect(trackPurchase(zakup)).toBe(trackPurchase(zakup));
  });

  it("bez zgody marketingowej: nic nie idzie do CAPI", async () => {
    zgoda.mockReturnValue({ v: 1, ts: "t", functional: true, analytics: true, marketing: false });
    trackPurchase(zakup);
    await poRelay();
    expect(relay).not.toHaveBeenCalled();
  });

  it("kwota nieznana → brak zdarzenia (fałszywe zera psują ROAS)", () => {
    expect(trackPurchase({ ...zakup, value: Number.NaN })).toBeUndefined();
    expect(w.window!.dataLayer).toEqual([]);
    expect(w.window!.fbq).not.toHaveBeenCalled();
  });
});

describe("CL-05 trackBeginCheckout — dataLayer i Pixel z tym samym event_id", () => {
  it("InitiateCheckout ma eventID równe event_id w dataLayer", () => {
    trackBeginCheckout([{ item_name: "VPS 2", item_category: "vps" }], 30);
    const ev = w.window!.dataLayer.find((e) => e.event === "begin_checkout");
    expect(ev?.event_id).toBeTruthy();
    expect(w.window!.fbq).toHaveBeenCalledWith("track", "InitiateCheckout", expect.any(Object), {
      eventID: ev!.event_id,
    });
  });
});

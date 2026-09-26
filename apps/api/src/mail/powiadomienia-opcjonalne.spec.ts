import { MailerService } from './mailer.service.js';
import { autoscalingEndedTemplate } from './templates/autoscaling-notifications.js';
import { planChangedTemplate } from './templates/plan-change-notifications.js';

/**
 * N-10 — powiadomienia operacyjne, które klient może wyłączyć, i te, których wyłączyć nie może.
 * Do 2026-09-24 autoskalowanie i zmiana planu szły jako PRODUCT_UPDATE, więc przy domyślnym
 * productUpdatesEmail=false klient NIE dostawał ani informacji o kosztach skoku, ani
 * potwierdzenia zmiany planu — a stopka mówiła o „zgodzie na komunikację marketingową”.
 */
function stanowisko(prefs: Record<string, boolean>) {
  const provider = { id: 'test', send: vi.fn(async () => ({ providerId: 'test', messageId: 'm1' })) };
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ id: 'u1', anonymizedAt: null, marketingPreferences: { marketingEmail: false, productUpdatesEmail: false, autoscalingEmail: true, quotaAlertsEmail: true, ...prefs } })) },
    emailLog: { create: vi.fn(async () => ({ id: 'l1' })), update: vi.fn(async () => ({})) },
    controlPlaneSystemAddress: { findUnique: vi.fn(async () => null) },
  };
  const svc = new MailerService(provider as never, { fromName: 'Verris', swallowErrors: false } as never, prisma as never, { get: () => undefined } as never);
  return { svc, provider };
}
const baza = { to: 'jan@firma.pl', userId: 'u1', subject: 's', text: 't', category: 'TRANSACTIONAL' as const };
const zakonczone = (reason: 'RELAXED' | 'CAP_REACHED' | 'WALLET_EMPTY') =>
  autoscalingEndedTemplate({ to: 'jan@firma.pl', userId: 'u1', firstName: null, domain: 'firma.pl', durationMinutes: 30, totalCostPln: 1.5, reason, panelUrl: 'https://panel.verris.pl', autoscalingUrl: 'https://panel.verris.pl/x' });

describe('N-10 — powiadomienia operacyjne', () => {
  it('autoskalowanie i zmiana planu to maile transakcyjne (nie PRODUCT_UPDATE), bez stopki marketingowej', () => {
    const a = zakonczone('RELAXED');
    const p = planChangedTemplate({ to: 'jan@firma.pl', userId: 'u1', firstName: null, domain: 'firma.pl', fromPlanName: 'A', toPlanName: 'B', serviceUrl: 'https://panel.verris.pl/s', panelUrl: 'https://panel.verris.pl' } as never);
    expect([a.category, p.category]).toEqual(['TRANSACTIONAL', 'TRANSACTIONAL']);
    expect(a.html).not.toContain('komunikację marketingową');
  });

  it('wyłączone autoskalowanie: start/koniec nie wychodzą, zatrzymanie przez limit i pusty portfel — zawsze', async () => {
    const s = stanowisko({ autoscalingEmail: false });
    expect((await s.svc.send({ ...baza, tag: 'autoscaling.started' })).suppressedReason).toBe('OPTED_OUT');
    expect((await s.svc.send(zakonczone('RELAXED'))).delivered).toBe(false);
    expect((await s.svc.send(zakonczone('CAP_REACHED'))).delivered).toBe(true);
    expect((await s.svc.send(zakonczone('WALLET_EMPTY'))).delivered).toBe(true);
  });

  it('wyłączone alerty limitów: quota-alert nie wychodzi; bezpieczeństwo i płatności bez przełącznika', async () => {
    const s = stanowisko({ quotaAlertsEmail: false, autoscalingEmail: false });
    expect((await s.svc.send({ ...baza, tag: 'hosting.quota-alert' })).suppressedReason).toBe('OPTED_OUT');
    expect((await s.svc.send({ ...baza, tag: 'security.password-changed' })).delivered).toBe(true);
    expect((await s.svc.send({ ...baza, tag: 'subscription.payment-failed' })).delivered).toBe(true);
  });

  it('domyślnie (włączone) wszystko wychodzi', async () => {
    const s = stanowisko({});
    expect((await s.svc.send({ ...baza, tag: 'autoscaling.started' })).delivered).toBe(true);
    expect((await s.svc.send({ ...baza, tag: 'hosting.quota-alert' })).delivered).toBe(true);
  });
});

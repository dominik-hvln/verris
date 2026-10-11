import { ServiceHealthService, WYSYLKA_WSTRZYMANA, zWstrzymanaWysylka } from './service-health.service.js';

/**
 * Weryfikacja 11.10 — konto d3 z wysyłką poczty zablokowaną przez obsługę (F3.1, Account.mailBlockedAt) miało
 * w nagłówku karty usługi „Wszystko działa”: zdrowie liczyły same sondy (DNS, TLS, serwer poczty) z migawki,
 * a blokada per konto jest tylko w bazie. Stan blokady nakładamy przy każdym odczycie.
 */
describe('zdrowie usługi — wysyłka poczty wstrzymana przez obsługę', () => {
  const zdrowa = { score: 100, label: 'healthy' as const, checkedAt: null, summary: 'Wszystkie sprawdzone parametry w normie.' };

  it('bez blokady — wynik bez zmian', () => {
    expect(zWstrzymanaWysylka(zdrowa, null)).toBe(zdrowa);
  });

  it('zdrowa usługa z blokadą — „wymaga uwagi” z opisem dla klienta, bez powodu obsługi', () => {
    const h = zWstrzymanaWysylka(zdrowa, new Date());
    expect(h).toMatchObject({ label: 'attention', summary: WYSYLKA_WSTRZYMANA, wysylkaWstrzymana: true, score: 100 });
    expect(h.summary).not.toMatch(/DirectAdmin|exim|blacklist/i);
  });

  it('krytyczna zostaje krytyczna, a jej opis nie znika', () => {
    const h = zWstrzymanaWysylka({ ...zdrowa, label: 'critical', summary: 'serwer poczty nie odpowiada.' }, new Date());
    expect(h).toMatchObject({ label: 'critical', summary: `${WYSYLKA_WSTRZYMANA} serwer poczty nie odpowiada.` });
  });

  it('karta usługi: blokada z bazy także na migawce sprzed blokady (bez czekania na nowe sondy)', async () => {
    const migawka = {
      computedAt: new Date(),
      score: 100,
      dnsOk: true,
      tlsOk: true,
      backupFresh: true,
      lveOk: true,
      panelTlsOk: null,
      mailOk: true,
      details: { summary: 'Wszystkie sprawdzone parametry w normie.' },
    };
    const prisma = {
      subscription: { findFirst: vi.fn().mockResolvedValue({ id: 's1', account: { mailBlockedAt: new Date() }, healthSnapshots: [migawka] }) },
    };
    const svc = new (ServiceHealthService as unknown as new (...a: unknown[]) => ServiceHealthService)(prisma, {});
    expect(await svc.getOrRefreshForSubscription('s1', 'u1')).toMatchObject({ label: 'attention', wysylkaWstrzymana: true, summary: WYSYLKA_WSTRZYMANA });

    prisma.subscription.findFirst.mockResolvedValue({ id: 's1', account: { mailBlockedAt: null }, healthSnapshots: [migawka] });
    expect(await svc.getOrRefreshForSubscription('s1', 'u1')).toMatchObject({ label: 'healthy' });
  });
});

import { describe, expect, it } from 'vitest';
import { oczyscDetailsZdarzeniaKlienta } from './services.controller.js';

/**
 * Audyt bezpieczeństwa 09.10 (A02) — GET /services/:id nie może oddać klientowi surowego błędu DA/węzła
 * ani wewnętrznej notatki obsługi zapisanych w SubscriptionEvent.details.
 */
describe('oczyszczanie details zdarzeń dla klienta', () => {
  it('surowy błąd DA/ścieżka węzła → komunikat ogólny (bez DirectAdmin i /usr/local)', () => {
    const wej = { error: 'Cannot create user: DirectAdmin /usr/local/directadmin failed', reason: 'PROWIZJONOWANIE' };
    const wy = oczyscDetailsZdarzeniaKlienta(wej) as Record<string, unknown>;
    expect(JSON.stringify(wy)).not.toMatch(/DirectAdmin|\/usr\/local/);
    expect(wy.reason).toBe('PROWIZJONOWANIE'); // pole bezpieczne zostaje
  });

  it('wewnętrzna notatka obsługi i daError są wycinane', () => {
    const wej = { reason: 'ABUSE', note: 'klient spamuje, zawieszone ręcznie', daError: 'DA :2222 timeout' };
    const wy = oczyscDetailsZdarzeniaKlienta(wej) as Record<string, unknown>;
    expect(wy.note).toBeUndefined();
    expect(wy.daError).toBeUndefined();
    expect(wy.reason).toBe('ABUSE');
  });

  it('zagnieżdżone pola też są czyszczone', () => {
    const wej = { info: { blad: 'CloudLinux LVE limit', ok: true } };
    const wy = oczyscDetailsZdarzeniaKlienta(wej) as { info: Record<string, unknown> };
    expect(JSON.stringify(wy)).not.toMatch(/CloudLinux/);
    expect(wy.info.ok).toBe(true);
  });

  it('zwykłe details bez sekretów przechodzą bez zmian', () => {
    const wej = { targetDomain: 'sklep.pl', sources: { ftp: true } };
    expect(oczyscDetailsZdarzeniaKlienta(wej)).toEqual(wej);
  });
});

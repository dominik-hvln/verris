import { describe, expect, it } from 'vitest';
import { PROGI_WINDYKACJI, prognozaWindykacji, scalProbyAutoDoladowania, type UslugaDoPrognozy } from './windykacja.js';

const teraz = new Date('2026-10-11T12:00:00Z');
const d = (iso: string) => new Date(iso);
const usluga = (o: Partial<UslugaDoPrognozy> = {}): UslugaDoPrognozy => ({
  status: 'ACTIVE',
  paymentSource: 'WALLET',
  stripeSubscriptionId: null,
  currentPeriodEnd: d('2026-10-20T08:00:00Z'),
  cancelAt: null,
  paymentPromiseUntil: null,
  isTrial: false,
  ostatniaNieudana: null,
  ostatnieZawieszenie: null,
  ...o,
});

describe('F3.6 — prognoza windykacji (lustro renewal.scheduler.ts)', () => {
  it('progi pokazują to, co zaszyte w harmonogramach: T-7/T-3/T-1, karencja 0, 14 + 14 dni', () => {
    expect(PROGI_WINDYKACJI).toEqual({ przypomnieniaDniPrzed: [7, 3, 1], karencjaDni: 0, zawieszenieDoWygasnieciaDni: 14, retencjaKontaDni: 14 });
  });

  it('aktywna z portfela: próba obciążenia 24 h przed końcem okresu, zawieszenie z końcem okresu', () => {
    const p = prognozaWindykacji(usluga(), teraz);
    expect(p.etap).toBe('odnowienie');
    expect(p.probaOdnowienia?.toISOString()).toBe('2026-10-19T08:00:00.000Z');
    expect(p.zawieszenie?.toISOString()).toBe('2026-10-20T08:00:00.000Z');
    expect(p.wygasniecie).toBeNull();
  });

  it('zaległa z portfela: zawieszenie nie przed końcem opłaconego okresu, a obietnica zapłaty przesuwa je dalej', () => {
    const zalegla = usluga({ status: 'PAST_DUE', ostatniaNieudana: d('2026-10-19T08:30:00Z') });
    expect(prognozaWindykacji(zalegla, teraz).zawieszenie?.toISOString()).toBe('2026-10-20T08:00:00.000Z');
    const zObietnica = { ...zalegla, paymentPromiseUntil: d('2026-10-25T00:00:00Z') };
    const p = prognozaWindykacji(zObietnica, teraz);
    expect(p.etap).toBe('zalegla');
    expect(p.zawieszenie?.toISOString()).toBe('2026-10-25T00:00:00.000Z');
    expect(p.uwaga).toMatch(/Obietnica zapłaty/);
  });

  it('zaległa kartą (Stripe): liczy się sama nieudana płatność, nie koniec okresu', () => {
    const p = prognozaWindykacji(
      usluga({ status: 'PAST_DUE', paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_1', currentPeriodEnd: d('2026-11-10T00:00:00Z'), ostatniaNieudana: d('2026-10-10T10:00:00Z') }),
      teraz,
    );
    expect(p.zawieszenie?.toISOString()).toBe('2026-10-10T10:00:00.000Z');
  });

  it('zawieszona za brak płatności: wygaśnięcie 14 dni po zawieszeniu; zawieszona przez obsługę — bez wygaśnięcia', () => {
    const zaPlatnosc = prognozaWindykacji(usluga({ status: 'SUSPENDED', ostatnieZawieszenie: { kiedy: d('2026-10-05T09:00:00Z'), powod: 'GRACE_EXPIRED' } }), teraz);
    expect(zaPlatnosc.etap).toBe('zawieszona');
    expect(zaPlatnosc.wygasniecie?.toISOString()).toBe('2026-10-19T09:00:00.000Z');
    const reczne = prognozaWindykacji(usluga({ status: 'SUSPENDED', ostatnieZawieszenie: { kiedy: d('2026-10-05T09:00:00Z'), powod: 'MANUAL_ADMIN' } }), teraz);
    expect(reczne.wygasniecie).toBeNull();
  });

  it('bez windykacji: rozliczenie poza Verris, anulowana na koniec okresu, okres próbny, karta cykliczna aktywna', () => {
    for (const o of [
      { paymentSource: 'MANUAL' },
      { cancelAt: d('2026-10-20T08:00:00Z') },
      { isTrial: true },
      { paymentSource: 'STRIPE_CARD', stripeSubscriptionId: 'sub_2' },
    ] satisfies Partial<UslugaDoPrognozy>[]) {
      const p = prognozaWindykacji(usluga(o), teraz);
      expect({ o, etap: p.etap, zawieszenie: p.zawieszenie }).toEqual({ o, etap: 'bez-windykacji', zawieszenie: null });
    }
  });
});

describe('F3.6 — scalanie prób auto-doładowania', () => {
  it('odmowa karty (wpis z obciążenia + wpis z webhooka w ciągu 15 min) to jedna nieudana płatność; inny klient i inna godzina zostają', () => {
    const w = (id: string, userId: string, iso: string, akcja: 'WALLET_AUTO_TOPUP_FAILED' | 'WALLET_AUTOTOPUP_PAYMENT_FAILED') => ({ id, userId, kiedy: d(iso), akcja, powod: null, referencja: null });
    const wynik = scalProbyAutoDoladowania([
      w('a', 'u1', '2026-10-11T10:00:05Z', 'WALLET_AUTOTOPUP_PAYMENT_FAILED'),
      w('b', 'u1', '2026-10-11T10:00:00Z', 'WALLET_AUTO_TOPUP_FAILED'),
      w('c', 'u2', '2026-10-11T10:00:05Z', 'WALLET_AUTOTOPUP_PAYMENT_FAILED'),
      w('d', 'u1', '2026-10-11T08:00:00Z', 'WALLET_AUTOTOPUP_PAYMENT_FAILED'),
    ]);
    expect(wynik.map((x) => x.id)).toEqual(['b', 'c', 'd']);
  });
});

import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BillingInterval, SubscriptionPaymentSource } from '@verris/database';
import { CreateSubscriptionDto } from './subscription.dto.js';
import { StartTrialDto } from './trial.dto.js';
import { ZamowienieApiDto } from '../public-api-orders.controller.js';

const baza = {
  planId: '11111111-1111-4111-8111-111111111111',
  immediatePerformanceConsent: true,
  interval: BillingInterval.MONTH,
  paymentSource: SubscriptionPaymentSource.WALLET,
};

/** Wszystkie trzy wejścia zamówienia (panel, okres próbny, publiczne API) mają tę samą regułę domeny. */
const DTO = [CreateSubscriptionDto, StartTrialDto, ZamowienieApiDto] as Array<new () => { domain?: string }>;

const zamowienie = (extra: Record<string, unknown>) => plainToInstance(CreateSubscriptionDto, { ...baza, ...extra });
const bledy = (dto: object, pole: string) => validateSync(dto).filter((e) => e.property === pole);

/** P5-04 (beta 3.11): `example..com` i `-zla-.pl` przechodziły do opłaty, `żółw.pl` dostawał „Niepoprawny format”. */
describe('P5-04 — domena w zamówieniu', () => {
  it.each(['example..com', '-zla-.pl', 'zla-.pl', 'a.b', 'https://firma.pl', 'firma.pl/sklep', 'firma', 'fir ma.pl', `${'a'.repeat(64)}.pl`])(
    'odrzuca %s',
    (domain) => {
      for (const Dto of DTO) {
        expect(bledy(plainToInstance(Dto, { ...baza, domain }), 'domain')).not.toHaveLength(0);
      }
    },
  );

  it.each([
    ['firma.pl', 'firma.pl'],
    ['Sklep-Kawy.com.pl', 'sklep-kawy.com.pl'],
    [' firma.pl. ', 'firma.pl'],
    ['żółw.pl', 'xn--w-uga1v8h.pl'],
    ['xn--w-uga1v8h.pl', 'xn--w-uga1v8h.pl'],
  ])('przyjmuje %s jako %s', (wejscie, zapis) => {
    for (const Dto of DTO) {
      const dto = plainToInstance(Dto, { ...baza, domain: wejscie });
      expect(bledy(dto, 'domain')).toHaveLength(0);
      expect(dto.domain).toBe(zapis);
    }
  });

  it('komunikat po polsku, bez żargonu', () => {
    const [b] = bledy(zamowienie({ domain: 'example..com' }), 'domain');
    expect(Object.values(b.constraints ?? {}).join(' ')).toContain('np. mojafirma.pl');
  });
});

/** Decyzja 6 (3.11): limit kosztu autoskalowania można podać już w zamówieniu. */
describe('decyzja 6 — limit autoskalowania w zamówieniu', () => {
  it('przyjmuje kwotę z groszami i brak limitu', () => {
    expect(bledy(zamowienie({ autoscalingEnabled: true, autoscalingMaxCost: 30.5 }), 'autoscalingMaxCost')).toHaveLength(0);
    expect(bledy(zamowienie({ autoscalingEnabled: true }), 'autoscalingMaxCost')).toHaveLength(0);
  });

  it.each([-1, 100_000, 10.123, 'trzydzieści'])('odrzuca %s', (autoscalingMaxCost) => {
    expect(bledy(zamowienie({ autoscalingEnabled: true, autoscalingMaxCost }), 'autoscalingMaxCost')).not.toHaveLength(0);
  });
});

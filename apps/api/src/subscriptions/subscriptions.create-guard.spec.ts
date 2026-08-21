import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { ForbiddenException } from '@nestjs/common';
import { BillingInterval, SubscriptionPaymentSource } from '@verris/database';
import { CreateSubscriptionDto, CLIENT_PAYMENT_SOURCES } from './dto/subscription.dto';
import { SubscriptionsService } from './subscriptions.service';

/**
 * Z-02 — zamówienie usługi bez opłaty przez klienta.
 *
 * Przed tą zmianą `POST /subscriptions` przyjmował `paymentSource: MANUAL`
 * (`@IsEnum` przepuszczał całe enum), a serwis kierował takie zamówienie do
 * `provisionWithoutCharge` — usługa stawała się ACTIVE bez obciążenia i bez
 * faktury. Dowolne zarejestrowane konto mogło w ten sposób zamówić nieograniczoną
 * liczbę usług za 0 zł.
 *
 * Testy pilnują obu warstw: walidacji DTO na wejściu kontrolera i twardego
 * warunku w serwisie (na wypadek gdyby serwis zawołał kto inny).
 */
describe('Z-02 — MANUAL niedostępne ze ścieżki klienta', () => {
  const bazoweZamowienie = {
    planId: '11111111-1111-4111-8111-111111111111',
    immediatePerformanceConsent: true,
    interval: BillingInterval.MONTH,
    domain: 'przyklad.pl',
  };

  const zbudujDto = (paymentSource: SubscriptionPaymentSource) =>
    plainToInstance(CreateSubscriptionDto, { ...bazoweZamowienie, paymentSource });

  const bledyPola = (paymentSource: SubscriptionPaymentSource, pole = 'paymentSource') =>
    validateSync(zbudujDto(paymentSource)).filter((e) => e.property === pole);

  describe('walidacja DTO', () => {
    it('odrzuca MANUAL', () => {
      const bledy = bledyPola(SubscriptionPaymentSource.MANUAL);
      expect(bledy).toHaveLength(1);
      expect(bledy[0].constraints).toHaveProperty('isIn');
    });

    it('przepuszcza WALLET', () => {
      expect(bledyPola(SubscriptionPaymentSource.WALLET)).toHaveLength(0);
    });

    it('przepuszcza STRIPE_CARD', () => {
      expect(bledyPola(SubscriptionPaymentSource.STRIPE_CARD)).toHaveLength(0);
    });

    it('odrzuca wartość spoza enuma', () => {
      const dto = plainToInstance(CreateSubscriptionDto, {
        ...bazoweZamowienie,
        paymentSource: 'DARMOWE',
      });
      expect(validateSync(dto).filter((e) => e.property === 'paymentSource')).not.toHaveLength(0);
    });

    it('lista dozwolonych źródeł nie zawiera MANUAL', () => {
      expect(CLIENT_PAYMENT_SOURCES).not.toContain(SubscriptionPaymentSource.MANUAL);
      expect(CLIENT_PAYMENT_SOURCES).toHaveLength(2);
    });
  });

  describe('druga warstwa — warunek w serwisie', () => {
    /**
     * Serwis ma dwanaście zależności, ale warunek MANUAL wykonuje się przed
     * pierwszym ich użyciem. Podstawiamy atrapy, które celowo rzucają — gdyby
     * warunek zniknął, test wywali się na innym błędzie niż oczekiwany i to też
     * jest sygnał.
     */
    const wybuchowa = new Proxy(
      {},
      {
        get() {
          throw new Error('serwis nie powinien dotknąć zależności przed odrzuceniem MANUAL');
        },
      },
    ) as never;

    const zbudujSerwis = () =>
      new SubscriptionsService(
        wybuchowa, wybuchowa, wybuchowa, wybuchowa, wybuchowa, wybuchowa,
        wybuchowa, wybuchowa, wybuchowa, wybuchowa, wybuchowa, wybuchowa,
      );

    it('odrzuca MANUAL bez jawnego allowManual', async () => {
      const dto = { ...bazoweZamowienie, paymentSource: SubscriptionPaymentSource.MANUAL } as
        CreateSubscriptionDto;
      await expect(zbudujSerwis().create('user-1', dto)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('odrzuca MANUAL także przy allowManual: false', async () => {
      const dto = { ...bazoweZamowienie, paymentSource: SubscriptionPaymentSource.MANUAL } as
        CreateSubscriptionDto;
      await expect(
        zbudujSerwis().create('user-1', dto, { allowManual: false }),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('przy allowManual: true przechodzi dalej — czyli warunek nie blokuje operatora', async () => {
      const dto = { ...bazoweZamowienie, paymentSource: SubscriptionPaymentSource.MANUAL } as
        CreateSubscriptionDto;
      // Ścieżka operatorska ma iść dalej i dopiero tam sięgnąć po Prismę,
      // co na atrapie kończy się naszym własnym błędem — nie ForbiddenException.
      await expect(
        zbudujSerwis().create('user-1', dto, { allowManual: true }),
      ).rejects.not.toBeInstanceOf(ForbiddenException);
    });
  });
});

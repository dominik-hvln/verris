import { Prisma, WalletTxType } from '@verris/database';
import { BillingService } from './billing.service.js';

/**
 * Przegląd F3.6 — wykres „wpływy/wypływy” portfela klienta (12 miesięcy) liczył kierunek po typie: ujemna korekta
 * salda (ADJUSTMENT, np. korekta w dół przez Finanse) trafiała do wpływów.
 */
it('korekta salda w dół jest wypływem, w górę — wpływem', () => {
  const teraz = new Date(2026, 9, 11);
  const d = (kwota: string, type: WalletTxType) => ({ amount: new Prisma.Decimal(kwota), type, createdAt: new Date(2026, 9, 5) });
  const przeplyw = (
    BillingService.prototype as unknown as {
      buildWalletMonthlyFlowLast12: (t: ReturnType<typeof d>[], n: Date) => Array<{ month: string; inflow: string; outflow: string }>;
    }
  ).buildWalletMonthlyFlowLast12.call(null, [d('100.00', WalletTxType.TOPUP), d('-30.00', WalletTxType.ADJUSTMENT), d('5.00', WalletTxType.ADJUSTMENT), d('-45.00', WalletTxType.CHARGE_SUBSCRIPTION)], teraz);
  expect(przeplyw.find((m) => m.month === '2026-10')).toMatchObject({ inflow: '105.00', outflow: '75.00' });
});

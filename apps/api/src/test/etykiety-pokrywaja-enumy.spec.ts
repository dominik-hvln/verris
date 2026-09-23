import {
  BillingInterval,
  DomainStatus,
  InvoiceStatus,
  SubscriptionStatus,
  WalletTxStatus,
  WalletTxType,
} from '@verris/database';
import {
  BILLING_INTERVAL_PL,
  DOMAIN_STATUS_PL,
  INVOICE_STATUS_PL,
  SUBSCRIPTION_STATUS_PL,
  WALLET_TX_STATUS_PL,
  WALLET_TX_TYPE_PL,
} from '@verris/contracts';

/**
 * Każda wartość enumu z bazy ma polską etykietę w `@verris/contracts/etykiety`.
 *
 * DLACZEGO. Kontraktowy `WalletTxType` rozjechał się z bazą: brakowało
 * `CHARGE_DOMAIN` i `COMMISSION_CREDIT`, więc zakup domeny z portfela klient
 * widział w historii jako surowe `CHARGE_DOMAIN`. Typ w kontraktach tego nie
 * złapał, bo sam był niepełny — porównanie z enumem Prismy łapie.
 */
const PARY: Array<[string, Record<string, string>, Record<string, string>]> = [
  ['WalletTxType', WalletTxType, WALLET_TX_TYPE_PL],
  ['WalletTxStatus', WalletTxStatus, WALLET_TX_STATUS_PL],
  ['InvoiceStatus', InvoiceStatus, INVOICE_STATUS_PL],
  ['SubscriptionStatus', SubscriptionStatus, SUBSCRIPTION_STATUS_PL],
  ['BillingInterval', BillingInterval, BILLING_INTERVAL_PL],
  ['DomainStatus', DomainStatus, DOMAIN_STATUS_PL],
];

it.each(PARY)('%s — etykiety = wartości enumu w bazie', (_nazwa, enumBazy, etykiety) => {
  expect(Object.keys(etykiety).sort()).toEqual(Object.values(enumBazy).sort());
});

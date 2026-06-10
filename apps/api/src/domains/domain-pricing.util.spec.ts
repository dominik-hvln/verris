import { roundToNearest99, toCustomerDomainPrice, wholesaleToWalletCurrency } from './domain-pricing.util';
import { Prisma } from '@verris/database';

const cfg = { markup: 1.3, usdPln: 3.65, eurPln: 4.32, walletCurrency: 'PLN', vatRate: 23 };

describe('domain-pricing.util', () => {
  it('rounds to nearest .99', () => {
    expect(roundToNearest99(new Prisma.Decimal('20.27')).toFixed(2)).toBe('19.99');
    expect(roundToNearest99(new Prisma.Decimal('20.50')).toFixed(2)).toBe('20.99');
    expect(roundToNearest99(new Prisma.Decimal('0.50')).toFixed(2)).toBe('0.99');
  });

  it('converts USD wholesale netto → brutto z marżą i VAT', () => {
    const wholesale = wholesaleToWalletCurrency('4.27', 'USD', cfg);
    expect(wholesale.toFixed(2)).toBe('15.59');

    const customer = toCustomerDomainPrice('4.27', 'USD', cfg);
    expect(customer.grossAmount).toBe('24.99');
    expect(customer.currency).toBe('PLN');
    expect(customer.vatRate).toBe(23);
    expect(Number.parseFloat(customer.netAmount)).toBeGreaterThan(0);
    expect(Number.parseFloat(customer.vatAmount)).toBeGreaterThan(0);
  });

  it('applies markup and VAT on PLN wholesale netto', () => {
    const customer = toCustomerDomainPrice('10.00', 'PLN', cfg);
    expect(customer.grossAmount).toBe('15.99');
    expect(customer.currency).toBe('PLN');
  });

  it('converts EUR wholesale netto to PLN brutto', () => {
    const customer = toCustomerDomainPrice('10.00', 'EUR', cfg);
    expect(customer.grossAmount).toBe('68.99');
    expect(customer.currency).toBe('PLN');
  });

  it('renewal netto is priced higher than promo registration netto', () => {
    const register = toCustomerDomainPrice('4.26', 'USD', cfg);
    const renew = toCustomerDomainPrice('14.28', 'USD', cfg);
    expect(Number.parseFloat(renew.grossAmount)).toBeGreaterThan(Number.parseFloat(register.grossAmount));
  });
});

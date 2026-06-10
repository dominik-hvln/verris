import { roundToNearest99, toCustomerDomainPrice, wholesaleToWalletCurrency } from './domain-pricing.util';
import { Prisma } from '@verris/database';

const cfg = { markup: 1.3, usdPln: 3.65, eurPln: 4.32, walletCurrency: 'PLN' };

describe('domain-pricing.util', () => {
  it('rounds to nearest .99', () => {
    expect(roundToNearest99(new Prisma.Decimal('20.27')).toFixed(2)).toBe('19.99');
    expect(roundToNearest99(new Prisma.Decimal('20.50')).toFixed(2)).toBe('20.99');
    expect(roundToNearest99(new Prisma.Decimal('0.50')).toFixed(2)).toBe('0.99');
  });

  it('converts USD wholesale to PLN then applies markup and .99 rounding', () => {
    const wholesale = wholesaleToWalletCurrency('4.27', 'USD', cfg);
    expect(wholesale.toFixed(2)).toBe('15.59');

    const customer = toCustomerDomainPrice('4.27', 'USD', cfg);
    expect(customer).toEqual({ amount: '19.99', currency: 'PLN' });
  });

  it('passes PLN through before markup and .99 rounding', () => {
    expect(toCustomerDomainPrice('10.00', 'PLN', cfg)).toEqual({ amount: '12.99', currency: 'PLN' });
  });

  it('converts EUR wholesale to PLN', () => {
    const customer = toCustomerDomainPrice('10.00', 'EUR', cfg);
    expect(customer.amount).toBe('55.99');
    expect(customer.currency).toBe('PLN');
  });
});

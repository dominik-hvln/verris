import { toCustomerDomainPrice, wholesaleToWalletCurrency } from './domain-pricing.util';

const cfg = { markup: 1.3, usdPln: 3.65, eurPln: 4.32, walletCurrency: 'PLN' };

describe('domain-pricing.util', () => {
  it('converts USD wholesale to PLN then applies markup', () => {
    const wholesale = wholesaleToWalletCurrency('4.27', 'USD', cfg);
    expect(wholesale.toFixed(2)).toBe('15.59');

    const customer = toCustomerDomainPrice('4.27', 'USD', cfg);
    expect(customer).toEqual({ amount: '20.27', currency: 'PLN' });
  });

  it('passes PLN through before markup', () => {
    expect(toCustomerDomainPrice('10.00', 'PLN', cfg)).toEqual({ amount: '13.00', currency: 'PLN' });
  });

  it('converts EUR wholesale to PLN', () => {
    const customer = toCustomerDomainPrice('10.00', 'EUR', cfg);
    expect(customer.amount).toBe('56.16'); // 10 * 4.32 * 1.3
    expect(customer.currency).toBe('PLN');
  });
});

import { dmarcPolicyOf, dmarcRuaOf, isEmail, tuneDmarc } from './dmarc';

describe('E-17 tuneDmarc', () => {
  it('zmienia politykę i raporty, zostawia inne tagi', () => {
    expect(tuneDmarc('v=DMARC1; p=none; sp=none; rua=mailto:a@x.pl', 'reject', 'b@x.pl')).toBe(
      'v=DMARC1; p=reject; rua=mailto:b@x.pl; sp=none',
    );
    expect(tuneDmarc('v=DMARC1; p=quarantine; adkim=r', 'none', '')).toBe('v=DMARC1; p=none; adkim=r');
  });
  it('czyta politykę i adres, waliduje e-mail', () => {
    expect(dmarcPolicyOf('v=DMARC1; sp=reject; p=none')).toBe('none');
    expect(dmarcRuaOf('v=DMARC1; p=none; rua=mailto:dmarc@firma.pl')).toBe('dmarc@firma.pl');
    expect(isEmail('dmarc@firma.pl')).toBe(true);
    expect(isEmail('a@b;p=none')).toBe(false);
  });
});

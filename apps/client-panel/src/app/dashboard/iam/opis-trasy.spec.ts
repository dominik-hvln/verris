import { ktoregoDotyczy, opisTrasy } from './opis-trasy';

/** P3-07 — dziennik IAM pokazywał surowe trasy API („DELETE /subscriptions/:id”). */
describe('P3-07 – opis wpisu dziennika po ludzku', () => {
  it('trasy szczegółowe', () => {
    expect(opisTrasy({ method: 'DELETE', route: '/subscriptions/:id' })).toBe('rezygnacja z usługi');
    expect(opisTrasy({ method: 'POST', route: '/me/consent/accept-current' })).toBe('akceptacja regulaminu i polityki prywatności');
    expect(opisTrasy({ method: 'POST', route: '/billing/checkout-session' })).toBe('doładowanie portfela');
  });

  it('obszar i czynność, bez surowej trasy', () => {
    expect(opisTrasy({ method: 'POST', route: '/services/:id/hosting-dns' })).toBe('zmiana w obszarze DNS');
    expect(opisTrasy({ method: 'DELETE', route: '/services/:id/hosting-email/:email' })).toBe('usunięcie w obszarze poczty');
    expect(opisTrasy({ method: 'PATCH', route: '/nieznana' })).toBe('zmiana na koncie');
    for (const d of [{ method: 'POST', route: '/services/:id/hosting-ftp' }, { method: 'GET', route: '/billing/wallet' }]) {
      expect(opisTrasy(d)).not.toMatch(/\//);
    }
  });

  it('bez trasy – brak opisu; kogo dotyczy – nazwa i adres', () => {
    expect(opisTrasy(null)).toBeNull();
    expect(opisTrasy({ memberId: 'x' })).toBeNull();
    expect(ktoregoDotyczy({ nazwa: 'Piotr Nowak', email: 'piotr@firma.pl' })).toBe('Piotr Nowak (piotr@firma.pl)');
    expect(ktoregoDotyczy({ email: 'piotr@firma.pl' })).toBe('piotr@firma.pl');
    expect(ktoregoDotyczy({ memberId: 'x' })).toBeNull();
  });
});

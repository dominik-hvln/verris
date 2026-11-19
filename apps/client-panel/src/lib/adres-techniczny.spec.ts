import { linkAdresuTechnicznego } from './adres-techniczny';

/** Paczka 129 – link do adresu technicznego: https tylko tam, gdzie certyfikat jest wystawiony na tę nazwę. */
describe('linkAdresuTechnicznego', () => {
  it('konto założone na adresie technicznym → https', () => {
    expect(linkAdresuTechnicznego('v7k2m9qx.verris-host.pl', 'V7K2M9QX.verris-host.pl')).toBe('https://v7k2m9qx.verris-host.pl');
  });
  it('alias przy własnej domenie (certyfikat na domenę klienta) → http, bez ostrzeżenia przeglądarki', () => {
    expect(linkAdresuTechnicznego('v7k2m9qx.verris-host.pl', 'firma.pl')).toBe('http://v7k2m9qx.verris-host.pl');
    expect(linkAdresuTechnicznego('v7k2m9qx.verris-host.pl', null)).toBe('http://v7k2m9qx.verris-host.pl');
  });
});

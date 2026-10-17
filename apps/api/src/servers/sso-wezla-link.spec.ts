import { linkSsoNaNazweHosta } from './directadmin.service.js';

/** PB-31 (17.10): SSO admina do DA węzła — link http:// przy ssl=0 i link z IP przy certyfikacie na nazwę hosta. */
describe('linkSsoNaNazweHosta', () => {
  it('http:// (panel bez HTTPS) → czytelny błąd zamiast linku z hasłem sesji otwartym tekstem', () => {
    expect(() => linkSsoNaNazweHosta('http://62.171.162.57:2222/api/login/url?key=k', '62.171.162.57', 't2.verris.pl')).toThrow(/HTTPS/);
  });
  it('link z IP węzła → nazwa hosta (certyfikat panelu jest na nią)', () => {
    expect(linkSsoNaNazweHosta('https://62.171.162.57:2222/api/login/url?key=k', '62.171.162.57', 't2.verris.pl')).toBe(
      'https://t2.verris.pl:2222/api/login/url?key=k',
    );
  });
  it('link z nazwą hosta zostaje bez zmian', () => {
    expect(linkSsoNaNazweHosta('https://t2.verris.pl:2222/CMD_LOGIN_URL?hash=h', '62.171.162.57', 't2.verris.pl')).toBe(
      'https://t2.verris.pl:2222/CMD_LOGIN_URL?hash=h',
    );
  });
});

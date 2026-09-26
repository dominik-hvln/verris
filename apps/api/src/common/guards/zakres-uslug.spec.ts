import { wZakresie } from './zakres-uslug.js';

describe('PB-20 — zakres usług subkonta / członkostwa', () => {
  const Z = ['s1'];
  it('pusty zakres = całe konto (bez zmian dla dotychczasowych subkont)', () => {
    expect(wZakresie('GET', '/billing/wallet', {}, [])).toBe(true);
    expect(wZakresie('GET', '/domains', {}, undefined)).toBe(true);
  });
  it('usługa z zakresu tak, cudza nie — także pod innymi prefiksami', () => {
    expect(wZakresie('GET', '/services/:id/hosting-dns', { id: 's1' }, Z)).toBe(true);
    expect(wZakresie('POST', '/services/:id/files/write', { id: 's2' }, Z)).toBe(false);
    expect(wZakresie('GET', '/subscriptions/:id', { id: 's2' }, Z)).toBe(false);
    expect(wZakresie('GET', '/email-marketing/:subscriptionId/campaigns', { subscriptionId: 's1' }, Z)).toBe(true);
  });
  it('zasoby całego konta — odmowa; lista usług i rzeczy osoby — tak', () => {
    expect(wZakresie('GET', '/services', {}, Z)).toBe(true);
    expect(wZakresie('POST', '/services', {}, Z)).toBe(false);
    expect(wZakresie('GET', '/billing/wallet', {}, Z)).toBe(false);
    expect(wZakresie('GET', '/domains', {}, Z)).toBe(false);
    expect(wZakresie('GET', '/users/me/api-tokens', {}, Z)).toBe(false);
    expect(wZakresie('GET', '/users/me', {}, Z)).toBe(true);
    expect(wZakresie('POST', '/tickets', {}, Z)).toBe(true);
    expect(wZakresie('POST', '/auth/switch-account', {}, Z)).toBe(true);
  });
});

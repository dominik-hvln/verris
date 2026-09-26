import { rblListed } from './rbl.js';

describe('rblListed — odpowiedź DNSBL', () => {
  it('127.0.0.x to wpis na liście', () => {
    expect(rblListed(['127.0.0.2'])).toBe(true);
    expect(rblListed(['127.0.0.4', '127.0.0.10'])).toBe(true);
  });
  it('kody błędu Spamhaus (127.255.255.x) i brak odpowiedzi to NIE wpis', () => {
    expect(rblListed(['127.255.255.254'])).toBe(false);
    expect(rblListed(['127.255.255.255'])).toBe(false);
    expect(rblListed([])).toBe(false);
  });
});

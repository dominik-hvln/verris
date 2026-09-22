import { isExpiringSoon } from './domain-expiry';

describe('isExpiringSoon', () => {
  const now = Date.parse('2026-09-22T12:00:00Z');
  it('domena kończąca się za 10 dni wymaga uwagi', () => {
    expect(isExpiringSoon('2026-10-02T00:00:00Z', now)).toBe(true);
  });
  it('domena kończąca się za pół roku — nie', () => {
    expect(isExpiringSoon('2027-03-22T00:00:00Z', now)).toBe(false);
  });
  it('domena po terminie liczy się jako do odnowienia', () => {
    expect(isExpiringSoon('2026-09-01T00:00:00Z', now)).toBe(true);
  });
  it('brak daty (domena przy hostingu) nie alarmuje', () => {
    expect(isExpiringSoon(null, now)).toBe(false);
    expect(isExpiringSoon(undefined, now)).toBe(false);
  });
});

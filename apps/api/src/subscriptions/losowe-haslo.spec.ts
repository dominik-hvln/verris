import { losoweHaslo } from './losowe-haslo.js';

describe('F2.2 — losoweHaslo (reset hasła przez operatora)', () => {
  it('24 znaki alfanumeryczne z małą, wielką literą i cyfrą; za każdym razem inne', () => {
    const hasla = Array.from({ length: 200 }, () => losoweHaslo());
    for (const h of hasla) {
      expect(h).toMatch(/^[A-Za-z0-9]{24}$/);
      expect(h).toMatch(/[a-z]/);
      expect(h).toMatch(/[A-Z]/);
      expect(h).toMatch(/[0-9]/);
    }
    expect(new Set(hasla).size).toBe(hasla.length);
  });
});

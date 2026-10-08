import { describe, expect, it } from 'vitest';
import { godzinyDoWciazPracujemy } from './opieka-zgloszen.service.js';

// Decyzja właściciela 2026-10-08: „Wciąż nad tym pracujemy” po połowie czasu odpowiedzi, ale nie wcześniej niż po 2 h.
// Wcześniej URGENT (1 h) dostawał tę wiadomość po 30 min — przed terminem obiecanym w poprzednim mailu.
describe('godzinyDoWciazPracujemy', () => {
  it.each([
    ['URGENT', 2],
    ['HIGH', 2],
    ['NORMAL', 6],
    ['LOW', 12],
  ])('%s → %d h', (priorytet, godziny) => {
    expect(godzinyDoWciazPracujemy(priorytet)).toBe(godziny);
  });
});

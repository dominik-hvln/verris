import { PASSWORD_MIN_LENGTH, checkPassword, generatePassword } from './password-policy';

/**
 * X-05 — kliencka kopia polityki haseł (SEC-5).
 *
 * CO PILNUJE. Ten moduł nie jest autorytatywny (waliduje API), ale decyduje,
 * czy przycisk „Zapisz" jest aktywny i co mówi pasek siły. Jeśli rozjedzie się
 * z serwerem w stronę łagodniejszą — klient dostanie błąd dopiero po wysłaniu;
 * w stronę surowszą — nie przejdzie z hasłem, które API by przyjęło.
 * Najważniejsze: przycisk „Wygeneruj hasło" MUSI zawsze dawać hasło ważne —
 * inaczej generator produkuje hasła, których nie da się zapisać.
 */

describe('X-05 checkPassword', () => {
  it('za krótkie hasło jest nieważne nawet z czterema klasami znaków', () => {
    const r = checkPassword('Ab1!Ab1!');
    expect(r.lengthOk).toBe(false);
    expect(r.valid).toBe(false);
  });

  it('wymaga co najmniej trzech klas znaków', () => {
    expect(checkPassword('abcdefghijkl').valid).toBe(false);
    expect(checkPassword('abcdefghij12').valid).toBe(false);
    expect(checkPassword('Abcdefghij12').valid).toBe(true);
  });

  it('popularne hasło jest odrzucane bez względu na wielkość liter, a siła spada do 1', () => {
    const r = checkPassword('Password123');
    expect(r.notCommon).toBe(false);
    expect(r.valid).toBe(false);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('pusty string nie jest „nie-popularny" i ma siłę 0', () => {
    const r = checkPassword('');
    expect(r).toMatchObject({ notCommon: false, valid: false, score: 0 });
  });

  it('siła rośnie z długością i klasami, max 4', () => {
    expect(checkPassword('Abcdefghij12').score).toBe(2);
    expect(checkPassword('Abcdefghijklm12!').score).toBe(4);
  });
});

describe('X-05 generatePassword', () => {
  it('każde wygenerowane hasło spełnia politykę i ma 4 klasy znaków', () => {
    for (let i = 0; i < 300; i++) {
      const pw = generatePassword();
      expect(pw).toHaveLength(16);
      const r = checkPassword(pw);
      expect(r.valid).toBe(true);
      expect(/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /\d/.test(pw) && /[^a-zA-Z0-9]/.test(pw)).toBe(true);
    }
  });

  it('prośba o krótsze hasło niż minimum daje co najmniej minimum + 2', () => {
    expect(generatePassword(4).length).toBe(PASSWORD_MIN_LENGTH + 2);
    expect(checkPassword(generatePassword(4)).valid).toBe(true);
  });
});

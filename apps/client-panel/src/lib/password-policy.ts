/**
 * SEC-5 — lustrzane (klienckie) sprawdzenie polityki haseł Verris.
 * Zgodne z serwerowym `password-policy.validator.ts`. Służy WYŁĄCZNIE do UX
 * (natychmiastowa podpowiedź) — autorytatywna walidacja jest po stronie API.
 */
export const PASSWORD_MIN_LENGTH = 10;

const COMMON = new Set([
  'password', 'password1', 'password123', 'passw0rd', 'qwerty', 'qwerty123',
  'qwertyuiop', '123456', '1234567', '12345678', '123456789', '1234567890',
  'iloveyou', 'admin', 'admin123', 'administrator', 'letmein', 'welcome',
  'welcome1', 'zaq12wsx', 'zaq1@wsx', 'haslo123', 'haslo1234', 'monkey',
  'dragon', 'football', 'abc123', 'changeme',
]);

export type PasswordCheck = {
  lengthOk: boolean;
  classesOk: boolean;
  notCommon: boolean;
  /** 0–4 — przybliżona siła do paska postępu. */
  score: number;
  valid: boolean;
};

function classes(pw: string): number {
  let c = 0;
  if (/[a-z]/.test(pw)) c++;
  if (/[A-Z]/.test(pw)) c++;
  if (/[0-9]/.test(pw)) c++;
  if (/[^a-zA-Z0-9]/.test(pw)) c++;
  return c;
}

/**
 * Generuje losowe, mocne hasło spełniające politykę (≥ długość, 4 klasy znaków,
 * nie-popularne). Używa crypto.getRandomValues. Domyślnie 16 znaków.
 */
export function generatePassword(len = 16): string {
  const lower = 'abcdefghijkmnpqrstuvwxyz';
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const digits = '23456789';
  const symbols = '!@#$%^&*?-_=+';
  const all = lower + upper + digits + symbols;
  const length = Math.max(len, PASSWORD_MIN_LENGTH + 2);
  const pick = (set: string, n: number) => {
    const arr = new Uint32Array(n);
    crypto.getRandomValues(arr);
    return Array.from(arr, (x) => set[x % set.length]).join('');
  };
  // Gwarantuj po jednym znaku z każdej klasy, resztę losowo.
  const chars = pick(lower, 1) + pick(upper, 1) + pick(digits, 1) + pick(symbols, 1) + pick(all, length - 4);
  // Przetasuj (Fisher–Yates na bazie crypto).
  const arr = chars.split('');
  const rnd = new Uint32Array(arr.length);
  crypto.getRandomValues(rnd);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

export function checkPassword(pw: string): PasswordCheck {
  const lengthOk = pw.length >= PASSWORD_MIN_LENGTH;
  const cls = classes(pw);
  const classesOk = cls >= 3;
  const notCommon = pw.length > 0 && !COMMON.has(pw.toLowerCase());
  let score = 0;
  if (pw.length >= PASSWORD_MIN_LENGTH) score++;
  if (pw.length >= 14) score++;
  if (cls >= 3) score++;
  if (cls >= 4) score++;
  if (!notCommon) score = Math.min(score, 1);
  return {
    lengthOk,
    classesOk,
    notCommon,
    score: Math.min(score, 4),
    valid: lengthOk && classesOk && notCommon,
  };
}

import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * SEC-5 — polityka haseł kont Verris.
 *
 * Wymagania (świadomie umiarkowane, by nie frustrować, ale wyraźnie mocniejsze
 * niż samo „min. 8 znaków"):
 *  - długość ≥ 10 znaków,
 *  - przynajmniej 3 z 4 klas znaków: mała litera, wielka litera, cyfra, symbol,
 *  - hasło nie może być na liście najczęstszych/wyciekłych haseł,
 *  - hasło nie może być trywialną sekwencją (np. samych cyfr po kolei).
 *
 * Zwraca `null` gdy OK, albo komunikat błędu (po polsku) gdy hasło za słabe.
 * Funkcja jest czysta — używamy jej także poza class-validatorem (np. reset).
 */
const MIN_LENGTH = 10;
const MAX_LENGTH = 72; // limit bcrypt (bajty); zgodne z istniejącym MaxLength

/** Najczęstsze hasła / oczywiste wzorce — odrzucamy wprost. */
const COMMON_PASSWORDS = new Set([
  'password',
  'password1',
  'password123',
  'passw0rd',
  'qwerty',
  'qwerty123',
  'qwertyuiop',
  '123456',
  '1234567',
  '12345678',
  '123456789',
  '1234567890',
  'iloveyou',
  'admin',
  'admin123',
  'administrator',
  'letmein',
  'welcome',
  'welcome1',
  'zaq12wsx',
  'zaq1@wsx',
  'haslo123',
  'haslo1234',
  'dupa.8',
  'misiek123',
  'monkey',
  'dragon',
  'football',
  'abc123',
  'changeme',
]);

function charClasses(pw: string): number {
  let classes = 0;
  if (/[a-z]/.test(pw)) classes++;
  if (/[A-Z]/.test(pw)) classes++;
  if (/[0-9]/.test(pw)) classes++;
  if (/[^a-zA-Z0-9]/.test(pw)) classes++;
  return classes;
}

/** Wykrywa hasła złożone wyłącznie z jednego powtarzanego znaku lub prostej sekwencji. */
function isTrivialSequence(pw: string): boolean {
  if (/^(.)\1+$/.test(pw)) return true; // aaaaaaaaaa
  const lower = pw.toLowerCase();
  const seqs = '0123456789abcdefghijklmnopqrstuvwxyz';
  if (seqs.includes(lower) && lower.length >= MIN_LENGTH) return true;
  return false;
}

export function validatePasswordPolicy(pw: unknown): string | null {
  if (typeof pw !== 'string') return 'Hasło jest wymagane.';
  if (pw.length < MIN_LENGTH) {
    return `Hasło musi mieć co najmniej ${MIN_LENGTH} znaków.`;
  }
  if (pw.length > MAX_LENGTH) {
    return `Hasło może mieć maksymalnie ${MAX_LENGTH} znaków.`;
  }
  if (COMMON_PASSWORDS.has(pw.toLowerCase())) {
    return 'To hasło jest zbyt popularne i łatwe do odgadnięcia. Wybierz inne.';
  }
  if (isTrivialSequence(pw)) {
    return 'Hasło jest zbyt proste (powtórzenia lub sekwencja). Wybierz inne.';
  }
  if (charClasses(pw) < 3) {
    return 'Hasło musi zawierać co najmniej 3 z 4: małą literę, wielką literę, cyfrę i symbol.';
  }
  return null;
}

@ValidatorConstraint({ name: 'strongPassword', async: false })
export class StrongPasswordConstraint implements ValidatorConstraintInterface {
  private message = 'Hasło nie spełnia polityki bezpieczeństwa.';

  validate(value: unknown): boolean {
    const err = validatePasswordPolicy(value);
    if (err) {
      this.message = err;
      return false;
    }
    return true;
  }

  defaultMessage(_args: ValidationArguments): string {
    return this.message;
  }
}

/** Dekorator class-validator wymuszający politykę haseł Verris. */
export function IsStrongPassword(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [],
      validator: StrongPasswordConstraint,
    });
  };
}

import { BadRequestException, type ValidationError } from '@nestjs/common';

/**
 * P5-13 (paczka 109) — błędy walidacji API po polsku i w jednym kształcie:
 * `{ statusCode: 400, code: 'VALIDATION_ERROR', message: '<zdania>', pola: [{ pole, komunikat }] }`.
 * Wcześniej integrator dostawał surowe „email must be an email, password should not be empty” sklejone przecinkami
 * z polskimi komunikatami własnymi. Komunikaty własne DTO (już po polsku) zostają bez zmian; zamieniamy tylko
 * domyślne komunikaty class-validator (zaczynają się od nazwy pola albo „each value in …”).
 */
export const KOD_WALIDACJI = 'VALIDATION_ERROR';

const liczba = (m: string) => m.match(/(-?\d+(?:\.\d+)?)/)?.[1] ?? '';

const SZABLONY: Record<string, (pole: string, oryginal: string) => string> = {
  whitelistValidation: (p) => `Nieznane pole „${p}” — usuń je z żądania.`,
  isDefined: (p) => `Pole „${p}” jest wymagane.`,
  isNotEmpty: (p) => `Pole „${p}” jest wymagane.`,
  isString: (p) => `Pole „${p}” musi być tekstem.`,
  isEmail: (p) => `Pole „${p}”: niepoprawny adres e-mail.`,
  isBoolean: (p) => `Pole „${p}” musi mieć wartość true albo false.`,
  isInt: (p) => `Pole „${p}” musi być liczbą całkowitą.`,
  isNumber: (p) => `Pole „${p}” musi być liczbą.`,
  isPositive: (p) => `Pole „${p}” musi być większe od zera.`,
  min: (p, m) => `Pole „${p}” nie może być mniejsze niż ${liczba(m)}.`,
  max: (p, m) => `Pole „${p}” nie może być większe niż ${liczba(m)}.`,
  minLength: (p, m) => `Pole „${p}” musi mieć co najmniej ${liczba(m)} znaków.`,
  maxLength: (p, m) => `Pole „${p}” może mieć najwyżej ${liczba(m)} znaków.`,
  isLength: (p) => `Pole „${p}” ma niedozwoloną długość.`,
  isIn: (p) => `Pole „${p}” ma niedozwoloną wartość.`,
  isEnum: (p) => `Pole „${p}” ma niedozwoloną wartość.`,
  isUuid: (p) => `Pole „${p}” musi być identyfikatorem (UUID).`,
  isUrl: (p) => `Pole „${p}” musi być adresem URL.`,
  isFqdn: (p) => `Pole „${p}” musi być nazwą domeny.`,
  isIp: (p) => `Pole „${p}” musi być adresem IP.`,
  isDateString: (p) => `Pole „${p}” musi być datą (ISO 8601).`,
  isISO8601: (p) => `Pole „${p}” musi być datą (ISO 8601).`,
  isDate: (p) => `Pole „${p}” musi być datą.`,
  isArray: (p) => `Pole „${p}” musi być listą.`,
  arrayMinSize: (p, m) => `Lista „${p}” musi mieć co najmniej ${liczba(m)} elementów.`,
  arrayMaxSize: (p, m) => `Lista „${p}” może mieć najwyżej ${liczba(m)} elementów.`,
  arrayUnique: (p) => `Lista „${p}” nie może mieć powtórzeń.`,
  isObject: (p) => `Pole „${p}” musi być obiektem.`,
  matches: (p) => `Pole „${p}” ma niepoprawny format.`,
  equals: (p) => `Pole „${p}” ma niedozwoloną wartość.`,
};

/** Domyślny (angielski) komunikat class-validator — do zamiany. Własne komunikaty DTO zostają. */
function domyslny(komunikat: string, wlasciwosc: string): boolean {
  return komunikat.startsWith(`${wlasciwosc} `) || komunikat.startsWith('each value in ') || komunikat.startsWith('property ') || komunikat.startsWith('nested property ');
}

export function bledyPol(bledy: ValidationError[], prefiks = ''): { pole: string; komunikat: string }[] {
  const wynik: { pole: string; komunikat: string }[] = [];
  for (const b of bledy) {
    const pole = prefiks ? `${prefiks}.${b.property}` : b.property;
    for (const [klucz, komunikat] of Object.entries(b.constraints ?? {})) {
      const zamien = domyslny(komunikat, b.property);
      const szablon = SZABLONY[klucz];
      wynik.push({ pole, komunikat: zamien ? (szablon ? szablon(pole, komunikat) : `Pole „${pole}” ma niepoprawną wartość.`) : komunikat });
    }
    if (b.children?.length) wynik.push(...bledyPol(b.children, pole));
  }
  return wynik;
}

/** `exceptionFactory` globalnego ValidationPipe. */
export function walidacjaPoPolsku(bledy: ValidationError[]): BadRequestException {
  const pola = bledyPol(bledy);
  const zdania = pola.map((p) => (/[.!?]$/.test(p.komunikat) ? p.komunikat : `${p.komunikat}.`));
  return new BadRequestException({
    statusCode: 400,
    code: KOD_WALIDACJI,
    message: zdania.join(' ') || 'Niepoprawne dane w żądaniu.',
    pola,
  });
}

import { BadRequestException, HttpException, NotFoundException, ValidationPipe } from '@nestjs/common';
import { IsEmail, IsInt, IsNotEmpty, IsString, Matches, Min } from 'class-validator';
import { walidacjaPoPolsku } from './walidacja-pl.js';
import { AllExceptionsFilter } from './filters/all-exceptions.filter.js';
import { komunikatLimitu } from './guards/rate-limit.guard.js';

/**
 * P5-13 (paczka 109) — błędy API po polsku i w jednym kształcie (message: string, code, pola).
 * Na starym kodzie: „email must be an email, password should not be empty”, „Unexpected end of JSON input”,
 * „Cannot GET /api/v1/nieistnieje”; brak `code` i listy pól.
 */
class LogowanieDto {
  @IsEmail() email!: string;
  @IsString() @IsNotEmpty() password!: string;
}
class TokenDto {
  @IsInt() @Min(1) expiresInDays!: number;
  @Matches(/^[a-z]+$/, { message: 'Nazwa: tylko małe litery.' }) nazwa!: string;
}

const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true, exceptionFactory: walidacjaPoPolsku });
const waliduj = (dto: unknown, metatype: new () => unknown) =>
  pipe.transform(dto, { type: 'body', metatype }).then(
    () => null,
    (e: BadRequestException) => e.getResponse() as { code: string; message: string; pola: { pole: string; komunikat: string }[] },
  );

describe('walidacjaPoPolsku', () => {
  it('domyślne komunikaty class-validator → po polsku, message jako jeden napis, kod i lista pól', async () => {
    const r = (await waliduj({}, LogowanieDto))!;
    expect(r.code).toBe('VALIDATION_ERROR');
    expect(typeof r.message).toBe('string');
    expect(r.message).toContain('Pole „email”: niepoprawny adres e-mail.');
    expect(r.message).toContain('Pole „password” jest wymagane.');
    expect(r.message).not.toMatch(/must be|should not/);
    expect(r.pola.map((p) => p.pole)).toEqual(expect.arrayContaining(['email', 'password']));
  });

  it('liczby z ograniczeń i własne komunikaty DTO zostają; nieznane pole po polsku', async () => {
    const r = (await waliduj({ expiresInDays: -5, nazwa: 'ABC', obce: 1 }, TokenDto))!;
    expect(r.message).toContain('Pole „expiresInDays” nie może być mniejsze niż 1.');
    expect(r.message).toContain('Nazwa: tylko małe litery.');
    expect(r.message).toContain('Nieznane pole „obce”');
  });
});

describe('AllExceptionsFilter — P5-13 / P5-03', () => {
  function obsluz(e: unknown, url = '/api/v1/x', method = 'POST') {
    const json = vi.fn();
    const setHeader = vi.fn();
    const status = vi.fn(() => ({ json }));
    const host = { switchToHttp: () => ({ getResponse: () => ({ status, setHeader }), getRequest: () => ({ method, url }) }) };
    new AllExceptionsFilter().catch(e, host as never);
    return { kod: (status.mock.calls[0] as unknown[])[0], tresc: (json.mock.calls[0] as unknown[])[0] as Record<string, unknown>, setHeader };
  }

  it('uszkodzony JSON → 400 INVALID_JSON z polskim komunikatem', () => {
    const blad = Object.assign(new SyntaxError('Unexpected end of JSON input'), { type: 'entity.parse.failed', status: 400 });
    expect(obsluz(blad)).toMatchObject({ kod: 400, tresc: { code: 'INVALID_JSON', message: expect.stringMatching(/^Treść żądania nie jest poprawnym JSON-em/) } });
    expect(obsluz(new BadRequestException('Unexpected end of JSON input', { cause: blad })).tresc).toMatchObject({ code: 'INVALID_JSON' });
  });

  it('nieznana ścieżka → 404 NOT_FOUND po polsku', () => {
    const r = obsluz(new NotFoundException('Cannot GET /api/v1/nieistnieje'), '/api/v1/nieistnieje?x=1', 'GET');
    expect(r).toMatchObject({ kod: 404, tresc: { code: 'NOT_FOUND', message: 'Nie ma takiej ścieżki API: GET /api/v1/nieistnieje.' } });
    expect(obsluz(new NotFoundException('Nie ma takiego zgłoszenia.')).tresc).toMatchObject({ message: 'Nie ma takiego zgłoszenia.' });
  });

  it('błąd walidacji: lista pól przechodzi do odpowiedzi', async () => {
    const e = walidacjaPoPolsku([{ property: 'email', constraints: { isEmail: 'email must be an email' }, children: [] }]);
    expect(obsluz(e).tresc).toMatchObject({ code: 'VALIDATION_ERROR', pola: [{ pole: 'email', komunikat: 'Pole „email”: niepoprawny adres e-mail.' }] });
  });

  it('429 z limitu: nagłówek Retry-After', () => {
    const e = new HttpException({ statusCode: 429, message: komunikatLimitu(3120), retryAfterSeconds: 3120 }, 429);
    const r = obsluz(e);
    expect(r.setHeader).toHaveBeenCalledWith('Retry-After', '3120');
    expect(r.tresc.message).toContain('za 52 minuty');
  });
});

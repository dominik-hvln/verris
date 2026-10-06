import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { HOSTING_FETCH_UNAVAILABLE, daErrorMessage, hostingFetchErrorMessage } from './client-hosting-messages';

/**
 * X-05 — tłumaczenie surowych błędów API / DirectAdmin na komunikaty dla klienta.
 *
 * CO PILNUJE. Dwie rzeczy naraz:
 *  - klient nigdy nie dostaje PUSTEGO komunikatu (toast bez treści wygląda jak
 *    sukces) ani technicznego śmiecia (`CMD_API_…`, stack trace, axios),
 *  - czytelne walidacje („must be…", „nieprawidłowy…") przechodzą w oryginale,
 *    bo generyk „operacja nie powiodła się" nie mówi, co poprawić.
 */

describe('X-05 daErrorMessage', () => {
  it('pusty / brak błędu → generyczny komunikat, nigdy pusty string', () => {
    for (const raw of [null, undefined, '', '   ']) {
      const msg = daErrorMessage(raw);
      expect(msg.length).toBeGreaterThan(0);
      expect(msg).toMatch(/nie powiodła się/);
    }
  });

  it('znane wzorce DirectAdmin mapuje na polskie komunikaty', () => {
    expect(daErrorMessage('Database already exists')).toBe('Taki element już istnieje.');
    expect(daErrorMessage('Quota exceeded for user')).toMatch(/Przekroczono limit/);
    expect(daErrorMessage('Limit exceeded: max 5 databases')).toMatch(/Przekroczono limit/);
    expect(daErrorMessage('Request exceeds the limit of this package')).toMatch(/Przekroczono limit/);
    // „timeout exceeded” to nie limit planu — nie może udawać przekroczenia limitu.
    expect(daErrorMessage('timeout of 15000ms exceeded')).not.toMatch(/Przekroczono limit/);
    expect(daErrorMessage('connect ECONNREFUSED 10.0.0.5:2222')).toMatch(/chwilowo niedostępny/);
    expect(daErrorMessage('Request failed with status code 502')).toMatch(/chwilowo niedostępny/);
    expect(daErrorMessage('Cannot delete: domain is in use')).toMatch(/Nie można usunąć/);
  });

  it('walidacje przechodzą w oryginale, obcięte do 200 znaków', () => {
    expect(daErrorMessage('Nazwa bazy musi mieć co najmniej 3 znaki')).toBe('Nazwa bazy musi mieć co najmniej 3 znaki');
    const long = `Invalid value: ${'x'.repeat(400)}`;
    expect(daErrorMessage(long)).toHaveLength(200);
  });

  it('techniczne i długie komunikaty są chowane za generykiem', () => {
    expect(daErrorMessage('CMD_API_SHOW_ALL_USERS returned error=1')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('TypeError: x is undefined at Object.run (/app/a.js:1)')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('z'.repeat(141))).toMatch(/nie powiodła się/);
  });

  it('white label: oryginał z nazwą panelu serwera nie przechodzi, polskie „nie da się” tak (CL-02)', () => {
    expect(daErrorMessage('Invalid DirectAdmin login key')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('Konto DA nie istnieje')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('CustomBuild: brak wersji PHP')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('Tej bazy nie da się usunąć')).toBe('Tej bazy nie da się usunąć');
  });

  it('komunikat już przetłumaczony przechodzi drugi raz bez zmian (apiFetch + widok)', () => {
    for (const raw of ['Database already exists', 'Quota exceeded', 'weak password', 'socket hang up', 'x']) {
      const raz = daErrorMessage(raw);
      expect(daErrorMessage(raz)).toBe(raz);
    }
  });

  it('krótki, czytelny komunikat bez dopasowania przechodzi bez zmian', () => {
    expect(daErrorMessage('Usługa jest zawieszona')).toBe('Usługa jest zawieszona');
  });
});

describe('X-05 hostingFetchErrorMessage — baner „nie udało się pobrać"', () => {
  it('brak błędu → brak banera', () => {
    expect(hostingFetchErrorMessage(null)).toBeNull();
    expect(hostingFetchErrorMessage('')).toBeNull();
  });

  it('błąd techniczny → komunikat o chwilowej niedostępności, nie o nieudanej operacji', () => {
    expect(hostingFetchErrorMessage('CMD_API failure')).toBe(HOSTING_FETCH_UNAVAILABLE);
  });

  it('błąd rozpoznany → konkretny komunikat', () => {
    expect(hostingFetchErrorMessage('socket hang up')).toMatch(/chwilowo niedostępny/);
  });
});

describe('daErrorMessage — hasło', () => {
  it('odrzucone hasło → komunikat o wymaganiach; inna wzmianka o haśle → nie', () => {
    expect(daErrorMessage('Password is too short')).toMatch(/Hasło nie spełnia/);
    expect(daErrorMessage('Hasło musi mieć co najmniej 8 znaków')).toMatch(/Hasło nie spełnia/);
    expect(daErrorMessage('Konto hostingowe nie jest jeszcze w pełni gotowe (brak danych dostępowych do serwera).')).not.toMatch(/Hasło nie spełnia/);
    expect(daErrorMessage('login key password not stored')).not.toMatch(/Hasło nie spełnia/);
    // t1 02.10: brak pola w zapytaniu do serwera to nie słabe hasło — klient widział „Użyj silniejszego hasła”
    expect(daErrorMessage('Błąd przy wykonywaniu żądania: Użytkownik, hasło, hasło i typ są wymagane')).not.toMatch(/Hasło nie spełnia/);
  });
});

describe('daErrorMessage — white label (wspólne z API, libs/contracts)', () => {
  it('czytelna walidacja nie przechodzi w oryginale, gdy zdradza panel serwera, adres węzła albo URL', () => {
    expect(daErrorMessage('Invalid response from DirectAdmin')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('Nieprawidłowy host 10.0.0.5')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('Nieprawidłowy token z https://wezel.example.net/login')).toMatch(/nie powiodła się/);
    expect(daErrorMessage('Invalid PHP version (CloudLinux selector)')).toMatch(/nie powiodła się/);
  });

  it('polskie „da się” nie jest brane za DA', () => {
    expect(daErrorMessage('Tego nie da się cofnąć')).toBe('Tego nie da się cofnąć');
  });

  it('błąd sieci bez „hostingowy” — tę samą funkcję woła rejestrator domen', () => {
    expect(daErrorMessage('connect ETIMEDOUT')).toBe('Serwer jest chwilowo niedostępny. Spróbuj ponownie za chwilę.');
  });
});

it('komponenty panelu nie pokazują surowego fetchError — tylko przez hostingFetchErrorMessage', () => {
  const trafienia: string[] = [];
  const przejdz = (dir: string) => {
    for (const n of readdirSync(dir)) {
      const p = join(dir, n);
      if (statSync(p).isDirectory()) przejdz(p);
      else if (n.endsWith('.tsx') && !n.includes('.spec.') && /\{(?:[\w?]+\.)?fetchError\}/.test(readFileSync(p, 'utf8'))) {
        trafienia.push(p.split('/src/')[1]!);
      }
    }
  };
  przejdz(join(__dirname, '..'));
  expect(trafienia).toEqual([]);
});

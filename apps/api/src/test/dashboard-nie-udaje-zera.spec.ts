import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Dashboard nie udaje zera, gdy nie wie.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-39, wprost z awarii X-37. Kiedy panel klienta nie mógł dosięgnąć API,
 * użytkownik zobaczył:
 *
 *     Saldo portfela   0,00 K
 *     Punkty EKO       0
 *
 * Oba te zera były nieprawdą. Zapytania padły, a `.catch(() => null)`
 * i `.catch(() => [])` zamieniły awarię w wartość domyślną — podaną z taką
 * samą pewnością jak dane prawdziwe. Klient patrzył na saldo swojego portfela
 * i widział zero, bo API nie odpowiadało.
 *
 * To jest gorszy defekt niż sama awaria. Awaria mija; fałszywa informacja
 * o cudzych pieniądzach zostaje w głowie i podważa zaufanie do wszystkiego
 * innego, co panel pokazuje. Baner „część danych jest chwilowo niedostępna"
 * wymieniał wtedy tylko dwie pozycje z siedmiu — pozostałe pięć awarii nie
 * miało jak się pokazać.
 *
 * CO STRAŻNIK PILNUJE
 * ───────────────────
 * 1. W warstwie danych nie ma `catch`, który wyrzuca błąd do kosza.
 * 2. Każde zapytanie snapshotu ma swój klucz w `errors` — nie ma zapytania,
 *    którego porażka nie ma gdzie wylądować.
 * 3. Każdy klucz `errors` jest CZYTANY przez widok. Zebrany i niepokazany
 *    błąd jest tym samym co połknięty, tylko droższy.
 */

const PANEL = join(
  __dirname, '..', '..', '..', 'client-panel', 'src', 'app', 'dashboard',
);
const DANE = readFileSync(join(PANEL, 'dashboard-data.ts'), 'utf8');
const WIDOK = readFileSync(join(PANEL, 'dashboard-home.tsx'), 'utf8');

/** `.catch(() => cokolwiek)` — czyli „nie interesuje mnie, co poszło nie tak". */
const POLKNIETY_BLAD = /\.catch\(\s*\(\s*\)\s*=>/;

function kluczeBledow(zrodlo: string): string[] {
  const blok = zrodlo.match(/errors:\s*\{([\s\S]*?)\n  \};/);
  if (!blok) return [];
  return [...blok[1].matchAll(/(\w+)\?:/g)].map((m) => m[1]);
}

describe('dashboard nie udaje zera', () => {
  const klucze = kluczeBledow(DANE);

  it('warstwa danych nie połyka błędów', () => {
    // Komentarze pomijamy CELOWO. Dokumentacja defektu cytuje wzorzec, którego
    // ten strażnik zabrania — bez tego filtra plik opisujący naprawę byłby
    // sam dla siebie naruszeniem. (Ta sama pułapka co przy `noDataState`
    // w X-35: grep po całym pliku liczy prozę razem z kodem.)
    const trafienia = DANE.split('\n')
      .map((linia, i) => ({ linia: linia.trim(), nr: i + 1 }))
      .filter((w) => !/^(\*|\/\/|\/\*)/.test(w.linia))
      .filter((w) => POLKNIETY_BLAD.test(w.linia));
    expect(trafienia).toEqual([]);
  });

  it('strażnik faktycznie łapie kod sprzed X-39', () => {
    expect(POLKNIETY_BLAD.test('fetchUserProfile().catch(() => null),')).toBe(true);
    expect(POLKNIETY_BLAD.test("apiFetch('/x').catch(() => [] as Row[]),")).toBe(true);
    // Obsłużony błąd ma prawo zostać — chodzi o wyrzucanie go, nie o `catch`.
    expect(POLKNIETY_BLAD.test('} catch (err) {')).toBe(false);
    expect(POLKNIETY_BLAD.test('.catch((err) => opisz(err))')).toBe(false);
  });

  it('snapshot deklaruje klucz błędu dla każdego swojego zapytania', () => {
    expect(klucze.length).toBeGreaterThanOrEqual(7);

    const wPromiseAll = DANE.match(/await Promise\.all\(\[([\s\S]*?)\]\);/);
    expect(wPromiseAll).not.toBeNull();
    const zapytania = (wPromiseAll![1].match(/^\s{6}\w[\w<>.]*\(/gm) ?? []).length;

    expect({ zapytania, kluczy: klucze.length }).toEqual({
      zapytania: klucze.length,
      kluczy: klucze.length,
    });
  });

  it('każdy klucz dostaje wartość, gdy zapytanie padnie', () => {
    const bezPrzypisania = klucze.filter(
      (k) => !new RegExp(`errors\\.${k}\\s*=`).test(DANE),
    );
    expect(bezPrzypisania).toEqual([]);
  });

  it('każdy zebrany błąd jest czytany przez widok', () => {
    const niewidoczne = klucze.filter(
      (k) => !new RegExp(`snapshot\\.errors\\.${k}\\b`).test(WIDOK),
    );
    expect(niewidoczne).toEqual([]);
  });

  it('saldo portfela nie pokazuje liczby, gdy profil nie wrócił', () => {
    // Ta jedna asercja jest wymieniona z nazwy, bo to był konkretny objaw:
    // klient widział „0,00 K" w chwili, gdy API milczało.
    const kafelek = WIDOK.match(/label="Saldo portfela"[\s\S]{0,400}?\/>/);
    expect(kafelek).not.toBeNull();
    expect(kafelek![0]).toMatch(/snapshot\.errors\.profile/);
    expect(kafelek![0]).toMatch(/'—'/);
  });

  it('liczba otwartych zgłoszeń też nie udaje zera', () => {
    const kafelek = WIDOK.match(/label="Otwarte zgłoszenia"[\s\S]{0,400}?\/>/);
    expect(kafelek).not.toBeNull();
    expect(kafelek![0]).toMatch(/snapshot\.errors\.tickets/);
  });
});

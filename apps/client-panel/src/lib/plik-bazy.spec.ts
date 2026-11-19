import { bladPlikuBazy, MAX_PLIKU_BAZY } from './plik-bazy';

describe('bladPlikuBazy – paczka 129 (wgranie pliku do importu z zakładki baz)', () => {
  it.each(['sklep.sql', 'kopia-2026_11.sql.gz', 'A1.sql'])('%s → można wysłać', (name) => {
    expect(bladPlikuBazy({ name, size: 1024 })).toBeNull();
  });

  it.each([
    ['strona.php', '.sql albo .sql.gz'],
    ['zrzut.sql.zip', '.sql albo .sql.gz'],
    ['zażółć.sql', 'Nazwa pliku'],
    ['moja baza.sql', 'Nazwa pliku'],
    ['.ukryty.sql', 'Nazwa pliku'],
    ['Sklep.SQL', 'Nazwa pliku'],
  ])('%s → odmowa (%s)', (name, fragment) => {
    expect(bladPlikuBazy({ name, size: 10 })).toContain(fragment);
  });

  it('pusty i ponad 25 MB → odmowa z podpowiedzią FTP', () => {
    expect(bladPlikuBazy({ name: 'a.sql', size: 0 })).toBe('Plik jest pusty.');
    expect(bladPlikuBazy({ name: 'a.sql', size: MAX_PLIKU_BAZY + 1 })).toContain('FTP');
    expect(bladPlikuBazy({ name: 'a.sql', size: MAX_PLIKU_BAZY })).toBeNull();
  });
});

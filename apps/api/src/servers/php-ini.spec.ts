import { odczytajUserIni, sprawdzUstawieniaPhp } from './php-ini';

const Z = { begin: '; BEGIN VERRIS PHP', end: '; END VERRIS PHP' };

describe('B-05 — ustawienia PHP (.user.ini)', () => {
  it('poprawne wartości: normalizacja jednostki i On/Off, puste pola pominięte', () => {
    expect(sprawdzUstawieniaPhp({ memory_limit: '512m', display_errors: 'off', max_input_time: '-1', 'date.timezone': 'Europe/Warsaw', upload_max_filesize: '' }))
      .toEqual({ memory_limit: '512M', display_errors: 'Off', max_input_time: '-1', 'date.timezone': 'Europe/Warsaw' });
  });

  it.each([
    [{ auto_prepend_file: '/tmp/x.php' }, 'nie jest dostępna'],
    [{ memory_limit: '9999M' }, 'memory_limit'],
    [{ memory_limit: '256M\nauto_prepend_file=/tmp/x' }, 'memory_limit'],
    [{ max_execution_time: '0' }, 'max_execution_time'],
    [{ 'date.timezone': 'Mars/Olympus' }, 'date.timezone'],
    [{ upload_max_filesize: '256M', post_max_size: '64M' }, 'post_max_size'],
  ])('odrzuca %j', (wejscie, fragment) => {
    expect(() => sprawdzUstawieniaPhp(wejscie)).toThrow(fragment);
  });

  it('odczyt: wartości tylko z bloku panelu; linie klienta poza blokiem liczone jako własne', () => {
    const plik = `${Z.begin}\nmemory_limit = 256M\nauto_prepend_file = /tmp/x\n${Z.end}\n\n; komentarz\nsession.gc_maxlifetime = 1440\n`;
    expect(odczytajUserIni(plik, Z)).toEqual({ values: { memory_limit: '256M' }, wlasneDyrektywy: 1 });
    expect(odczytajUserIni('', Z)).toEqual({ values: {}, wlasneDyrektywy: 0 });
  });
});

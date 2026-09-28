import { bladDa } from './directadmin.service.js';
import { opiszOdpowiedz } from './sonda-da.js';
import { zCronowDa } from './directadmin.service.js';

describe('sonda API DA — kształt bez wartości', () => {
  it('json: nazwy pól i typy, bez wartości', () => {
    const r = opiszOdpowiedz('{"records":[{"name":"www","type":"A","value":"1.2.3.4"}],"error":"0"}');
    expect(r).toEqual({ format: 'json', ksztalt: '{records:[1× {name:string, type:string, value:string}], error:string}' });
    expect(r.ksztalt).not.toContain('1.2.3.4');
  });
  it('urlencoded: same klucze; html; tekst (np. strefa BIND)', () => {
    expect(opiszOdpowiedz('error=0&list0=tajne.pl')).toEqual({ format: 'urlencoded', ksztalt: '2 pól: error, list0' });
    expect(opiszOdpowiedz('<!DOCTYPE html><p>')).toEqual({ format: 'html', ksztalt: '18 B' });
    expect(opiszOdpowiedz('a IN A 1.2.3.4\n').format).toBe('tekst');
    expect(opiszOdpowiedz('')).toEqual({ format: 'tekst', ksztalt: '0 B, 0 linii' });
  });
});

describe('bladDa — powód z details, nie sam ogólnik', () => {
  it('łączy text i details, zdejmuje HTML', () => {
    expect(bladDa('Nie udało się wykonać Twojego żądania', 'DNS problem: NXDOMAIN<br>looking up A for d3.hvln.pl')).toBe(
      'Nie udało się wykonać Twojego żądania: DNS problem: NXDOMAIN looking up A for d3.hvln.pl',
    );
    expect(bladDa('Rate limit', null)).toBe('Rate limit');
    expect(bladDa(undefined, undefined)).toBe('Błąd serwera hostingowego');
  });
});

describe('sonda i cron — formaty z żywego DA (t1, 28.09)', () => {
  it('błąd DA z komunikatem', () => {
    expect(opiszOdpowiedz('{"error":"1","result":"SpamAssassin nie jest włączony"}').ksztalt).toContain('błąd DA: SpamAssassin nie jest włączony');
    expect(opiszOdpowiedz('error=1&text=Brak&details=pakietu').ksztalt).toContain('błąd DA: Brak — pakietu');
  });
  it('CMD_API_CRON_JOBS: id=harmonogram komenda; HTML → błąd', () => {
    const body = new URLSearchParams({ '12': '*/5 * * * * php ~/cron.php --x "a b"', '3': '0 2 * * 0 /bin/true' }).toString();
    expect(zCronowDa(body)).toEqual([
      { id: '3', schedule: '0 2 * * 0', command: '/bin/true' },
      { id: '12', schedule: '*/5 * * * *', command: 'php ~/cron.php --x "a b"' },
    ]);
    expect(zCronowDa('')).toEqual([]);
    expect(() => zCronowDa('<!DOCTYPE html>')).toThrow();
  });
});

import { BadRequestException } from '@nestjs/common';
import { filtryDoDziennika, stronaListy, warunkiListyUslug } from './lista-uslug.js';

/** F2.4 — filtry listy usług (lista i CSV z jednej definicji). */
describe('F2.4 — warunki listy usług', () => {
  it('bez filtrów — bez warunków; stan spoza enumu → 400', () => {
    expect(warunkiListyUslug({})).toEqual({});
    expect(() => warunkiListyUslug({ status: 'NIEZNANY' })).toThrow(BadRequestException);
    expect(warunkiListyUslug({ status: 'PAST_DUE' })).toEqual({ AND: [{ status: 'PAST_DUE' }] });
    // Liczniki zakładek: stan pominięty, reszta filtrów zostaje.
    expect(warunkiListyUslug({ status: 'PAST_DUE', planId: 'p1' }, { bezStatusu: true })).toEqual({ AND: [{ planId: 'p1' }] });
  });

  it('węzeł przez konto, wyszukiwanie po domenie, loginie, e-mailu i skrócie id', () => {
    const w = warunkiListyUslug({ serverId: ' w1 ', search: '#AB12CD34' }) as { AND: object[] };
    expect(w.AND[0]).toEqual({ account: { is: { serverId: 'w1' } } });
    expect(JSON.stringify(w.AND[1])).toContain('"startsWith":"ab12cd34"');
    expect(JSON.stringify(warunkiListyUslug({ search: 'sklep.pl' }))).not.toContain('startsWith');
  });

  it('stronicowanie: domyślnie 50, maks. 200, śmieci → domyślne', () => {
    expect(stronaListy({})).toEqual({ limit: 50, page: 1, skip: 0 });
    expect(stronaListy({ limit: '5000', page: '3' })).toEqual({ limit: 200, page: 3, skip: 400 });
    expect(stronaListy({ limit: '-1', page: 'x' })).toEqual({ limit: 50, page: 1, skip: 0 });
  });

  it('dziennik eksportu: tylko podane filtry, bez strony i limitu', () => {
    expect(filtryDoDziennika({ status: 'ACTIVE', search: ' ', page: '2', limit: '50' })).toEqual({ status: 'ACTIVE' });
  });
});

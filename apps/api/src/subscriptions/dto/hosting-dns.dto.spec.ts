import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EdytujRekordDnsDto, UsunRekordDnsDto, UtworzRekordDnsDto } from './hosting-dns.dto.js';

/**
 * t1, 08.10: panel pokazywał przy rekordzie DS (delegacja DNSSEC w strefie rodzica) przycisk „Usuń”, a API
 * odrzucało typ DS surowym „type must be one of the following values: …”. DS da się teraz usunąć (sieroty
 * po usuniętych domenach); dodać ani edytować — nie (to robi serwer DNS przy DNSSEC). Komunikaty po polsku.
 */
const bledy = (cls: new () => object, body: object) =>
  validateSync(plainToInstance(cls, body)).flatMap((e) => Object.values(e.constraints ?? {}));

describe('DTO rekordu DNS — typ DS', () => {
  const ds = { domain: 'firma.pl', name: 'sklep.firma.pl.', type: 'DS', value: '55243 13 2 ABCD' };
  it('usunięcie DS przechodzi', () => expect(bledy(UsunRekordDnsDto, ds)).toEqual([]));
  it('dodanie DS — odmowa po polsku', () => expect(bledy(UtworzRekordDnsDto, ds)).toEqual(['Nieobsługiwany typ rekordu DNS.']));
  it('edycja na DS — odmowa po polsku', () => {
    const e = validateSync(plainToInstance(EdytujRekordDnsDto, { domain: 'firma.pl', old: { name: 'x', type: 'A', value: '1.2.3.4' }, next: { name: 'x', type: 'DS', value: '1' } }));
    expect(JSON.stringify(e)).toContain('Nieobsługiwany typ rekordu DNS.');
    expect(JSON.stringify(e)).not.toContain('must be one of');
  });
});

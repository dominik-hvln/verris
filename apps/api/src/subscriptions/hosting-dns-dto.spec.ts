import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UtworzRekordDnsDto } from './dto/hosting-dns.dto.js';

/** F-01/F-02 — rekord DNS od klienta, zanim trafi do strefy w DirectAdminie. */
function bledy(body: Record<string, unknown>): string[] {
  const dto = plainToInstance(UtworzRekordDnsDto, { domain: 'przyklad.pl', ...body });
  return validateSync(dto).map((e) => e.property);
}

describe('F-01 — walidacja rekordu DNS', () => {
  it.each([
    [{ name: '@', type: 'A', value: '203.0.113.10' }],
    [{ name: 'www', type: 'CNAME', value: 'przyklad.pl.' }],
    [{ name: '_dmarc', type: 'TXT', value: 'v=DMARC1; p=quarantine' }],
    [{ name: '_sip._tcp', type: 'SRV', value: '10 1 5060 sip.przyklad.pl.', ttl: 3600 }],
    [{ name: '*.dev', type: 'A', value: '203.0.113.11' }],
    [{ name: '@', type: 'CAA', value: '0 issue "letsencrypt.org"' }],
  ])('przepuszcza poprawny rekord %j', (body) => {
    expect(bledy(body)).toEqual([]);
  });

  it('odrzuca typ spoza listy', () => {
    expect(bledy({ name: '@', type: 'PTR', value: 'x.' })).toContain('type');
  });

  it('odrzuca znak nowej linii w wartości (wstrzyknięcie drugiego rekordu do strefy)', () => {
    expect(bledy({ name: '@', type: 'TXT', value: 'ok\nwww A 6.6.6.6' })).toContain('value');
  });

  it('odrzuca nazwę ze spacją lub ukośnikiem', () => {
    expect(bledy({ name: 'a b', type: 'A', value: '1.2.3.4' })).toContain('name');
    expect(bledy({ name: '../x', type: 'A', value: '1.2.3.4' })).toContain('name');
  });

  it('odrzuca TTL poza zakresem', () => {
    expect(bledy({ name: '@', type: 'A', value: '1.2.3.4', ttl: 5 })).toContain('ttl');
    expect(bledy({ name: '@', type: 'A', value: '1.2.3.4', ttl: 999999 })).toContain('ttl');
  });
});

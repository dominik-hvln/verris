import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CatchAllDto, FiltrSpamuDto, NarzedziaWwwDto } from '../subscriptions/dto/hosting-body.dto.js';
import { BanerKbDto } from '../kb/kb.dto.js';
import { tylkoHttps } from '../kb/kb-render.js';
import { CreateTicketDto } from '../tickets/tickets.dto.js';
import { UprawnieniaDto } from '../files/files.dto.js';

/** Te same opcje co globalny ValidationPipe w main.ts. */
const bledy = (klasa: new () => object, v: object): string[] =>
  validateSync(plainToInstance(klasa, v, { enableImplicitConversion: true }), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).map((e) => e.property);

describe('granice DTO na wejściu do API', () => {
  it('catch-all sprawdza adres tylko w trybie „na adres” (panel odsyła go też przy innych)', () => {
    expect(bledy(CatchAllDto, { mode: 'fail', address: '' })).toEqual([]);
    expect(bledy(CatchAllDto, { mode: 'address', address: 'zly' })).toEqual(['address']);
    expect(bledy(CatchAllDto, { mode: 'address', address: 'a@b.pl' })).toEqual([]);
  });

  it('znak nowej linii nie przejdzie do konfiguracji DirectAdmina ani .htaccess', () => {
    expect(bledy(FiltrSpamuDto, { enabled: true, subjectTag: '***SPAM***\nrequired_score 0' })).toEqual(['subjectTag']);
    expect(bledy(NarzedziaWwwDto, { redirects: [{ from: '/a\nRewriteRule', to: '/b', type: '301' }] })).toEqual(['redirects']);
    expect(bledy(NarzedziaWwwDto, { redirects: [{ from: '/a', to: '/b', type: '301' }], blockedIps: ['1.2.3.4'] })).toEqual([]);
  });

  it('tablica zamiast napisu jest odrzucana, a nie przekazywana dalej', () => {
    expect(bledy(UprawnieniaDto, { names: [{}], mode: '644' })).toEqual(['names']);
    expect(bledy(UprawnieniaDto, { names: ['a.txt'], mode: '644; rm' })).toEqual(['mode']);
  });

  it('baner KB przyjmuje tylko linki https, a render i tak neutralizuje resztę', () => {
    expect(bledy(BanerKbDto, { buttonUrl: 'javascript:alert(1)' })).toEqual(['buttonUrl']);
    expect(bledy(BanerKbDto, { buttonUrl: 'https://verris.pl/cennik', obce: 1 })).toEqual(['obce']);
    expect(tylkoHttps('javascript:alert(1)')).toBe('#');
    expect(tylkoHttps(' https://status.verris.pl ')).toBe('https://status.verris.pl');
  });

  it('zgłoszenie z załącznikami (multipart) przechodzi te same reguły co JSON', () => {
    expect(bledy(CreateTicketDto, { subject: 'Temat', message: 'Treść zgłoszenia', priority: 'KOSMICZNY' })).toEqual(['priority']);
    expect(bledy(CreateTicketDto, { subject: 'Temat', message: 'Treść zgłoszenia', topic: 'EMAIL' })).toEqual([]);
  });
});

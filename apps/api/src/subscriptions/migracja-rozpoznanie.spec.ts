import { BadRequestException } from '@nestjs/common';
import { rozpoznajZrodlo, type Resolver } from './migracja-rozpoznanie.js';

/** 14.10 — krok „Skąd” migratora: podpowiedź adresu starego panelu z DNS (bez łączenia się z cudzym hostem). */
function resolver(o: { a?: string[]; mx?: { exchange: string; priority: number }[]; ns?: string[]; ptr?: string[] }): Resolver {
  return {
    resolve4: vi.fn(async () => o.a ?? []),
    resolveMx: vi.fn(async () => o.mx ?? []),
    resolveNs: vi.fn(async () => o.ns ?? []),
    reverse: vi.fn(async () => o.ptr ?? []),
  } as unknown as Resolver;
}

describe('rozpoznajZrodlo', () => {
  it('PTR adresu strony = podpowiedź hosta panelu; MX posortowane po priorytecie', async () => {
    const r = await rozpoznajZrodlo(' Firma.PL ', resolver({
      a: ['198.51.100.10'],
      mx: [{ exchange: 'mx2.stary.pl.', priority: 20 }, { exchange: 'mx1.stary.pl', priority: 10 }],
      ns: ['ns1.stary.pl.', 'ns2.stary.pl'],
      ptr: ['serwer123.stary-hosting.pl.'],
    }));
    expect(r).toEqual({ domena: 'firma.pl', a: ['198.51.100.10'], mx: ['mx1.stary.pl', 'mx2.stary.pl'], ns: ['ns1.stary.pl', 'ns2.stary.pl'], podpowiedzHosta: 'serwer123.stary-hosting.pl', juzUNas: false });
  });

  it('bez PTR: serwer poczty, ale nie poczta w chmurze (tam nie ma panelu hostingu)', async () => {
    expect((await rozpoznajZrodlo('firma.pl', resolver({ a: ['198.51.100.10'], mx: [{ exchange: 'poczta.stary.pl', priority: 5 }] }))).podpowiedzHosta).toBe('poczta.stary.pl');
    expect((await rozpoznajZrodlo('firma.pl', resolver({ a: ['198.51.100.10'], mx: [{ exchange: 'aspmx.l.google.com', priority: 1 }] }))).podpowiedzHosta).toBeNull();
  });

  it('błędy DNS = puste listy, nie wyjątek; śmieci z DNS odfiltrowane', async () => {
    const r: Resolver = { resolve4: async () => { throw new Error('ENOTFOUND'); }, resolveMx: async () => { throw new Error('x'); }, resolveNs: async () => ['ns1.ok.pl', 'zły host$'], reverse: async () => [] } as unknown as Resolver;
    expect(await rozpoznajZrodlo('firma.pl', r)).toEqual({ domena: 'firma.pl', a: [], mx: [], ns: ['ns1.ok.pl'], podpowiedzHosta: null, juzUNas: false });
  });

  it.each([['https://firma.pl'], ['../etc'], ['localhost'], ['']])('wejście %j — 400 bez zapytań DNS', async (d) => {
    const r = resolver({});
    await expect(rozpoznajZrodlo(d, r)).rejects.toBeInstanceOf(BadRequestException);
    expect(r.resolve4).not.toHaveBeenCalled();
  });

  it('przegląd 14.10: strona już na węźle Verris — bez nazwy węzła (white label), bez zapytania PTR', async () => {
    const r = resolver({ a: ['198.51.100.3'], ptr: ['t1.verris-wezly.example'] });
    expect(await rozpoznajZrodlo('firma.pl', r, ['198.51.100.3'])).toEqual({ domena: 'firma.pl', a: [], mx: [], ns: [], podpowiedzHosta: null, juzUNas: true });
    expect(r.reverse).not.toHaveBeenCalled();
  });
});

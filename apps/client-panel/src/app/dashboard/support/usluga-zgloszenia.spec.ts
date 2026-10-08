import { BEZ_USLUGI, nazwaUslugi, opcjeUslug } from './usluga-zgloszenia';

/** PB-43 — wybór usługi w formularzu zgłoszenia i nazwa usługi w widoku zgłoszenia. */
describe('usługa zgłoszenia', () => {
  it('jedyna usługa jest wybrana od razu; „nie dotyczy” zawsze na liście', () => {
    const { opcje, domyslna } = opcjeUslug([{ id: 's1', nazwa: 'sklep.pl' }]);
    expect(domyslna).toBe('s1');
    expect(opcje).toEqual([{ value: 's1', label: 'sklep.pl' }, BEZ_USLUGI]);
  });

  it('kilka usług: klient wybiera sam (bez domyślnej)', () => {
    expect(opcjeUslug([{ id: 's1', nazwa: 'a.pl' }, { id: 's2', nazwa: 'b.pl' }]).domyslna).toBe('');
    expect(opcjeUslug([]).domyslna).toBe('');
  });

  it('nazwa: domena, bez niej plan; tag w nawiasie', () => {
    expect(nazwaUslugi({ id: '1', serviceTag: 'wnbgswgc', planName: 'Hosting', account: { domain: 'sklep.pl' } })).toBe('sklep.pl (wnbgswgc)');
    expect(nazwaUslugi({ id: '1', plan: { name: 'Poczta' }, account: null })).toBe('Poczta');
    expect(nazwaUslugi({ id: '1' })).toBe('Usługa');
  });
});

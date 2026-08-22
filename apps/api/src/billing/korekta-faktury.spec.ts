import { Prisma } from '@verris/database';
import {
  bladKorygowalnosci,
  korektaFormalna,
  kwotaDoDoplaty,
  kwotaDoZwrotu,
  opisKorekty,
  przeliczKorekte,
  type StanFaktury,
} from './korekta-faktury';

/**
 * M-06 — arytmetyka i dopuszczalność korekty.
 *
 * Korekta jest dokumentem, z którego organ podatkowy odtwarza rozliczenie.
 * Jeżeli różnica nie sumuje się z kwotami przed i po, dokument nie mówi
 * niczego pewnego — a to nie jest usterka wyświetlania, tylko wadliwy zapis
 * w rejestrze VAT.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

function faktura(over: Partial<StanFaktury> = {}): StanFaktury {
  return {
    amount: D('123.00'),
    netAmount: D('100.00'),
    vatAmount: D('23.00'),
    lineItems: [
      {
        name: 'Abonament',
        quantity: 1,
        unitNet: '100.00',
        vatRate: 23,
        totalNet: '100.00',
        totalVat: '23.00',
        totalGross: '123.00',
      },
    ],
    buyerSnapshot: { name: 'Klient', nip: '1234563218' },
    kind: 'VAT',
    status: 'PAID',
    currency: 'PLN',
    ...over,
  };
}

describe('M-06 — dopuszczalność korekty', () => {
  it('zwykłą opłaconą fakturę wolno skorygować', () => {
    expect(bladKorygowalnosci(faktura())).toBeNull();
  });

  it('nie koryguje się korekty', () => {
    // Prawo dopuszcza, ale wtedy dokument odnosi się do dokumentu, który sam
    // już coś zmienia, i wyliczenie „ile ostatecznie wyszło" przestaje być
    // odczytem dwóch pól. Odmowa jest uczciwsza niż dokument, którego nie
    // umiem policzyć.
    expect(bladKorygowalnosci(faktura({ kind: 'KOREKTA' }))).toMatch(/korekty/);
  });

  it('nie koryguje się wersji roboczej ani dokumentu anulowanego', () => {
    expect(bladKorygowalnosci(faktura({ status: 'DRAFT' }))).toMatch(/roboczej/);
    expect(bladKorygowalnosci(faktura({ status: 'VOID' }))).toMatch(/anulowana/);
  });
});

describe('M-06 — korekta wartościowa', () => {
  it('liczy różnicę jako po minus przed', () => {
    const w = przeliczKorekte(faktura(), [
      { nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' },
    ]);
    expect(w.przed.brutto.toFixed(2)).toBe('123.00');
    expect(w.po.brutto.toFixed(2)).toBe('61.50');
    expect(w.roznica.brutto.toFixed(2)).toBe('-61.50');
  });

  it('różnica sumuje się z netto i VAT co do grosza', () => {
    const w = przeliczKorekte(faktura(), [
      { nazwa: 'Abonament', ilosc: 1, cenaBrutto: '61.50' },
    ]);
    expect(w.roznica.netto.plus(w.roznica.vat).toFixed(2)).toBe(w.roznica.brutto.toFixed(2));
  });

  it('kwoty po korekcie zgadzają się z kwotami przed plus różnica', () => {
    // Niezmiennik, z którego korzysta zarówno PDF, jak i rejestr VAT.
    for (const cena of ['0.00', '1.23', '61.50', '99.99', '200.00']) {
      const w = przeliczKorekte(faktura(), [{ nazwa: 'A', ilosc: 1, cenaBrutto: cena }]);
      expect(w.przed.brutto.plus(w.roznica.brutto).toFixed(2)).toBe(w.po.brutto.toFixed(2));
      expect(w.przed.netto.plus(w.roznica.netto).toFixed(2)).toBe(w.po.netto.toFixed(2));
      expect(w.przed.vat.plus(w.roznica.vat).toFixed(2)).toBe(w.po.vat.toFixed(2));
    }
  });

  it('pełny zwrot to pozycja z kwotą zero, nie brak pozycji', () => {
    const w = przeliczKorekte(faktura(), [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '0' }]);
    expect(w.po.brutto.toFixed(2)).toBe('0.00');
    expect(w.roznica.brutto.toFixed(2)).toBe('-123.00');
    // Dokument bez pozycji nie mówi, CZEGO dotyczy.
    expect(() => przeliczKorekte(faktura(), [])).toThrow(/bez pozycji/);
  });

  it('korekta w górę daje dopłatę, nie zwrot', () => {
    const w = przeliczKorekte(faktura(), [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '200.00' }]);
    expect(w.roznica.brutto.toFixed(2)).toBe('77.00');
    expect(kwotaDoZwrotu(w.roznica).toFixed(2)).toBe('0.00');
    expect(kwotaDoDoplaty(w.roznica).toFixed(2)).toBe('77.00');
  });

  it('odmawia korekty, która niczego nie zmienia', () => {
    expect(() =>
      przeliczKorekte(faktura(), [{ nazwa: 'Abonament', ilosc: 1, cenaBrutto: '123.00' }]),
    ).toThrow(/niczego nie zmienia/);
  });

  it('odrzuca ujemną cenę po korekcie', () => {
    // Ujemna pozycja to nie jest korekta, tylko błąd wprowadzania. Zwrot
    // wyraża się kwotą PO, nie ceną ze znakiem minus.
    expect(() =>
      przeliczKorekte(faktura(), [{ nazwa: 'A', ilosc: 1, cenaBrutto: '-10' }]),
    ).toThrow(/ujemna/);
  });

  it('odrzuca ilość ułamkową', () => {
    expect(() =>
      przeliczKorekte(faktura(), [{ nazwa: 'A', ilosc: 2.5, cenaBrutto: '10' }]),
    ).toThrow(/całkowitą/);
  });

  it('obsługuje fakturę bez zapisanego rozbicia VAT', () => {
    // Faktury sprzed 2.2 mają netAmount i vatAmount puste. Korekta do takiej
    // faktury musi działać, bo to właśnie te dokumenty najczęściej wymagają
    // poprawy.
    const w = przeliczKorekte(faktura({ netAmount: null, vatAmount: null }), [
      { nazwa: 'A', ilosc: 1, cenaBrutto: '61.50' },
    ]);
    expect(w.przed.netto.plus(w.przed.vat).toFixed(2)).toBe('123.00');
    expect(w.roznica.brutto.toFixed(2)).toBe('-61.50');
  });

  it('liczy poprawnie przy wielu pozycjach i ilościach', () => {
    const f = faktura({ amount: D('369.00'), netAmount: D('300.00'), vatAmount: D('69.00') });
    const w = przeliczKorekte(f, [
      { nazwa: 'A', ilosc: 2, cenaBrutto: '61.50' },
      { nazwa: 'B', ilosc: 1, cenaBrutto: '123.00' },
    ]);
    expect(w.po.brutto.toFixed(2)).toBe('246.00');
    expect(w.roznica.brutto.toFixed(2)).toBe('-123.00');
    expect(w.pozycjePo).toHaveLength(2);
    for (const p of w.pozycjePo) {
      expect(D(p.totalNet).plus(D(p.totalVat)).toFixed(2)).toBe(p.totalGross);
    }
  });
});

describe('M-06 — korekta formalna', () => {
  it('nie zmienia kwot i daje zerową różnicę', () => {
    const w = korektaFormalna(faktura());
    expect(w.przed.brutto.toFixed(2)).toBe('123.00');
    expect(w.po.brutto.toFixed(2)).toBe('123.00');
    expect(w.roznica.brutto.toFixed(2)).toBe('0.00');
    expect(w.roznica.netto.toFixed(2)).toBe('0.00');
    expect(w.roznica.vat.toFixed(2)).toBe('0.00');
  });

  it('przenosi pozycje bez zmian', () => {
    const f = faktura();
    const w = korektaFormalna(f);
    expect(w.pozycjePo).toEqual(f.lineItems);
  });

  it('nie generuje ani zwrotu, ani dopłaty', () => {
    const w = korektaFormalna(faktura());
    expect(kwotaDoZwrotu(w.roznica).toFixed(2)).toBe('0.00');
    expect(kwotaDoDoplaty(w.roznica).toFixed(2)).toBe('0.00');
  });
});

describe('M-06 — opis dokumentu', () => {
  it('mówi wprost, ile i w którą stronę', () => {
    const zwrot = przeliczKorekte(faktura(), [{ nazwa: 'A', ilosc: 1, cenaBrutto: '61.50' }]);
    expect(opisKorekty('WARTOSCIOWA', 'VFV/2026/08/0001', zwrot.roznica, 'PLN')).toBe(
      'Korekta faktury VFV/2026/08/0001 — zwrot 61.50 PLN',
    );

    const doplata = przeliczKorekte(faktura(), [{ nazwa: 'A', ilosc: 1, cenaBrutto: '200.00' }]);
    expect(opisKorekty('WARTOSCIOWA', 'VFV/2026/08/0001', doplata.roznica, 'PLN')).toContain(
      'dopłata',
    );
  });

  it('korekta formalna nie mówi o pieniądzach', () => {
    const w = korektaFormalna(faktura());
    const opis = opisKorekty('FORMALNA', 'VFV/2026/08/0001', w.roznica, 'PLN');
    expect(opis).toBe('Korekta danych nabywcy do faktury VFV/2026/08/0001');
    expect(opis).not.toMatch(/zwrot|dopłata/);
  });
});

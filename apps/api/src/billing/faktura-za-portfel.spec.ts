import { Prisma, WalletTxType } from '@verris/database';
import {
  czyAlarmowacOFakturze,
  nastepnaProbaFaktury,
  nazwaPozycji,
  okresZbiorczy,
  PROG_ALERTU_FAKTURY,
  PROG_FAKTURY_NATYCHMIASTOWEJ,
  pozycjeReczne,
  pozycjeZbiorcze,
  refZbiorcza,
  rozbicieVat,
  STAWKA_VAT,
  trybFaktury,
  TYPY_SPRZEDAZY,
} from './faktura-za-portfel';

/**
 * Z-01 — arytmetyka faktury, sprawdzona liczbowo.
 *
 * Faktura jest dokumentem księgowym: jeżeli pozycje nie sumują się do kwoty
 * albo netto plus VAT nie daje brutto, dokument jest wadliwy — i to nie
 * „brzydko wygląda", tylko nie spełnia art. 106e ustawy o VAT. Dlatego
 * niezmiennik sumowania jest tu sprawdzany na setkach kwot, a nie na trzech
 * ładnych przykładach.
 */

const D = (v: string | number) => new Prisma.Decimal(v);

describe('Z-01 — rozbicie VAT', () => {
  it('netto plus VAT zawsze daje brutto, co do grosza', () => {
    // Deterministyczny przemiał przez zakres kwot, w tym takie, które przy
    // niezależnym liczeniu VAT-u (brutto × 23/123) rozjeżdżają się o grosz.
    const zle: string[] = [];
    for (let grosze = 1; grosze <= 200000; grosze += 7) {
      const brutto = D(grosze).dividedBy(100).toDecimalPlaces(2);
      const r = rozbicieVat(brutto);
      if (!r.netto.plus(r.vat).equals(brutto)) {
        zle.push(`${brutto.toFixed(2)} → ${r.netto.toFixed(2)} + ${r.vat.toFixed(2)}`);
      }
    }
    expect(zle.slice(0, 5).join('; ')).toBe('');
  });

  it('liczy netto wstecz z brutto, bo ceny w cenniku są brutto', () => {
    // 45,00 brutto przy 23% → 36,59 netto, 8,41 VAT. Ta liczba pada w PB-01
    // i w cenniku na stronie.
    const r = rozbicieVat(D('45.00'));
    expect(r.netto.toFixed(2)).toBe('36.59');
    expect(r.vat.toFixed(2)).toBe('8.41');
  });

  it('VAT jest resztą, nie osobnym zaokrągleniem', () => {
    // Kontrprzykład: dla 0,07 zł niezależne liczenie VAT-u (0,07 × 23/123 =
    // 0,0131 → 0,01) i netto (0,0569 → 0,06) daje 0,07 — akurat dobrze.
    // Ale dla 0,04: netto 0,0325 → 0,03, VAT 0,0075 → 0,01, suma 0,04 — też.
    // Sprawdzamy więc regułę, nie szczęśliwy przypadek.
    for (const b of ['0.01', '0.04', '0.07', '0.11', '1.23', '99.99', '1234.56']) {
      const r = rozbicieVat(D(b));
      expect(r.netto.plus(r.vat).toFixed(2)).toBe(D(b).toFixed(2));
    }
  });

  it('obsługuje stawkę inną niż 23', () => {
    const r = rozbicieVat(D('108.00'), 8);
    expect(r.netto.toFixed(2)).toBe('100.00');
    expect(r.vat.toFixed(2)).toBe('8.00');
  });
});

describe('Z-01 — tryb faktury', () => {
  it('sprzedaż powyżej progu dostaje fakturę od razu', () => {
    expect(trybFaktury(WalletTxType.CHARGE_SUBSCRIPTION, D('45.00'))).toBe('natychmiast');
    expect(trybFaktury(WalletTxType.CHARGE_DOMAIN, D('80.00'))).toBe('natychmiast');
  });

  it('autoskalowanie ZAWSZE idzie na zbiorczą, nawet powyżej progu', () => {
    // Pojedynczy blok mógłby przekroczyć próg przy skoku na trzech zasobach
    // naraz. Faktura za blok kilkunastominutowy byłaby formalnie poprawna
    // i praktycznie bez sensu — obok niej i tak stanęłaby zbiorcza za resztę
    // tego samego dnia.
    expect(trybFaktury(WalletTxType.CHARGE_AUTOSCALING, D('0.12'))).toBe('zbiorczo');
    expect(trybFaktury(WalletTxType.CHARGE_AUTOSCALING, D('500.00'))).toBe('zbiorczo');
  });

  it('drobne zużycie poniżej progu idzie na zbiorczą', () => {
    expect(trybFaktury(WalletTxType.CHARGE_USAGE, D('4.99'))).toBe('zbiorczo');
    expect(trybFaktury(WalletTxType.CHARGE_USAGE, PROG_FAKTURY_NATYCHMIASTOWEJ)).toBe(
      'natychmiast',
    );
  });

  it('doładowanie i inne uznania nie generują faktury', () => {
    // Doładowanie nie jest sprzedażą — to środki na koncie. VAT powstaje przy
    // świadczeniu usługi, czyli przy obciążeniu.
    for (const t of [
      WalletTxType.TOPUP,
      WalletTxType.REFUND,
      WalletTxType.PROMO_CREDIT,
      WalletTxType.ADJUSTMENT,
      WalletTxType.CREDIT_PLAN_DOWNGRADE,
    ]) {
      expect(trybFaktury(t, D('100.00'))).toBe('brak');
    }
  });

  it('kwota zero albo ujemna nie generuje faktury', () => {
    expect(trybFaktury(WalletTxType.CHARGE_SUBSCRIPTION, D('0'))).toBe('brak');
    expect(trybFaktury(WalletTxType.CHARGE_SUBSCRIPTION, D('-45'))).toBe('brak');
  });

  it('każdy typ obciążeniowy jest objęty regułą sprzedaży', () => {
    // Gdyby ktoś dodał nowy typ CHARGE_* i zapomniał o tej liście, obciążenie
    // przechodziłoby bez dokumentu — czyli Z-01 wracałby dla jednego typu.
    const obciazeniowe = Object.values(WalletTxType).filter((t) => t.startsWith('CHARGE_'));
    const brakujace = obciazeniowe.filter((t) => !TYPY_SPRZEDAZY.has(t));
    expect(
      brakujace.length === 0
        ? ''
        : `Typy obciążeniowe spoza TYPY_SPRZEDAZY — obciążenie bez dokumentu ` +
          `księgowego (Z-01): ${brakujace.join(', ')}`,
    ).toBe('');
  });
});

describe('Z-01 — faktura zbiorcza', () => {
  const auto = (b: string) => ({
    typ: WalletTxType.CHARGE_AUTOSCALING,
    brutto: D(b),
    opis: null,
  });

  it('grupuje jednakowe pozycje i sumuje się co do grosza', () => {
    const { pozycje, suma } = pozycjeZbiorcze([auto('0.12'), auto('0.12'), auto('0.13')]);
    expect(pozycje).toHaveLength(1);
    expect(pozycje[0].quantity).toBe(3);
    expect(pozycje[0].name).toContain('3×');
    expect(suma.brutto.toFixed(2)).toBe('0.37');
    expect(suma.netto.plus(suma.vat).equals(suma.brutto)).toBe(true);
  });

  it('rozdziela pozycje o różnych opisach', () => {
    const { pozycje } = pozycjeZbiorcze([
      { typ: WalletTxType.CHARGE_AUTOSCALING, brutto: D('1.00'), opis: 'Autoskalowanie CPU' },
      { typ: WalletTxType.CHARGE_USAGE, brutto: D('2.00'), opis: 'Monitoring' },
    ]);
    expect(pozycje.map((p) => p.name).sort()).toEqual(['Autoskalowanie CPU', 'Monitoring']);
  });

  it('suma pozycji równa się sumie obciążeń przy wielu drobnych kwotach', () => {
    // Czterdzieści trzy bloki autoskalowania w miesiącu to realna liczba.
    const wiele = Array.from({ length: 43 }, (_, i) => auto((0.07 + i * 0.003).toFixed(2)));
    const oczekiwane = wiele.reduce((a, o) => a.plus(o.brutto), D(0)).toDecimalPlaces(2);
    const { suma } = pozycjeZbiorcze(wiele);
    expect(suma.brutto.toFixed(2)).toBe(oczekiwane.toFixed(2));
    expect(suma.netto.plus(suma.vat).toFixed(2)).toBe(oczekiwane.toFixed(2));
  });

  it('każda pozycja ma spójne netto, VAT i brutto', () => {
    const { pozycje } = pozycjeZbiorcze([auto('1.11'), auto('2.22'), auto('3.33')]);
    for (const p of pozycje) {
      expect(D(p.totalNet).plus(D(p.totalVat)).toFixed(2)).toBe(p.totalGross);
      expect(p.vatRate).toBe(STAWKA_VAT);
    }
  });

  it('nazwa pozycji bierze się z opisu obciążenia, a domyślna z typu', () => {
    expect(nazwaPozycji(WalletTxType.CHARGE_DOMAIN, 'Domena example.pl — 1 rok')).toBe(
      'Domena example.pl — 1 rok',
    );
    expect(nazwaPozycji(WalletTxType.CHARGE_SUBSCRIPTION, null)).toBe('Abonament hostingowy');
    expect(nazwaPozycji(WalletTxType.CHARGE_SUBSCRIPTION, '   ')).toBe('Abonament hostingowy');
  });

  it('przycina bardzo długi opis zamiast wpuszczać go na fakturę', () => {
    const dlugi = 'x'.repeat(500);
    expect(nazwaPozycji(WalletTxType.CHARGE_USAGE, dlugi).length).toBeLessThanOrEqual(200);
  });
});

describe('Z-01 — faktura ręczna', () => {
  it('liczy brutto z ceny jednostkowej i ilości, a netto z brutto', () => {
    const { pozycje, suma } = pozycjeReczne([
      { nazwa: 'Konfiguracja serwera', ilosc: 3, cenaBrutto: '123.45' },
    ]);
    expect(pozycje[0].totalGross).toBe('370.35');
    expect(suma.netto.plus(suma.vat).toFixed(2)).toBe('370.35');
  });

  it('suma wielu pozycji zgadza się co do grosza', () => {
    const { suma } = pozycjeReczne([
      { nazwa: 'A', ilosc: 1, cenaBrutto: '0.01' },
      { nazwa: 'B', ilosc: 7, cenaBrutto: '3.33' },
      { nazwa: 'C', ilosc: 2, cenaBrutto: '99.99' },
    ]);
    expect(suma.brutto.toFixed(2)).toBe('223.30');
    expect(suma.netto.plus(suma.vat).toFixed(2)).toBe('223.30');
  });

  it('odrzuca fakturę bez pozycji', () => {
    expect(() => pozycjeReczne([])).toThrow(/bez pozycji/);
  });

  it('odrzuca cenę zero i ujemną', () => {
    expect(() => pozycjeReczne([{ nazwa: 'A', ilosc: 1, cenaBrutto: '0' }])).toThrow(/dodatnia/);
    expect(() => pozycjeReczne([{ nazwa: 'A', ilosc: 1, cenaBrutto: '-5' }])).toThrow(/dodatnia/);
  });

  it('odrzuca ilość ułamkową i zerową', () => {
    expect(() => pozycjeReczne([{ nazwa: 'A', ilosc: 1.5, cenaBrutto: '10' }])).toThrow(/całkowitą/);
    expect(() => pozycjeReczne([{ nazwa: 'A', ilosc: 0, cenaBrutto: '10' }])).toThrow(/całkowitą/);
  });
});

describe('Z-01 — okres zbiorczy', () => {
  it('bierze poprzedni pełny miesiąc', () => {
    const o = okresZbiorczy(new Date('2026-09-01T04:00:00Z'));
    expect(o.od.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(o.do.toISOString()).toBe('2026-09-01T00:00:00.000Z');
    expect(o.etykieta).toBe('2026-08');
  });

  it('przechodzi przez granicę roku', () => {
    const o = okresZbiorczy(new Date('2027-01-01T04:00:00Z'));
    expect(o.etykieta).toBe('2026-12');
    expect(o.od.toISOString()).toBe('2026-12-01T00:00:00.000Z');
  });

  it('okresy sąsiadujące stykają się bez luki i bez zakładki', () => {
    // Luka znaczyłaby obciążenia, których nie obejmie żadna faktura;
    // zakładka — obciążenia na dwóch fakturach naraz.
    const a = okresZbiorczy(new Date('2026-09-01T04:00:00Z'));
    const b = okresZbiorczy(new Date('2026-10-01T04:00:00Z'));
    expect(a.do.toISOString()).toBe(b.od.toISOString());
  });

  it('referencja zbiorcza jest stała dla pary klient-miesiąc', () => {
    expect(refZbiorcza('u1', '2026-08')).toBe(refZbiorcza('u1', '2026-08'));
    expect(refZbiorcza('u1', '2026-08')).not.toBe(refZbiorcza('u1', '2026-09'));
  });
});

describe('Z-01 — ponawianie finalizacji', () => {
  const T0 = new Date('2026-08-22T12:00:00.000Z');

  it('odstępy rosną', () => {
    const o = [1, 2, 3, 4].map((p) => nastepnaProbaFaktury(p, T0).getTime() - T0.getTime());
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThan(o[i - 1]);
  });

  it('są rzadsze niż przy webhooku płatności', () => {
    // Tam brakowało pieniędzy, tu brakuje dokumentu przy poprawnie pobranych
    // pieniądzach. Ustawa daje czas do 15. dnia następnego miesiąca.
    expect(nastepnaProbaFaktury(1, T0).getTime() - T0.getTime()).toBeGreaterThan(60 * 1000);
  });

  it(`alarmuje dopiero po ${PROG_ALERTU_FAKTURY} próbach`, () => {
    expect(czyAlarmowacOFakturze({ finalizeAttempts: 1, finalizeAlertedAt: null }, T0)).toBe(false);
    expect(
      czyAlarmowacOFakturze({ finalizeAttempts: PROG_ALERTU_FAKTURY, finalizeAlertedAt: null }, T0),
    ).toBe(true);
  });

  it('nie powtarza alertu częściej niż raz na dobę', () => {
    const s = { finalizeAttempts: 9, finalizeAlertedAt: T0 };
    const zaGodzine = new Date(T0.getTime() + 60 * 60 * 1000);
    const zaDobe = new Date(T0.getTime() + 24 * 60 * 60 * 1000);
    expect(czyAlarmowacOFakturze(s, zaGodzine)).toBe(false);
    expect(czyAlarmowacOFakturze(s, zaDobe)).toBe(true);
  });
});

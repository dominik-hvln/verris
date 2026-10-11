import { BadRequestException } from '@nestjs/common';
import { czyMakro, planMakra } from './makra-zgloszen.js';
import { OBECNOSC_WAZNA_MS, RejestrObecnosci } from './obecnosc-zgloszen.js';
import { mediana, ocenTermin, procentDotrzymanych } from './raporty-zgloszen.js';
import { warunkiListyZgloszen } from './lista-zgloszen.js';
import { odmowaScalonego } from './tickets.service.js';
import { AkcjaMasowaDto, MASOWO_MAX } from './tickets.dto.js';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

/** F3.7 cz. 2 — logika makr, obecności, raportów, działów i scalenia (bez bazy; baza — test/integration). */
describe('F3.7 — makra', () => {
  const m = (o: Partial<{ makroStan: string | null; makroTagi: string[]; makroPrzypisz: string | null }> = {}) => ({
    makroStan: null, makroTagi: [], makroPrzypisz: null, ...o,
  });

  it('szablon bez akcji to nie makro', () => {
    expect(czyMakro(m())).toBe(false);
    expect(czyMakro(m({ makroTagi: ['dns'] }))).toBe(true);
    expect(czyMakro(m({ makroPrzypisz: 'JA' }))).toBe(true);
  });

  it('stan: czekaj/W realizacji przez samą odpowiedź, OPEN i CLOSED — zmiana po odpowiedzi', () => {
    expect(planMakra(m(), 'ja')).toEqual({ czekaj: 'tak', zmiana: null, tagi: [] });
    expect(planMakra(m({ makroStan: 'WAITING_CUSTOMER' }), 'ja')).toEqual({ czekaj: 'tak', zmiana: null, tagi: [] });
    expect(planMakra(m({ makroStan: 'IN_PROGRESS' }), 'ja')).toEqual({ czekaj: 'nie', zmiana: null, tagi: [] });
    expect(planMakra(m({ makroStan: 'CLOSED' }), 'ja').zmiana).toEqual({ status: 'CLOSED' });
    expect(planMakra(m({ makroStan: 'OPEN' }), 'ja')).toMatchObject({ czekaj: 'nie', zmiana: { status: 'OPEN' } });
  });

  it('przypisanie: JA → stosujący, NIKT → null, tagi znormalizowane; złe dane makra → 400 przed odpowiedzią', () => {
    expect(planMakra(m({ makroPrzypisz: 'JA', makroTagi: ['Poczta Wychodząca'] }), 'op1')).toEqual({ czekaj: 'tak', zmiana: { assignedToId: 'op1' }, tagi: ['poczta-wychodząca'] });
    expect(planMakra(m({ makroPrzypisz: 'NIKT', makroStan: 'CLOSED' }), 'op1').zmiana).toEqual({ status: 'CLOSED', assignedToId: null });
    expect(() => planMakra(m({ makroStan: 'USUNIETE' }), 'op1')).toThrow(BadRequestException);
    expect(() => planMakra(m({ makroPrzypisz: 'KTOS' }), 'op1')).toThrow(BadRequestException);
    expect(() => planMakra(m({ makroTagi: ['zły tag!'] }), 'op1')).toThrow(BadRequestException);
  });
});

describe('F3.7 — obecność w zgłoszeniu', () => {
  it('widzę innych (nie siebie), „pisze” się aktualizuje, znacznik wygasa, wyjście znika od razu', () => {
    const r = new RejestrObecnosci();
    expect(r.zglos('t1', 'anna', false, 0)).toEqual([]);
    expect(r.zglos('t1', 'jan', true, 1000)).toEqual([{ userId: 'anna', pisze: false, od: 0, ostatnio: 0 }]);
    expect(r.zglos('t1', 'anna', false, 2000).map((o) => [o.userId, o.pisze])).toEqual([['jan', true]]);
    // inne zgłoszenie — osobno
    expect(r.zglos('t2', 'anna', false, 2000)).toEqual([]);
    // jan przestał odpytywać → po OBECNOSC_WAZNA_MS znika
    expect(r.zglos('t1', 'anna', false, 1000 + OBECNOSC_WAZNA_MS + 1)).toEqual([]);
    r.zglos('t1', 'jan', false, 1000 + OBECNOSC_WAZNA_MS + 2);
    r.odejdz('t1', 'jan');
    expect(r.zglos('t1', 'anna', false, 1000 + OBECNOSC_WAZNA_MS + 3)).toEqual([]);
  });
});

describe('F3.7 — raporty: terminy SLA i mediana', () => {
  const d = (h: number) => new Date(Date.UTC(2026, 9, 1, h));
  it('ocenTermin: dotrzymane, przekroczone, w toku, bez terminu; zamknięte bez odpowiedzi po terminie = przekroczone', () => {
    expect(ocenTermin(d(12), d(11), null, d(20))).toBe('dotrzymane');
    expect(ocenTermin(d(12), d(12), null, d(20))).toBe('dotrzymane');
    expect(ocenTermin(d(12), d(13), null, d(20))).toBe('przekroczone');
    expect(ocenTermin(d(12), null, null, d(11))).toBe('wToku');
    expect(ocenTermin(d(12), null, null, d(13))).toBe('przekroczone');
    expect(ocenTermin(d(12), null, d(14), d(20))).toBe('przekroczone');
    expect(ocenTermin(d(12), null, d(10), d(20))).toBe('bez');
    expect(ocenTermin(null, d(10), null, d(20))).toBe('bez');
  });

  it('mediana i odsetek dotrzymanych', () => {
    expect(mediana([])).toBeNull();
    expect(mediana([5, 1, 3])).toBe(3);
    expect(mediana([4, 1, 3, 2])).toBe(2.5);
    expect(procentDotrzymanych({ dotrzymane: 0, przekroczone: 0, wToku: 3, bez: 1 })).toBeNull();
    expect(procentDotrzymanych({ dotrzymane: 2, przekroczone: 1, wToku: 5, bez: 0 })).toBe(66.7);
  });
});

describe('F3.7 — działy w skrzynce, scalone zgłoszenie, akcje masowe', () => {
  it('filtr działu: znany dział → warunek, nieznany → 400 (nie pusta lista)', () => {
    expect(warunkiListyZgloszen({ dzial: 'BILLING' }, 'op', new Date())).toEqual({ AND: [{ department: 'BILLING' }] });
    expect(() => warunkiListyZgloszen({ dzial: 'ABUSE' }, 'op', new Date())).toThrow(BadRequestException);
  });

  it('do scalonego zgłoszenia nie da się pisać — komunikat z numerem celu', () => {
    expect(() => odmowaScalonego({ scalonoDoId: null })).not.toThrow();
    expect(() => odmowaScalonego({ scalonoDoId: 'abcdef12-0000-4000-8000-000000000000' })).toThrow(/#abcdef12/);
  });

  it(`akcja masowa: najwyżej ${MASOWO_MAX} zgłoszeń, tylko UUID, znana akcja`, async () => {
    const id = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
    const bledy = async (o: object) => (await validate(plainToInstance(AkcjaMasowaDto, o))).map((e) => e.property);
    expect(await bledy({ ids: [id(1)], akcja: 'stan', status: 'CLOSED' })).toEqual([]);
    expect(await bledy({ ids: Array.from({ length: MASOWO_MAX + 1 }, (_, i) => id(i)), akcja: 'stan', status: 'CLOSED' })).toEqual(['ids']);
    expect(await bledy({ ids: [], akcja: 'stan' })).toEqual(['ids']);
    expect(await bledy({ ids: ['x'], akcja: 'stan' })).toEqual(['ids']);
    expect(await bledy({ ids: [id(1)], akcja: 'usun' })).toEqual(['akcja']);
  });
});

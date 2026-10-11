import { dataGodzinaPl, dataPl, dzienPl, ostatnieDniPl } from './data-pl';
import { lastDaysLabels } from '@/components/panel/v2';

/**
 * Nocna weryfikacja 12.10 — React #418 (hydratacja) w panelu klienta. Render serwera Next idzie w kontenerze
 * w UTC, render przeglądarki w Europe/Warsaw. Testy biegną w UTC (jest.global-setup.cjs), więc wynik równy
 * czasowi polskiemu = ten sam tekst na serwerze i w przeglądarce.
 */

// 23:30 UTC = 00:30 następnego dnia w Polsce (CET) — tu rozjeżdżał się „najbliższe odnowienie 7 lis / 8 lis”.
const PO_PLNOCY_PL = '2026-11-07T23:30:00.000Z';

describe('data-pl — czas polski niezależnie od strefy procesu', () => {
  it('warunek testu: proces jest w UTC jak serwer Next, a formatowanie bez strefy daje dzień UTC', () => {
    expect(Intl.DateTimeFormat().resolvedOptions().timeZone).toBe('UTC');
    expect(new Date(PO_PLNOCY_PL).toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' })).toBe('7 lis');
  });

  it('dataPl daje dzień kalendarzowy w Polsce', () => {
    expect(dataPl(PO_PLNOCY_PL, { day: 'numeric', month: 'short' })).toBe('8 lis');
    expect(dataPl(PO_PLNOCY_PL)).toBe('8.11.2026');
  });

  it('dataGodzinaPl: godzina polska (latem +2 h, zimą +1 h)', () => {
    const opcje: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' };
    expect(dataGodzinaPl('2026-10-11T17:12:00Z', opcje)).toBe('11 paź, 19:12');
    expect(dataGodzinaPl('2026-12-01T08:05:00Z', opcje)).toBe('1 gru, 09:05');
    expect(dataGodzinaPl('2026-10-11T17:12:00Z')).toBe('11.10.2026, 19:12:00');
  });

  it('dzienPl: dzień w Polsce jako RRRR-MM-DD', () => {
    expect(dzienPl(PO_PLNOCY_PL)).toBe('2026-11-08');
    expect(dzienPl('2026-11-07T22:59:00Z')).toBe('2026-11-07');
  });

  it('ostatnieDniPl liczy dni kalendarzowe w Polsce (także przez zmianę czasu 25.10)', () => {
    expect(ostatnieDniPl(3, new Date('2026-10-26T00:30:00+01:00'))).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
    expect(ostatnieDniPl(2, new Date(PO_PLNOCY_PL))).toEqual(['2026-11-07', '2026-11-08']);
  });

  it('lastDaysLabels (wykres 7 dni na pulpicie) kończy się na dzisiejszym dniu w Polsce', () => {
    expect(lastDaysLabels(2, new Date(PO_PLNOCY_PL))).toEqual(['sob., 7 lis', 'niedz., 8 lis']);
  });
});

import { plForm, plural, tickets, days } from './pl';

/** Polska odmiana liczebników w panelu obsługi (kopia helpera z panelu admina) — „2 zgłoszenia”, „5 zgłoszeń”, „22 zgłoszenia”. */
describe('CL-03 odmiana liczebników', () => {
  it.each([
    [0, 'zgłoszeń'],
    [1, 'zgłoszenie'],
    [2, 'zgłoszenia'],
    [4, 'zgłoszenia'],
    [5, 'zgłoszeń'],
    [12, 'zgłoszeń'],
    [14, 'zgłoszeń'],
    [22, 'zgłoszenia'],
    [112, 'zgłoszeń'],
    [-3, 'zgłoszenia'],
  ])('%i → %s', (n, forma) => {
    expect(plForm(n, 'zgłoszenie', 'zgłoszenia', 'zgłoszeń')).toBe(forma);
  });

  it('plural dokleja liczbę; gotowe etykiety', () => {
    expect(plural(3, 'kod zapasowy', 'kody zapasowe', 'kodów zapasowych')).toBe('3 kody zapasowe');
    expect(tickets(1)).toBe('1 zgłoszenie');
    expect(days(2)).toBe('2 dni');
  });
});

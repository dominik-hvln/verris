import { plForm, plural, nodes, days } from './pl';

/** Polska odmiana liczebników w panelu admina — „2 węzły”, „5 węzłów”, „12 węzłów”, „22 węzły”. */
describe('X-05 odmiana liczebników', () => {
  it.each([
    [0, 'węzłów'],
    [1, 'węzeł'],
    [2, 'węzły'],
    [4, 'węzły'],
    [5, 'węzłów'],
    [12, 'węzłów'],
    [14, 'węzłów'],
    [22, 'węzły'],
    [112, 'węzłów'],
    [-3, 'węzły'],
  ])('%i → %s', (n, forma) => {
    expect(plForm(n, 'węzeł', 'węzły', 'węzłów')).toBe(forma);
  });

  it('plural dokleja liczbę; gotowe etykiety', () => {
    expect(plural(3, 'konto', 'konta', 'kont')).toBe('3 konta');
    expect(nodes(1)).toBe('1 węzeł');
    expect(days(2)).toBe('2 dni');
  });
});

import { filterItems, normalize } from './command-palette';

describe('wyszukiwarka /', () => {
  it('normalizuje polskie znaki', () => {
    expect(normalize('Zażółć Łódź')).toBe('zazolc lodz');
  });
  it('filtruje po etykiecie i podpowiedzi', () => {
    const items = [
      { label: 'Płatności', hint: 'portfel' },
      { label: 'Domeny', hint: 'dns' },
    ];
    expect(filterItems(items, 'platn').map((i) => i.label)).toEqual(['Płatności']);
    expect(filterItems(items, 'DNS').map((i) => i.label)).toEqual(['Domeny']);
    expect(filterItems(items, '  ')).toHaveLength(2);
  });
});

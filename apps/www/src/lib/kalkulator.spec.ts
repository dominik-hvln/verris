import { formatZl, kosztPiku } from './kalkulator';

describe('kalkulator dopłaty za pik', () => {
  it('przykład ze strony: +7 vCPU i +4 GB RAM przez 2,5 h = 3,20 zł', () => {
    expect(formatZl(kosztPiku(7, 4, 2.5))).toBe('3,20');
  });

  it('stawki z cennika: 1 vCPU·h = 0,1323 zł, 1 GB RAM·h = 0,0882 zł', () => {
    expect(kosztPiku(1, 0, 1)).toBeCloseTo(0.1323, 10);
    expect(kosztPiku(0, 1, 1)).toBeCloseTo(0.0882, 10);
  });

  it('bez nadwyżki nie ma dopłaty', () => {
    expect(formatZl(kosztPiku(0, 0, 72))).toBe('0,00');
  });

  it('sufit suwaków: +22 vCPU i +56 GB przez 72 h', () => {
    expect(formatZl(kosztPiku(22, 56, 72))).toBe('565,19');
  });
});

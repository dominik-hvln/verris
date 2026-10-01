import { opcjeRetencji, zDni } from './retencja-kopii';

describe('H-03 — retencja kopii poza serwerem', () => {
  it('opcje od minimum do sufitu planu, bez wartości spoza planu', () => {
    expect(opcjeRetencji(30, 90)).toEqual([30, 45, 60, 90]);
    expect(opcjeRetencji(30, 50)).toEqual([30, 45, 50]);
    expect(opcjeRetencji(30, 30)).toEqual([30]);
  });
  it('bieżąca wartość spoza progów zostaje na liście', () => {
    expect(opcjeRetencji(30, 90, 75)).toEqual([30, 45, 60, 75, 90]);
    expect(opcjeRetencji(30, 60, 90)).toEqual([30, 45, 60]);
  });
  it('odmiana po „z”', () => {
    expect(zDni(30)).toBe('30 dni');
    expect(zDni(1)).toBe('1 dnia');
  });
});

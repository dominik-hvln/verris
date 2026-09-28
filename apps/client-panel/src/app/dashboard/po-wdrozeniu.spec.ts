import { czyNieaktualnaWersja } from '@verris/ui';

describe('stara karta po wdrożeniu → przeładowanie zamiast ekranu błędu', () => {
  it('rozpoznaje nieaktualną akcję serwera i chunk', () => {
    expect(czyNieaktualnaWersja({ name: 'UnrecognizedActionError', message: 'x' })).toBe(true);
    expect(czyNieaktualnaWersja(new Error('Server Action "4070751361609ca0" was not found on the server.'))).toBe(true);
    expect(czyNieaktualnaWersja({ name: 'ChunkLoadError', message: 'Loading chunk 12 failed' })).toBe(true);
  });
  it('zwykły błąd strony nie przeładowuje', () => {
    expect(czyNieaktualnaWersja(new Error('fetch failed'))).toBe(false);
    expect(czyNieaktualnaWersja(null)).toBe(false);
  });
});

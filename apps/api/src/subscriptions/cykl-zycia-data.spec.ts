import { dzienPl } from './cykl-zycia-uslugi.service.js';

/** Weryfikacja 11.10 — komunikaty cyklu życia usługi z datą jak w panelu operatora („8.11.2026”, czas PL), nie ISO. */
describe('dzienPl', () => {
  it('pl-PL w strefie Europe/Warsaw (północ UTC = ten sam dzień, 23:30 UTC = już następny)', () => {
    expect(dzienPl(new Date('2026-11-08T10:00:00Z'))).toBe('8.11.2026');
    expect(dzienPl(new Date('2026-11-08T23:30:00Z'))).toBe('9.11.2026');
  });
});

import { dzienCzytelny, dzienDoApi, dzienDoPola } from './dzien-kopii';

/**
 * CL-09 — kopia z wybranego dnia: klient wybiera datę w kalendarzu, a do API nadal idzie `RRRRMMDD`.
 * Zmiana formatu w stronę API zepsułaby wyszukiwanie kopii bez żadnego błędu na ekranie.
 */
describe('dzień kopii poza serwerem', () => {
  it('data z kalendarza → format API i z powrotem', () => {
    expect(dzienDoApi('2026-07-15')).toBe('20260715');
    expect(dzienDoPola('20260715')).toBe('2026-07-15');
  });

  it('puste albo niepełne pole nie wysyła dnia', () => {
    expect(dzienDoApi('')).toBe('');
    expect(dzienDoApi('2026-07')).toBe('');
    expect(dzienDoPola('')).toBe('');
  });

  it('dzień z API pokazujemy po polsku', () => {
    expect(dzienCzytelny('20260715')).toBe('15.07.2026');
    expect(dzienCzytelny('lipiec')).toBe('lipiec');
  });
});

import { komunikatEkoDlaKlienta } from './eko-komunikat.js';

describe('komunikatEkoDlaKlienta — tryb EKO bez nazwy panelu serwera', () => {
  it('zmiana harmonogramu: opis dla klienta zamiast „W DirectAdmin zaktualizowano … zadań cron”', () => {
    const wlaczony = komunikatEkoDlaKlienta({ adjusted: 2, notice: 'W DirectAdmin zaktualizowano 2 zadań cron z backupem' }, true);
    expect(wlaczony).toMatch(/raz w tygodniu/);
    expect(komunikatEkoDlaKlienta({ adjusted: 1, notice: 'x' }, false)).toMatch(/codzienne/);
    expect(wlaczony).not.toMatch(/DirectAdmin|\bDA\b|cron/i);
  });

  it('błąd odczytu lub wyjątek: bez surowego błędu serwera', () => {
    const bledy = [
      komunikatEkoDlaKlienta({ adjusted: 0, notice: 'Bez zmian harmonogramu w DA: ECONNREFUSED 10.0.0.5:2222' }, true),
      komunikatEkoDlaKlienta(null, false),
    ];
    for (const b of bledy) {
      expect(b).toMatch(/nie udało się/);
      expect(b).not.toMatch(/DirectAdmin|\bDA\b|2222|ECONN/);
    }
  });

  it('nic do zmiany — bez komunikatu', () => {
    expect(komunikatEkoDlaKlienta({ adjusted: 0, notice: null }, true)).toBeNull();
  });
});

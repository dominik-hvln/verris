import { KOPIA_KONTA_ALERT_DNI } from '@verris/contracts';
import { przebiegZInfo, stanKopiiKonta } from './kopie-kont.js';

const DOBA = 24 * 60 * 60 * 1000;
const teraz = Date.parse('2026-10-11T10:00:00Z');
const dniTemu = (d: number) => new Date(teraz - d * DOBA);

describe('F3.3 — stan kopii konta poza serwerem', () => {
  const konto = (o: Partial<{ createdAt: Date; offsiteBackupOkAt: Date | null; offsiteBackupFailedAt: Date | null }>) => ({
    createdAt: dniTemu(30),
    offsiteBackupOkAt: null,
    offsiteBackupFailedAt: null,
    ...o,
  });

  it('świeża udana — ok; starsza niż próg — przeterminowana', () => {
    expect(stanKopiiKonta(konto({ offsiteBackupOkAt: dniTemu(1) }), teraz)).toBe('ok');
    expect(stanKopiiKonta(konto({ offsiteBackupOkAt: dniTemu(KOPIA_KONTA_ALERT_DNI + 0.1) }), teraz)).toBe('przeterminowana');
  });

  it('nieudana po udanej — nieudana, nawet gdy udana jest świeża; udana po nieudanej — ok', () => {
    expect(stanKopiiKonta(konto({ offsiteBackupOkAt: dniTemu(1), offsiteBackupFailedAt: dniTemu(0.1) }), teraz)).toBe('nieudana');
    expect(stanKopiiKonta(konto({ offsiteBackupOkAt: dniTemu(0.1), offsiteBackupFailedAt: dniTemu(1) }), teraz)).toBe('ok');
    expect(stanKopiiKonta(konto({ offsiteBackupFailedAt: dniTemu(1) }), teraz)).toBe('nieudana');
  });

  it('bez kopii: konto nowe (młodsze niż próg) — nowe; starsze — brak', () => {
    expect(stanKopiiKonta(konto({ createdAt: dniTemu(0.5) }), teraz)).toBe('nowe');
    expect(stanKopiiKonta(konto({ createdAt: dniTemu(KOPIA_KONTA_ALERT_DNI + 1) }), teraz)).toBe('brak');
  });

  it('przebieg węzła z informacji raportu', () => {
    expect(przebiegZInfo('accounts=12 bytes=3456 dur=61s rclone sync ok')).toEqual({ konta: 12, bajty: 3456, czasS: 61, opis: 'rclone sync ok' });
    expect(przebiegZInfo(null)).toEqual({ konta: null, bajty: null, czasS: null, opis: null });
  });
});

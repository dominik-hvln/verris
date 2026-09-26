import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * I-11 — publikacja stagingu na produkcję nadpisuje bazę LIVE (`wp db import`).
 * Do 2026-09-23 kopia bazy LIVE była „best-effort": przy błędzie skrypt pisał
 * UWAGA i importował dalej. Strażnik pilnuje, że obie kopie (pliki i baza) są
 * twardą bramką i stoją PRZED pierwszym nadpisaniem produkcji.
 *
 * Statycznie, bo skrypt działa jako root na ścieżkach /home/<konto>.
 */
const SKRYPT = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'node-staging-sync.sh'), 'utf8');
const bezKomentarzy = (s: string) => s.split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
const TO_LIVE = bezKomentarzy(SKRYPT.slice(SKRYPT.indexOf('\nTO_LIVE)'), SKRYPT.indexOf('\n  ;;', SKRYPT.indexOf('\nTO_LIVE)'))));

describe('I-11 — publikacja stagingu tylko z kopią produkcji', () => {
  it('blok TO_LIVE istnieje', () => {
    expect(TO_LIVE).toContain('db import');
  });

  it('eksport bazy LIVE kończy się die przy błędzie, nie ostrzeżeniem', () => {
    const eksport = TO_LIVE.slice(TO_LIVE.indexOf('wp_in "$LIVE" "db export'));
    const doNastepnejKomendy = eksport.slice(0, eksport.indexOf('\n    as_user'));
    expect(doNastepnejKomendy).toMatch(/\|\|\s*die /);
    expect(TO_LIVE).not.toMatch(/backup bazy LIVE nie powiódł się \(kontynuuję/);
  });

  it('pusta kopia bazy też zatrzymuje publikację', () => {
    expect(TO_LIVE).toMatch(/test -s '\$\{DB_BACKUP\}'"\s*\\\s*\|\|\s*die /);
  });

  it('obie kopie są przed pierwszym nadpisaniem produkcji (import bazy i rsync plików)', () => {
    const kopiaPlikow = TO_LIVE.indexOf("tar -czf '$BACKUP'");
    const kopiaBazy = TO_LIVE.indexOf('wp_in "$LIVE" "db export');
    const importBazy = TO_LIVE.indexOf('wp_in "$LIVE" "db import');
    const rsync = TO_LIVE.indexOf('sync_files "$STG" "$LIVE"');
    expect(kopiaPlikow).toBeGreaterThan(-1);
    expect(kopiaBazy).toBeGreaterThan(kopiaPlikow);
    expect(importBazy).toBeGreaterThan(kopiaBazy);
    expect(rsync).toBeGreaterThan(kopiaBazy);
  });
});

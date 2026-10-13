import { spawnSync } from 'child_process';
import { mkdirSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
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

describe('I-11 — katalog kopii roboczej (DirectAdmin 1.710: subdomena jako domains/<sub>.<domena>)', () => {
  const blok = SKRYPT.slice(SKRYPT.indexOf('STAGING_HOST='), SKRYPT.indexOf('\n', SKRYPT.indexOf('[ -d "$STG" ] || STG=')));
  const stg = (uklad: 'nowy' | 'stary') => {
    const home = mkdtempSync(join(tmpdir(), 'stg-'));
    mkdirSync(join(home, 'domains', 'firma.pl', 'public_html', uklad === 'stary' ? 'staging' : 'x'), { recursive: true });
    if (uklad === 'nowy') mkdirSync(join(home, 'domains', 'staging.firma.pl', 'public_html'), { recursive: true });
    const r = spawnSync('bash', ['-c', `set -eu; HOME_DIR='${home}'; STG_SUB=staging; STG_DOMAIN=firma.pl; LIVE="$HOME_DIR/domains/firma.pl/public_html"\n${blok}\necho "$STG"`], { encoding: 'utf8' });
    return r.stdout.trim().slice(home.length);
  };
  it('nowy układ DA → domains/staging.<domena>/public_html', () => {
    expect(stg('nowy')).toBe('/domains/staging.firma.pl/public_html');
  });
  it('starszy układ → public_html/staging', () => {
    expect(stg('stary')).toBe('/domains/firma.pl/public_html/staging');
  });
});

/**
 * Przegląd produkcji 13.10: d3.hvln.pl (LIVE) odpowiadał adresami staging.d3.hvln.pl (home/siteurl, link REST).
 * Publikacja nie sprawdzała, czy po zamianie adresów w bazie LIVE nie został adres stagingu, a staging bez stałej
 * WP_REDIS_PREFIX w wp-config (kopia sprzed włączenia Redisa) nie dostawał własnej przestrzeni kluczy.
 */
describe('Staging ↔ LIVE — adresy i cache obiektowy', () => {
  const TO_STAGING = bezKomentarzy(SKRYPT.slice(SKRYPT.indexOf('\nTO_STAGING)'), SKRYPT.indexOf('\nTO_LIVE)')));

  it('staging zawsze dostaje własny WP_REDIS_PREFIX i WP_CACHE_KEY_SALT (bez warunku „config has”)', () => {
    const petla = TO_STAGING.slice(TO_STAGING.indexOf('for c in WP_REDIS_PREFIX WP_CACHE_KEY_SALT'));
    const cialo = petla.slice(0, petla.indexOf('done'));
    expect(cialo).toContain('config set $c');
    expect(cialo).not.toContain('config has');
  });

  it('po publikacji: kontrola, że w bazie LIVE nie ma adresu stagingu; inaczej powrót do kopii bazy i die', () => {
    const zamiana = TO_LIVE.indexOf(`search-replace '://\${STAGING_HOST}' '://\${STG_DOMAIN}' --all-tables --precise"`);
    const kontrola = TO_LIVE.indexOf('--dry-run --format=count');
    const powrot = TO_LIVE.indexOf(`db import '\${DB_BACKUP}'`);
    const rsync = TO_LIVE.indexOf('sync_files "$STG" "$LIVE"');
    expect(zamiana).toBeGreaterThan(-1);
    expect(kontrola).toBeGreaterThan(zamiana);
    expect(powrot).toBeGreaterThan(kontrola);
    expect(rsync).toBeGreaterThan(powrot);
    expect(TO_LIVE.slice(kontrola, rsync)).toMatch(/die "Adresy stagingu zostały w bazie LIVE/);
  });
});

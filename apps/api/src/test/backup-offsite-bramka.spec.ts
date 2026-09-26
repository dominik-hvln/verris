import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * H-19 — węzeł nie wchodzi w LIVE bez kopii poza serwerem.
 *
 * Do 2026-09-23: brak /etc/verris-backup.conf był [WARN], a kreator kopiował na
 * węzeł listę plików BEZ node-offsite-backup.sh — onboard po cichu pomijał cały
 * backup. Panel klienta mówi „kopie poza serwerem”, więc to musi być bramka.
 */
const KORZEN = resolve(__dirname, '../../../..');
const onboard = readFileSync(resolve(KORZEN, 'ops/scripts/node-onboard-live.sh'), 'utf8');
const kreator = readFileSync(resolve(KORZEN, 'apps/admin-panel/src/app/(dashboard)/nodes/wizard/wizard-content.ts'), 'utf8');

describe('H-19 — bramka backupu offsite w onboardzie węzła', () => {
  it('skrypt backupu jest wymagany w bundle', () => {
    const lista = onboard.slice(onboard.indexOf('require_bundle_scripts() {'), onboard.indexOf('require_bundle_scripts() {') + 800);
    expect(lista).toContain('node-offsite-backup.sh');
  });

  it('brak konfiguracji to [FAIL], nie ostrzeżenie', () => {
    const blok = onboard.slice(onboard.indexOf('if ! backup_offsite_skonfigurowany'), onboard.indexOf('if ! backup_offsite_skonfigurowany') + 300);
    expect(blok).toContain('log_fail');
    expect(onboard).not.toMatch(/verris-backup\.conf[^\n]*log_warn|log_warn[^\n]*verris-backup\.conf/);
  });

  it('konfiguracja = plik z RCLONE_REMOTE i ten remote w rclone', () => {
    expect(onboard).toMatch(/backup_offsite_skonfigurowany\(\) \{[\s\S]*RCLONE_REMOTE[\s\S]*rclone listremotes/);
  });

  it('kreator kopiuje cały katalog skryptów i ma krok konfiguracji backupu', () => {
    expect(kreator).toContain('tar czf - ops/scripts ops/hosting-default-page ops/etc/verris/security ops/systemd');
    expect(kreator).toContain('id: "backup-offsite"');
    expect(kreator).toContain('/etc/verris-backup.conf');
  });
});

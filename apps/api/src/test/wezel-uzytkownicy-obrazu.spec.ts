import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * 19.10 (TEST-02, Contabo): obraz AlmaLinux zostawił użytkownika `almalinux` z `(ALL) NOPASSWD: ALL` i grupą adm —
 * root bez hasła na węźle hostingu. Hardening blokuje domyślnych użytkowników obrazów, a raport onboardu pilnuje skutku.
 * Funkcje wykonywane naprawdę (bash), polecenia systemowe podmienione.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const czytaj = (p: string) => readFileSync(join(KORZEN, p), 'utf8');

function funkcja(skrypt: string, nazwa: string): string {
  const m = skrypt.match(new RegExp(`^${nazwa}\\(\\) \\{[\\s\\S]*?^\\}`, 'm'));
  if (!m) throw new Error(`brak ${nazwa}`);
  return m[0];
}

function bash(kod: string): { wyjscie: string; kod: number } {
  try {
    return { wyjscie: execFileSync('bash', ['-c', kod], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }), kod: 0 };
  } catch (e) {
    const err = e as { stdout?: string; status?: number };
    return { wyjscie: err.stdout ?? '', kod: err.status ?? 1 };
  }
}

describe('hardening węzła: domyślni użytkownicy obrazu', () => {
  const skrypt = czytaj('ops/scripts/security-hardening-baseline.sh');
  const zablokuj = funkcja(skrypt, 'zablokuj_uzytkownikow_obrazu');
  const sudoersD = () => {
    const d = mkdtempSync(join(tmpdir(), 'sudoers-'));
    writeFileSync(join(d, '90-cloud-init-users'), '# Created by cloud-init\nalmalinux ALL=(ALL) NOPASSWD:ALL\nzostaje ALL=(ALL) ALL\n');
    return d;
  };
  const atrapy = (opts: { sudoNadal?: boolean }) => `
    set -euo pipefail
    log() { echo "LOG $*"; }
    run() { echo "RUN $*"; case "$*" in sed\\ *) eval "$@" ;; esac; }
    id() { if [ "$#" -eq 1 ]; then [ "$1" = almalinux ]; else echo "almalinux adm systemd-journal"; fi; }
    sudo() { ${opts.sudoNadal ? 'echo "User almalinux may run the following commands"' : 'echo "User almalinux is not allowed to run sudo"'}; }
    UZYTKOWNICY_OBRAZU="almalinux cloud-user ec2-user rocky centos"
  `;

  it('blokuje konto (hasło, wygaśnięcie, nologin), zdejmuje grupy i wpis sudo, inne wpisy zostają', () => {
    const d = sudoersD();
    const r = bash(`${atrapy({})}\nROLE=node; DRY_RUN=0; SUDOERS_D='${d}'\n${zablokuj}\nzablokuj_uzytkownikow_obrazu`);
    expect(r.kod).toBe(0);
    expect(r.wyjscie).toContain("RUN usermod -L -e 1 -s /sbin/nologin 'almalinux'");
    expect(r.wyjscie).toContain("RUN gpasswd -d 'almalinux' 'adm' >/dev/null");
    expect(r.wyjscie).toContain("RUN gpasswd -d 'almalinux' 'systemd-journal' >/dev/null");
    expect(r.wyjscie).toContain('RUN visudo -c >/dev/null');
    const plik = readFileSync(join(d, '90-cloud-init-users'), 'utf8');
    expect(plik).not.toMatch(/^almalinux /m);
    expect(plik).toContain('zostaje ALL=(ALL) ALL');
  });

  it('kończy się błędem, gdy sudo dalej coś pozwala (sprawdzenie skutku)', () => {
    const r = bash(`${atrapy({ sudoNadal: true })}\nROLE=node; DRY_RUN=0; SUDOERS_D='${sudoersD()}'\n${zablokuj}\nzablokuj_uzytkownikow_obrazu`);
    expect(r.kod).not.toBe(0);
  });

  it('control-plane nie jest ruszany', () => {
    const r = bash(`${atrapy({})}\nROLE=control-plane; DRY_RUN=0; SUDOERS_D='${sudoersD()}'\n${zablokuj}\nzablokuj_uzytkownikow_obrazu`);
    expect(r.kod).toBe(0);
    expect(r.wyjscie).not.toContain('RUN usermod');
  });

  it('wywołana w przebiegu hardeningu, po SSH', () => {
    expect(skrypt).toMatch(/^harden_ssh\nzablokuj_uzytkownikow_obrazu\n/m);
  });
});

describe('raport onboardu: domyślni użytkownicy obrazu', () => {
  const skrypt = czytaj('ops/scripts/node-live-readiness.sh');
  const sprawdz = funkcja(skrypt, 'sprawdz_uzytkownikow_obrazu');
  const uruchom = (sudoNadal: boolean, haslo: 'LK' | 'PS') =>
    bash(`
      log_ok() { echo "[OK] $*"; }
      log_fail() { echo "[FAIL] $*"; }
      id() { [ "$1" = almalinux ]; }
      sudo() { ${sudoNadal ? 'echo "User almalinux may run the following commands"' : 'echo "not allowed"'}; }
      passwd() { echo "almalinux ${haslo} 2026-10-19 0 99999 7 -1"; }
      ${sprawdz}
      sprawdz_uzytkownikow_obrazu`);

  it('FAIL, gdy użytkownik obrazu ma sudo albo aktywne hasło; OK po zablokowaniu', () => {
    expect(uruchom(true, 'LK').wyjscie).toContain('[FAIL] użytkownik obrazu almalinux ma sudo');
    expect(uruchom(false, 'PS').wyjscie).toContain('[FAIL] użytkownik obrazu almalinux ma aktywne hasło');
    expect(uruchom(false, 'LK').wyjscie).toContain('[OK] domyślni użytkownicy obrazu zablokowani: almalinux');
  });

  it('jest częścią weryfikacji LIVE', () => {
    expect(skrypt).toMatch(/sprawdz_tls_panelu\n {2}sprawdz_uzytkownikow_obrazu\n/);
  });
});

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * E-23 — kalendarz i kontakty (Radicale) w profilu węzła. Konfiguracja sprawdzona na Radicale 3.8.1
 * (2026-09-25): owner_only daje 403 na cudzą ścieżkę, złe hasło 401, nowa skrzynka dostaje „Kalendarz”
 * i „Kontakty”; kopia nocna zapisuje archiwum jako właściciel konta, a kalendarz usuniętej skrzynki
 * idzie do kosza na 30 dni (nowa skrzynka o tym samym adresie nie dostaje cudzych danych).
 */
const SKRYPTY = join(__dirname, '..', '..', '..', '..', 'ops', 'scripts');
const profil = readFileSync(join(SKRYPTY, 'node-hosting-profile.sh'), 'utf8');
const zapora = readFileSync(join(SKRYPTY, 'security-hardening-baseline.sh'), 'utf8');

describe('E-23 kalendarz i kontakty w profilu węzła', () => {
  it('logowanie przez Dovecot, tylko własne kolekcje, bez interfejsu WWW, TLS', () => {
    expect(profil).toMatch(/\[auth\]\ntype = dovecot\n/);
    expect(profil).toMatch(/\[rights\]\ntype = owner_only\n/);
    expect(profil).toMatch(/\[web\]\ntype = none\n/);
    expect(profil).toMatch(/hosts = 0\.0\.0\.0:5232, \[::\]:5232\nssl = True\n/);
    expect(profil).toContain('LoadCredential=key:/usr/local/directadmin/conf/cakey.pem');
  });

  it('wersja Radicale przypięta, usługa bez uprawnień roota', () => {
    expect(profil).toMatch(/dav_ver=\d+\.\d+\.\d+/);
    expect(profil).toContain('"radicale==$dav_ver"');
    expect(profil).toMatch(/User=radicale\n/);
    expect(profil).toContain('ProtectSystem=strict');
  });

  it('kopia do katalogu właściciela jako właściciel, kosz zamiast kasowania od razu', () => {
    expect(profil).toMatch(/runuser -u "\$owner" -- sh -c 'umask 077;/);
    expect(profil).toContain('KOSZ=/var/lib/radicale/usuniete');
    expect(profil).toContain('-mtime +30');
  });

  it('port 5232 otwarty w zaporze węzła (ufw i firewalld)', () => {
    expect(zapora).toContain('ufw allow 5232/tcp');
    expect(zapora).toContain('--add-port=5232/tcp');
  });
});

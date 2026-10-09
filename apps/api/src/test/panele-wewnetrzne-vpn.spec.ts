import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * Decyzja 09.10: staff.verris.pl i admin.verris.pl tylko przez VPN (WireGuard, ETAP 8).
 * Do tej pory CADDY_INTERNAL_ALLOW_CIDR puste = panele publiczne (fail-open) — domyślne „0.0.0.0/0 ::/0”
 * siedziało i w Caddyfile, i w docker-compose.prod.yml. Teraz fail-closed:
 *   - puste / nieustawione → 403 (na liście zostaje tylko 192.0.2.1, TEST-NET-1),
 *   - zakres /0–/7 (np. stary domyślny, który został w env działającego kontenera) → 403,
 *   - zła składnia → start.sh uruchamia Caddy z pustą listą (403), zamiast pętli restartów całego proxy.
 * Sprawdzone na żywym Caddy 2.11.4 w sesji (opis commita); tu strażnik w CI, bez binarki Caddy.
 */
const KORZEN = join(import.meta.dirname, '..', '..', '..', '..');
const CADDY = readFileSync(join(KORZEN, 'ops', 'caddy', 'Caddyfile'), 'utf8');
const COMPOSE = readFileSync(join(KORZEN, 'docker-compose.prod.yml'), 'utf8');
const START = join(KORZEN, 'ops', 'caddy', 'start.sh');

function blok(nazwa: string): string {
  const od = CADDY.indexOf(nazwa);
  expect(od).toBeGreaterThan(-1);
  return CADDY.slice(od, CADDY.indexOf('\n}\n', od));
}

describe('panele wewnętrzne tylko z VPN — Caddyfile', () => {
  const vpn = blok('(vpn_only) {');

  it('brak wartości domyślnej przepuszczającej wszystkich; pusta lista = tylko adres z TEST-NET-1', () => {
    expect(CADDY).not.toMatch(/\{\$CADDY_INTERNAL_ALLOW_CIDR:/);
    expect(vpn).toMatch(/@spoza_vpn not remote_ip 192\.0\.2\.1\/32 \{\$CADDY_INTERNAL_ALLOW_CIDR\}\n/);
    expect(vpn).toMatch(/import vpn_odmowa @spoza_vpn$/);
  });

  it('lista z zakresem /0–/7 (np. „0.0.0.0/0 ::/0”) zamyka panele zamiast je otwierać', () => {
    const wzorzec = /'\{\$CADDY_INTERNAL_ALLOW_CIDR\}'\.matches\('([^']+)'\)/.exec(vpn)?.[1];
    expect(wzorzec).toBeDefined();
    expect(vpn).toMatch(/import vpn_odmowa @vpn_lista_otwarta\n/);
    const za_szeroka = new RegExp(wzorzec!);
    for (const w of ['0.0.0.0/0 ::/0', '0.0.0.0/0', '::/0', '0.0.0.0/1 128.0.0.0/1', '10.88.0.0/24 0.0.0.0/0', '10.0.0.0/7']) {
      expect(za_szeroka.test(w), w).toBe(true);
    }
    for (const w of ['', '10.88.0.0/24', '10.88.0.0/24 203.0.113.7/32', '10.0.0.0/8', '2001:db8::/48', '203.0.113.7']) {
      expect(za_szeroka.test(w), w).toBe(false);
    }
  });

  it('staff, admin i GlitchTip importują vpn_only (przed reverse_proxy)', () => {
    for (const domena of ['{$CADDY_STAFF_DOMAIN', '{$CADDY_ADMIN_DOMAIN', '{$CADDY_GLITCHTIP_DOMAIN']) {
      const strona = blok(domena);
      expect(strona.indexOf('import vpn_only'), domena).toBeGreaterThan(-1);
      expect(strona.indexOf('import vpn_only')).toBeLessThan(strona.indexOf('reverse_proxy'));
    }
  });

  it('odmowa: 403, prosta strona HTML po polsku, bez nazw technologii', () => {
    const odmowa = blok('(vpn_odmowa) {');
    expect(odmowa).toMatch(/Content-Type "text\/html; charset=utf-8"/);
    const tresc = /respond \{args\[0\]\} `([^`]+)` 403/.exec(odmowa)?.[1] ?? '';
    expect(tresc).toMatch(/<html lang="pl">/);
    expect(tresc).toContain('Brak dostępu');
    expect(tresc).not.toMatch(/vpn|wireguard|caddy|docker|next|nginx|cidr|\{/i);
  });
});

describe('panele wewnętrzne tylko z VPN — docker-compose.prod.yml', () => {
  const caddy = COMPOSE.slice(COMPOSE.indexOf('\n  caddy:\n'), COMPOSE.indexOf('\n  glitchtip-migrate:\n'));

  it('domyślna wartość zmiennej jest pusta (wcześniej „0.0.0.0/0 ::/0” = panele publiczne)', () => {
    expect(caddy).toMatch(/CADDY_INTERNAL_ALLOW_CIDR: \$\{CADDY_INTERNAL_ALLOW_CIDR:-\}\n/);
    expect(COMPOSE).not.toMatch(/0\.0\.0\.0\/0/);
  });

  it('kontener startuje przez ops/caddy/start.sh (zła lista nie kładzie całego proxy)', () => {
    expect(caddy).toMatch(/command: \['\/bin\/sh', '\/etc\/caddy\/start\.sh'\]\n/);
    expect(caddy).toMatch(/- \.\/ops\/caddy:\/etc\/caddy:ro\n/);
  });
});

describe('ops/caddy/start.sh (atrapa caddy w PATH)', () => {
  let katalog: string;

  beforeAll(() => {
    katalog = mkdtempSync(join(tmpdir(), 'verris-caddy-start-'));
    // Atrapa: `validate` odrzuca listę z przecinkiem (jak Caddy złą składnię), a przy ATRAPA_CADDYFILE_ZLY=1
    // odrzuca wszystko (błąd Caddyfile niezwiązany z listą); `run` wypisuje listę, z którą wystartowałby Caddy.
    const atrapa = join(katalog, 'caddy');
    writeFileSync(
      atrapa,
      [
        '#!/bin/sh',
        'case "$1" in',
        '  validate)',
        '    [ "${ATRAPA_CADDYFILE_ZLY-}" = 1 ] && exit 1',
        '    case "${CADDY_INTERNAL_ALLOW_CIDR-}" in *,*) exit 1 ;; esac',
        '    exit 0 ;;',
        '  run) printf "RUN[%s]\\n" "${CADDY_INTERNAL_ALLOW_CIDR-}"; exit 0 ;;',
        'esac',
        'exit 2',
        '',
      ].join('\n'),
    );
    chmodSync(atrapa, 0o755);
  });

  afterAll(() => rmSync(katalog, { recursive: true, force: true }));

  function start(env: Record<string, string>) {
    const r = spawnSync('sh', [START], {
      env: { PATH: `${katalog}:/usr/bin:/bin`, CADDY_CONFIG: '/nie/istnieje/Caddyfile', ...env },
      encoding: 'utf8',
    });
    return { kod: r.status, wyjscie: r.stdout.trim(), log: r.stderr };
  }

  it('poprawna lista → Caddy startuje z nią, bez ostrzeżenia', () => {
    const r = start({ CADDY_INTERNAL_ALLOW_CIDR: '10.88.0.0/24' });
    expect(r).toMatchObject({ kod: 0, wyjscie: 'RUN[10.88.0.0/24]' });
    expect(r.log).toBe('');
  });

  it('zła składnia → start z pustą listą (403 na panelach) i głośny wpis w logu', () => {
    const r = start({ CADDY_INTERNAL_ALLOW_CIDR: '10.88.0.0/24,10.89.0.0/24' });
    expect(r).toMatchObject({ kod: 0, wyjscie: 'RUN[]' });
    expect(r.log).toMatch(/niepoprawne — panele wewnętrzne zamknięte \(403\)/);
  });

  it('błąd Caddyfile niezwiązany z listą → nie maskuje go, start jak dotąd (Caddy sam zgłosi błąd)', () => {
    const r = start({ CADDY_INTERNAL_ALLOW_CIDR: '10.88.0.0/24', ATRAPA_CADDYFILE_ZLY: '1' });
    expect(r).toMatchObject({ kod: 0, wyjscie: 'RUN[10.88.0.0/24]' });
  });
});

describe('DEPLOY.md — powrót awaryjny', () => {
  // Najgroźniejszy scenariusz to scalenie przed ustawieniem zmiennej: w .env.prod linii wtedy nie ma
  // (w .env.prod.example jest zakomentowana), więc samo `sed s#^CADDY_INTERNAL_ALLOW_CIDR=…#` nic nie
  // zmieniało i operator zostawał odcięty mimo „wykonanej” procedury.
  const deploy = readFileSync(join(KORZEN, 'DEPLOY.md'), 'utf8');
  const od = deploy.indexOf('### Awaryjnie (odciąłeś się)');
  const awaryjnie = deploy.slice(od, deploy.indexOf('\n### ', od + 1));

  it('dopisuje zmienną także wtedy, gdy w .env.prod jej jeszcze nie ma', () => {
    expect(od).toBeGreaterThan(-1);
    expect(awaryjnie).not.toMatch(/s#\^CADDY_INTERNAL_ALLOW_CIDR=/);
    expect(awaryjnie).toMatch(/sudo sed -i '\/\^CADDY_INTERNAL_ALLOW_CIDR=\/d' \.env\.prod\n/);
    expect(awaryjnie).toMatch(/printf '\\nCADDY_INTERNAL_ALLOW_CIDR="10\.88\.0\.0\/24 %s\/32"\\n' "\$MOJ_IP" \| sudo tee -a \.env\.prod\n/);
    expect(awaryjnie).toMatch(/up -d --no-deps caddy\n/);
  });
});

describe('synchronizacja peerów VPN', () => {
  it('timer na hoście nie celuje w 127.0.0.1:3000 (port api nie jest wystawiony na hoście)', () => {
    const skrypt = readFileSync(join(KORZEN, 'ops', 'scripts', 'vpn-sync-peers.sh'), 'utf8');
    expect(skrypt).toMatch(/^VPN_SYNC_API_URL=https:\/\/api\.verris\.pl$/m);
    const api = COMPOSE.slice(COMPOSE.indexOf('\n  api:\n'), COMPOSE.indexOf('\n  client-panel:\n'));
    expect(api).not.toMatch(/\n {4}ports:/);
  });
});

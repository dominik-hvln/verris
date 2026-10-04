import { spawnSync } from 'child_process';
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * PB-25 — t1 04.10: nowa poddomena wl.d3.hvln.pl pokazywała zaślepkę DirectAdmina zamiast strony Verris.
 * Hak subdomain_create_post.sh (z install-verris-default-page.sh) podmienia tylko świeżą zaślepkę.
 */
const instalator = readFileSync(join(import.meta.dirname, '..', '..', '..', '..', 'ops', 'scripts', 'install-verris-default-page.sh'), 'utf8');
const hak = instalator.slice(instalator.indexOf("<<'HOOK'\n") + 9, instalator.indexOf('\nHOOK\n') + 1);

const DIR = mkdtempSync(join(tmpdir(), 'poddomena-'));
writeFileSync(join(DIR, 'hak.sh'), hak);
mkdirSync(join(DIR, 'bin'));
// runuser -u <user> -- cmd… → cmd… (w teście bez zmiany użytkownika)
writeFileSync(join(DIR, 'bin', 'runuser'), '#!/bin/bash\nshift 3\nexec "$@"\n');
chmodSync(join(DIR, 'bin', 'runuser'), 0o755);
mkdirSync(join(DIR, 'src', 'assets'), { recursive: true });
writeFileSync(join(DIR, 'src', 'index.html'), '<title>Witamy na |DOMAIN|</title> |IP|');
writeFileSync(join(DIR, 'src', 'assets', 'logo.svg'), '<svg/>');

const katalog = (sub: string) => join(DIR, 'home', 'klient', 'domains', 'firma.pl', 'public_html', sub);
const uruchom = (sub: string) =>
  spawnSync('bash', [join(DIR, 'hak.sh')], {
    env: { PATH: `${join(DIR, 'bin')}:${process.env.PATH}`, username: 'klient', domain: 'firma.pl', subdomain: sub,
      VERRIS_HOME_BASE: join(DIR, 'home'), VERRIS_DEFAULT_PAGE_DIR: join(DIR, 'src') },
    encoding: 'utf8',
  });
const zaslepka = (sub: string, inne = false) => {
  mkdirSync(katalog(sub), { recursive: true });
  writeFileSync(join(katalog(sub), 'index.html'), 'Jest to symbol zastępczy subdomeny');
  if (inne) writeFileSync(join(katalog(sub), 'app.php'), '<?php // klienta');
};

describe('hak poddomeny — strona Verris zamiast zaślepki DA', () => {
  it('świeża zaślepka → strona Verris z pełną nazwą poddomeny i zasobami', () => {
    zaslepka('sklep');
    expect(uruchom('sklep').status).toBe(0);
    expect(readFileSync(join(katalog('sklep'), 'index.html'), 'utf8')).toContain('Witamy na sklep.firma.pl');
    expect(existsSync(join(katalog('sklep'), 'assets', 'logo.svg'))).toBe(true);
  });

  it('katalog z plikami klienta → nic nie zmienia', () => {
    zaslepka('app', true);
    uruchom('app');
    expect(readFileSync(join(katalog('app'), 'index.html'), 'utf8')).toBe('Jest to symbol zastępczy subdomeny');
  });

  it('podejrzana nazwa poddomeny → nic nie robi', () => {
    zaslepka('x');
    expect(uruchom('x;rm').status).toBe(0);
    expect(uruchom('../x').status).toBe(0);
    expect(readFileSync(join(katalog('x'), 'index.html'), 'utf8')).toBe('Jest to symbol zastępczy subdomeny');
  });

  it('układ DA 1.710: domains/<sub>.<domena>/public_html (t1 04.10 — tam DA kładzie zaślepkę)', () => {
    const d = join(DIR, 'home', 'klient', 'domains', 'nowa.firma.pl', 'public_html');
    mkdirSync(d, { recursive: true });
    writeFileSync(join(d, 'index.html'), 'Jest to symbol zastępczy subdomeny');
    mkdirSync(join(d, 'cgi-bin')); // DA 1.710 zakłada też pusty cgi-bin
    expect(uruchom('nowa').status).toBe(0);
    expect(readFileSync(join(d, 'index.html'), 'utf8')).toContain('Witamy na nowa.firma.pl');
  });

  it('cgi-bin z plikiem klienta → nic nie zmienia', () => {
    const d = join(DIR, 'home', 'klient', 'domains', 'cgi.firma.pl', 'public_html');
    mkdirSync(join(d, 'cgi-bin'), { recursive: true });
    writeFileSync(join(d, 'index.html'), 'Jest to symbol zastępczy subdomeny');
    writeFileSync(join(d, 'cgi-bin', 'skrypt.pl'), '#!/usr/bin/perl');
    uruchom('cgi');
    expect(readFileSync(join(d, 'index.html'), 'utf8')).toBe('Jest to symbol zastępczy subdomeny');
  });

  it('instalator nie nadpisuje cudzego haka i woła instalację haka', () => {
    expect(instalator).toMatch(/grep -q 'verris-pb25' "\$hook"/);
    expect(instalator).toMatch(/^install_subdomain_hook$/m);
  });
});

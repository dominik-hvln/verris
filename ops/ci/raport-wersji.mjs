#!/usr/bin/env node
/**
 * PB-38 fala 4 — tygodniowy raport wersji (decyzja właściciela 2026-09-26: raport + aktualizacje falami).
 *
 * Dependabot nie obsługuje pnpm 11+, więc to jest nasze źródło wiedzy o nowych wersjach paczek npm:
 *   · `pnpm outdated -r` → co ma nowszą wersję stabilną (wersje przedpremierowe pomijamy),
 *   · ops/ci/wersje-wstrzymane.json → świadome wstrzymania (z powodem i terminem przeglądu),
 *   · ops/ci/wersje-eol.json → ile dni zostało do końca wsparcia środowisk, na których stoimy,
 *   · docker-compose.prod.yml → obrazy infrastruktury (dla kafla na tablicy).
 *
 * Wynik: markdown na stdout (i do GITHUB_STEP_SUMMARY w Actions). Z `--zapisz` także
 * audyt/dane/wersje.json — z niego generate.py buduje kafel „Wersje” na tablicy planu.
 *
 * Uruchomienie:  node ops/ci/raport-wersji.mjs [--zapisz]
 */
import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const KORZEN = join(import.meta.dirname, '..', '..');
const czytajJson = (p) => JSON.parse(readFileSync(join(KORZEN, p), 'utf8'));

/** major | minor | patch | przedpremierowa — różnica między wersjami semver. */
export function poziom(obecna, najnowsza) {
  if (/-/.test(najnowsza)) return 'przedpremierowa';
  const [a, b] = [obecna, najnowsza].map((v) => v.replace(/^[^\d]*/, '').split('.').map(Number));
  if (b[0] !== a[0]) return 'major';
  if (b[1] !== a[1]) return 'minor';
  return 'patch';
}

export function dniDo(data, dzis = new Date()) {
  return Math.floor((new Date(`${data}T00:00:00Z`) - dzis) / 86_400_000);
}

function przestarzale() {
  let wyjscie;
  try {
    wyjscie = execFileSync('pnpm', ['outdated', '-r', '--format', 'json'], { cwd: KORZEN, encoding: 'utf8' });
  } catch (e) {
    // `pnpm outdated` kończy się kodem 1, gdy cokolwiek jest do podniesienia — to nie błąd.
    wyjscie = e.stdout;
    if (!wyjscie) throw e;
  }
  return JSON.parse(wyjscie || '{}');
}

function obrazyInfrastruktury() {
  const compose = readFileSync(join(KORZEN, 'docker-compose.prod.yml'), 'utf8');
  const wynik = [];
  let usluga = null;
  for (const l of compose.split('\n')) {
    const u = /^ {2}([a-z0-9-]+):\s*$/.exec(l);
    if (u) usluga = u[1];
    const o = /^ {4}image:\s*(\S+)/.exec(l);
    if (o && usluga && !o[1].includes('verris-api')) wynik.push({ usluga, obraz: o[1].replace(/^\$\{[^}]+\}\//, '') });
  }
  return wynik;
}

function main() {
  const dzis = new Date();
  const { wstrzymane } = czytajJson('ops/ci/wersje-wstrzymane.json');
  const eolDane = czytajJson('ops/ci/wersje-eol.json');
  const nvmrc = readFileSync(join(KORZEN, '.nvmrc'), 'utf8').trim();
  const compose = readFileSync(join(KORZEN, 'docker-compose.prod.yml'), 'utf8');
  const pg = /image: postgres:(\d+)/.exec(compose)?.[1];

  const deklarowane = [
    ['Node.js', 'node', nvmrc],
    ['PostgreSQL', 'postgres', pg],
    ['Debian (obrazy API i paneli)', 'debian', 'trixie'],
    ['Alpine (obraz MinIO)', 'alpine', '3.24'],
  ];
  const eol = deklarowane.map(([nazwa, klucz, wersja]) => {
    const w = eolDane.srodowiska[klucz]?.[wersja];
    return { nazwa, wersja, koniec: w?.koniec ?? null, dni: w ? dniDo(w.koniec, dzis) : null, zrodlo: w?.zrodlo ?? null };
  });

  const doZrobienia = [];
  const wstrzymaneAkt = [];
  const przedpremierowe = [];
  for (const [pakiet, i] of Object.entries(przestarzale())) {
    const p = poziom(i.current, i.latest);
    const gdzie = (i.dependentPackages ?? []).map((d) => d.name);
    const wpis = { pakiet, obecna: i.current, najnowsza: i.latest, poziom: p, gdzie };
    if (p === 'przedpremierowa') { przedpremierowe.push(wpis); continue; }
    const w = wstrzymane.find((x) => x.pakiet === pakiet && x.poziom === p);
    if (w) wstrzymaneAkt.push({ ...wpis, powod: w.powod, przeglad: w.przeglad, pozycja: w.pozycja });
    else doZrobienia.push(wpis);
  }
  // Wstrzymanie, którego przyczyny już nie ma (pakiet nie ma nowszej wersji tego poziomu), też jest sygnałem.
  const zbedne = wstrzymane
    .filter((w) => !wstrzymaneAkt.some((a) => a.pakiet === w.pakiet) && !przedpremierowe.some((a) => a.pakiet === w.pakiet))
    .map((w) => w.pakiet);

  const raport = {
    sprawdzono: dzis.toISOString().slice(0, 10),
    eol,
    doZrobienia,
    wstrzymane: wstrzymaneAkt,
    przedpremierowe,
    zbedneWstrzymania: zbedne,
    obrazy: obrazyInfrastruktury(),
  };

  const md = [
    `## Raport wersji — ${raport.sprawdzono}`,
    '',
    '### Koniec wsparcia środowisk',
    '| Środowisko | Wersja | Koniec wsparcia | Zostało dni |',
    '|---|---|---|---|',
    ...eol.map((e) => `| ${e.nazwa} | ${e.wersja} | ${e.koniec ?? '**brak w ops/ci/wersje-eol.json**'} | ${e.dni ?? '—'} |`),
    '',
    `### Do podniesienia (${doZrobienia.length})`,
    ...(doZrobienia.length
      ? ['| Paczka | Obecna | Najnowsza | Poziom | Gdzie |', '|---|---|---|---|---|',
         ...doZrobienia.map((d) => `| ${d.pakiet} | ${d.obecna} | ${d.najnowsza} | ${d.poziom} | ${d.gdzie.join(', ')} |`)]
      : ['Wszystko na najnowszych wersjach stabilnych.']),
    '',
    `### Świadomie wstrzymane (${wstrzymaneAkt.length})`,
    ...wstrzymaneAkt.map((w) => `- **${w.pakiet}** ${w.obecna} → ${w.najnowsza} (${w.pozycja}, przegląd ${w.przeglad}): ${w.powod}`),
    ...(zbedne.length ? ['', `**Wstrzymania do usunięcia** (przyczyna zniknęła): ${zbedne.join(', ')}`] : []),
    '',
  ].join('\n');

  process.stdout.write(`${md}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md}\n`);
  if (process.argv.includes('--zapisz')) {
    writeFileSync(join(KORZEN, 'audyt', 'dane', 'wersje.json'), `${JSON.stringify(raport, null, 2)}\n`);
  }
}

if (import.meta.filename === process.argv[1]) main();

#!/usr/bin/env node
/**
 * X-23 — bramka podatności, która naprawdę zatrzymuje.
 *
 * Do 2026-08-22 krok `pnpm audit --prod --audit-level high` w jobie
 * `security-scans` miał `continue-on-error: true`. Powód był praktyczny:
 * w drzewie siedzi jedna wysoka podatność (deepmerge-ts przez Prismę 6),
 * której nie da się dziś domknąć — patrz X-20. Bez `continue-on-error`
 * każdy przebieg CI byłby czerwony, więc ktoś (ja) wyłączył alarm.
 *
 * Skutek: NOWA krytyczna podatność też nie zatrzymałaby wdrożenia. Job
 * świecił się na zielono z adnotacją „exit code 1", której nikt nie czyta.
 * To ta sama klasa błędu co X-17 — bramka, która nie bramkuje.
 *
 * Ten skrypt zastępuje `continue-on-error` listą świadomych zgód:
 *
 *   · nowa wysoka/krytyczna podatność spoza listy  → CZERWONE,
 *   · zgoda po terminie ważności                   → CZERWONE,
 *   · zgoda na podatność, której już nie ma        → CZERWONE (lista ma być prawdziwa),
 *   · wszystko inne                                → zielone.
 *
 * Trzeci przypadek jest równie ważny co pierwszy. Lista wyjątków, z której
 * nic nigdy nie znika, po pół roku przestaje cokolwiek znaczyć.
 *
 * Uruchomienie:  node ops/ci/audyt-bramka.cjs
 */
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');

const LISTA = join(__dirname, 'podatnosci-dopuszczone.json');
const POZIOMY_BLOKUJACE = new Set(['high', 'critical']);

/** Zgody starsze niż to i tak wygasają — nawet jeśli ktoś wpisał dalszą datę. */
const MAKS_DNI_ZGODY = 90;

function dniMiedzy(a, b) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/**
 * @param {Array<{severity:string, github_advisory_id?:string, module_name:string}>} znalezione
 * @param {Array<{advisory:string, modul:string, powod:string, pozycja:string, wazneDo:string}>} zgody
 * @param {Date} dzis
 */
function ocen(znalezione, zgody, dzis) {
  const blokujace = znalezione.filter((z) => POZIOMY_BLOKUJACE.has(z.severity));
  const wgId = new Map(zgody.map((z) => [z.advisory, z]));
  const uzyte = new Set();

  const bezZgody = [];
  const poTerminie = [];
  for (const z of blokujace) {
    const zgoda = wgId.get(z.github_advisory_id ?? '');
    if (!zgoda) {
      bezZgody.push(z);
      continue;
    }
    uzyte.add(zgoda.advisory);
    const koniec = new Date(zgoda.wazneDo);
    if (Number.isNaN(koniec.getTime()) || koniec < dzis) {
      poTerminie.push({ zgoda, dni: dniMiedzy(koniec, dzis) });
    }
  }

  const nieuzyte = zgody.filter((z) => !uzyte.has(z.advisory));
  return { blokujace, bezZgody, poTerminie, nieuzyte };
}

function czyZgodaZaDluga(zgoda, dzis) {
  const koniec = new Date(zgoda.wazneDo);
  return !Number.isNaN(koniec.getTime()) && dniMiedzy(dzis, koniec) > MAKS_DNI_ZGODY;
}

function pobierzAudyt() {
  let surowe = '';
  try {
    surowe = execFileSync('pnpm', ['audit', '--prod', '--json'], {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
  } catch (e) {
    // `pnpm audit` kończy się kodem != 0, gdy cokolwiek znajdzie. To nie jest
    // błąd wykonania — treść i tak leci na stdout.
    surowe = /** @type {{stdout?: string}} */ (e).stdout ?? '';
    if (!surowe) throw e;
  }
  const d = JSON.parse(surowe);
  return Object.values(d.advisories ?? {});
}

function main() {
  const znalezione = pobierzAudyt();
  const zgody = JSON.parse(readFileSync(LISTA, 'utf8')).zgody;
  const dzis = new Date();
  const { blokujace, bezZgody, poTerminie, nieuzyte } = ocen(znalezione, zgody, dzis);

  console.log(`Podatności blokujące (high/critical): ${blokujace.length}`);
  for (const z of blokujace) {
    const zgoda = zgody.find((g) => g.advisory === z.github_advisory_id);
    console.log(
      `  ${z.severity.toUpperCase().padEnd(8)} ${z.module_name.padEnd(24)} ` +
        `${z.github_advisory_id ?? '(bez id)'}` +
        (zgoda ? `  — zgoda do ${zgoda.wazneDo} (${zgoda.pozycja})` : '  — BEZ ZGODY'),
    );
  }

  const problemy = [];

  for (const z of bezZgody) {
    problemy.push(
      `NOWA podatność ${z.severity} w ${z.module_name} (${z.github_advisory_id ?? 'bez id'}).\n` +
        `   ${z.title ?? ''}\n` +
        `   ${z.url ?? ''}\n` +
        `   Napraw ją, albo — jeśli naprawdę nie da się dziś — dopisz świadomą zgodę\n` +
        `   do ops/ci/podatnosci-dopuszczone.json z powodem, pozycją w macierzy\n` +
        `   i terminem ważności. Zgoda bez terminu nie przejdzie.`,
    );
  }

  for (const { zgoda, dni } of poTerminie) {
    problemy.push(
      `Zgoda na ${zgoda.advisory} (${zgoda.modul}) wygasła ${dni} dni temu ` +
        `(termin: ${zgoda.wazneDo}, pozycja: ${zgoda.pozycja}).\n` +
        `   Albo podatność jest już domknięta i zgodę trzeba usunąć, albo trzeba\n` +
        `   świadomie przedłużyć termin. Milczące przedłużanie to nie jest decyzja.`,
    );
  }

  for (const zgoda of nieuzyte) {
    problemy.push(
      `Zgoda na ${zgoda.advisory} (${zgoda.modul}) dotyczy podatności, której już nie ma.\n` +
        `   Usuń ją z ops/ci/podatnosci-dopuszczone.json — lista wyjątków, z której\n` +
        `   nic nigdy nie znika, po pół roku przestaje cokolwiek znaczyć.`,
    );
  }

  for (const zgoda of zgody) {
    if (czyZgodaZaDluga(zgoda, dzis)) {
      problemy.push(
        `Zgoda na ${zgoda.advisory} sięga dalej niż ${MAKS_DNI_ZGODY} dni ` +
          `(${zgoda.wazneDo}). Skróć termin — zgoda „na zawsze" to usunięcie bramki\n` +
          `   pod inną nazwą.`,
      );
    }
  }

  if (problemy.length > 0) {
    console.error('\n═══ BRAMKA PODATNOŚCI: CZERWONE ═══\n');
    for (const p of problemy) console.error(` • ${p}\n`);
    process.exit(1);
  }

  console.log(
    `\nBramka podatności: zielone. ${zgody.length} świadomych zgód, wszystkie w terminie.`,
  );
}

module.exports = { ocen, czyZgodaZaDluga, dniMiedzy, MAKS_DNI_ZGODY, POZIOMY_BLOKUJACE };

// Uruchomienie wprost (`node ops/ci/audyt-bramka.cjs`) odpala bramkę.
// `require()` z testu tylko wystawia funkcje — bez wołania `pnpm audit`.
if (require.main === module) main();

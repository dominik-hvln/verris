import { execFileSync } from 'child_process';
import { mkdtempSync, writeFileSync, chmodSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

/**
 * X-33 — bramka, która myliła „nie ma" z „jeszcze nie ma".
 *
 * JAK TO WYSZŁO. Wdrożenie #70 padło na bramce z `X-30` przy CZTERNASTU
 * działających regułach alertowych. Oś czasu z logu:
 *
 *   15:43:09  compose restart prometheus grafana
 *   15:43:15  /api/health OK   → bramka uznała, że obserwowalność wstała
 *   15:43:16  odczyt /metrics  → zero → FAIL
 *
 * Powód siedzi w kodzie Grafany 10.4.2: `grafana_alerting_rule_group_rules`
 * to GaugeVec z etykietami `org` i `state`, ustawiany w `processTick()` —
 * na pierwszym takcie schedulera alertów, nie przy starcie procesu. Do tego
 * momentu metryki NIE MA W /metrics ANI JEDNEJ LINII. Suma z pustki daje zero
 * i wygląda identycznie jak katastrofa. Domyślny takt to 10 s, `/api/health`
 * odpowiedziało po 6.
 *
 * O werdykcie bramki decydowała więc szybkość startu, a nie stan systemu.
 * Wdrożenia #68 i #69 wygrały ten wyścig, #70 przegrało.
 *
 * DLACZEGO TO GORSZE NIŻ JEDEN CZERWONY DEPLOY. Bramka, która potrafi zapalić
 * się na zdrowym systemie, uczy człowieka klikać „re-run". Od tego momentu nie
 * chroni już niczego — a nadal wygląda, jakby chroniła.
 *
 * DLACZEGO TEN TEST WYGLĄDA INACZEJ NIŻ POPRZEDNIE. Strażnik X-28 sprawdzał,
 * że uid w rules.yaml WYSTĘPUJE w datasources.yml — plik był zgodny z plikiem,
 * a system nie działał. Nie powtarzam tego błędu: ten test NIE czyta skryptu
 * wdrożeniowego w poszukiwaniu słowa „sleep". Uruchamia PRAWDZIWĄ logikę bramki
 * w bashu i podstawia jej atrapę Grafany, która zachowuje się dokładnie tak,
 * jak zachowała się Grafana 23 sierpnia o 15:43:16.
 *
 * Czego ten test NADAL nie dowodzi: że na produkcji jest dobrze. To zrobi
 * dopiero zielony deploy — dowód D3.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const BIBLIOTEKA = join(KORZEN, 'ops', 'scripts', 'lib', 'bramka-regul-alertowych.sh');
const REGULY_YAML = join(
  KORZEN,
  'ops',
  'observability',
  'grafana',
  'provisioning',
  'alerting',
  'rules.yaml',
);

/** Metryki, jakie Grafana publikuje, gdy scheduler już tyknął. */
function metrykiZReguami(aktywne: number, wstrzymane = 0): string {
  return [
    '# HELP grafana_alerting_rule_group_rules The number of alert rules that are scheduled.',
    '# TYPE grafana_alerting_rule_group_rules gauge',
    `grafana_alerting_rule_group_rules{org="1",state="active"} ${aktywne}`,
    `grafana_alerting_rule_group_rules{org="1",state="paused"} ${wstrzymane}`,
  ].join('\n');
}

/** Metryki sprzed pierwszego taktu — metryki NIE MA, są za to inne. */
const METRYKI_PRZED_TAKTEM = [
  '# HELP go_goroutines Number of goroutines that currently exist.',
  'go_goroutines 142',
  'grafana_alerting_scheduler_behind_seconds 0',
].join('\n');

type Wynik = { kod: number; powod: string; aktywne: string };

/**
 * Uruchamia PRAWDZIWĄ funkcję `czekaj_na_reguly` z atrapą Grafany, która
 * zwraca kolejne odpowiedzi z listy (ostatnia powtarza się w nieskończoność).
 */
function uruchomBramke(oczekiwane: number, odpowiedzi: string[]): Wynik {
  const kat = mkdtempSync(join(tmpdir(), 'x33-'));
  try {
    odpowiedzi.forEach((tresc, i) => writeFileSync(join(kat, `odp-${i}`), tresc));

    // Atrapa Grafany: przy N-tym wywołaniu oddaje N-tą odpowiedź.
    const atrapa = join(kat, 'grafana-atrapa.sh');
    writeFileSync(
      atrapa,
      [
        '#!/usr/bin/env bash',
        `LICZNIK="${join(kat, 'licznik')}"`,
        'N="$(cat "$LICZNIK" 2>/dev/null || echo 0)"',
        'echo "$((N + 1))" > "$LICZNIK"',
        `OSTATNIA=${odpowiedzi.length - 1}`,
        '[ "$N" -gt "$OSTATNIA" ] && N="$OSTATNIA"',
        `cat "${join(kat, 'odp-')}$N"`,
        '',
      ].join('\n'),
    );
    chmodSync(atrapa, 0o755);

    const skrypt = [
      'set -u',
      `. "${BIBLIOTEKA}"`,
      // Bez tego test czekałby minutę zamiast ułamka sekundy — a mierzymy
      // LOGIKĘ czekania, nie długość snu.
      'export BRAMKA_REGUL_PROBY=6',
      'export BRAMKA_REGUL_ODSTEP=0',
      `if czekaj_na_reguly ${oczekiwane} "${atrapa}"; then KOD=0; else KOD=1; fi`,
      'echo "KOD=$KOD"',
      'echo "AKTYWNE=$BRAMKA_REGUL_AKTYWNE"',
      'echo "POWOD=$BRAMKA_REGUL_POWOD"',
      '',
    ].join('\n');

    const out = execFileSync('bash', ['-c', skrypt], { encoding: 'utf8' });
    return {
      kod: Number(/KOD=(\d+)/.exec(out)?.[1] ?? -1),
      aktywne: /AKTYWNE=(.*)/.exec(out)?.[1]?.trim() ?? '',
      powod: /POWOD=(.*)/.exec(out)?.[1]?.trim() ?? '',
    };
  } finally {
    rmSync(kat, { recursive: true, force: true });
  }
}

describe('X-33 — bramka czeka na scheduler, zamiast ścigać się z nim', () => {
  it('biblioteka bramki istnieje jako osobny, testowalny plik', () => {
    // Dopóki logika siedziała w skrypcie wdrożeniowym, jedyną możliwą asercją
    // było „w pliku występuje słowo sleep" — czyli plik zgodny z plikiem.
    expect(() => uruchomBramke(1, [metrykiZReguami(1)])).not.toThrow();
  });

  it('PRZYPADEK #70: metryki jeszcze nie ma, potem się pojawia — PRZECHODZI', () => {
    // To jest dokładnie 15:43:16. Stara bramka czytała raz i mówiła „zero
    // reguł". Nowa czeka na pierwszy takt schedulera.
    const w = uruchomBramke(14, [
      METRYKI_PRZED_TAKTEM,
      METRYKI_PRZED_TAKTEM,
      METRYKI_PRZED_TAKTEM,
      metrykiZReguami(14),
    ]);
    expect(w.kod).toBe(0);
    expect(w.aktywne).toBe('14');
  });

  it('metryka, która NIGDY się nie pojawia, kończy się błędem o schedulerze', () => {
    // Czekanie nie może być czekaniem w nieskończoność. I powód musi wskazywać
    // scheduler, a nie prowizjonowanie — to dwie różne naprawy.
    const w = uruchomBramke(14, [METRYKI_PRZED_TAKTEM]);
    expect(w.kod).toBe(1);
    expect(w.powod).toMatch(/nie opublikowała metryki/i);
    expect(w.powod).toMatch(/scheduler/i);
  });

  it('metryka obecna i naprawdę zerowa to CO INNEGO niż jej brak', () => {
    // Sedno całej pozycji. Linia z zerem znaczy „scheduler tyknął i nie
    // znalazł reguł" — to prawdziwa awaria prowizjonowania i musi mieć inny
    // komunikat niż wyścig ze startem.
    const w = uruchomBramke(14, [metrykiZReguami(0)]);
    expect(w.kod).toBe(1);
    expect(w.powod).toMatch(/CZĘŚCIOWE|0 z 14/i);
    expect(w.powod).not.toMatch(/nie opublikowała metryki/i);
  });

  it('prowizjonowanie CZĘŚCIOWE nie przechodzi, choć reguł jest więcej niż zero', () => {
    // Stary warunek brzmiał „> 0". Dziewięć reguł z czternastu przechodziło
    // na zielono i nikt by się nie dowiedział, że pięciu alertów nie ma.
    const w = uruchomBramke(14, [metrykiZReguami(9)]);
    expect(w.kod).toBe(1);
    expect(w.powod).toMatch(/9 z 14/);
  });

  it('reguła w stanie paused jest wczytana, ale NIE LICZY SIĘ — więc blokuje', () => {
    const w = uruchomBramke(14, [metrykiZReguami(13, 1)]);
    expect(w.kod).toBe(1);
    expect(w.powod).toMatch(/paused/i);
  });

  it('komplet reguł, zero wstrzymanych — przechodzi za pierwszym razem', () => {
    const w = uruchomBramke(14, [metrykiZReguami(14)]);
    expect(w.kod).toBe(0);
    expect(w.powod).toMatch(/próba 1/i);
  });

  it('liczba odniesienia jest liczona z rules.yaml, a nie wpisana w skrypt', () => {
    // Gdyby „14" stało w skrypcie wdrożeniowym, byłoby to SZÓSTE bliźniacze
    // miejsce w tym projekcie (Z-12, Z-16, M-06, X-24, H-24): jedna reguła
    // w dwóch kopiach, z których ktoś kiedyś zaktualizuje tylko jedną.
    const wynik = execFileSync(
      'bash',
      ['-c', `. "${BIBLIOTEKA}"; policz_reguly_w_pliku "${REGULY_YAML}"`],
      { encoding: 'utf8' },
    ).trim();

    const zPliku = require('fs')
      .readFileSync(REGULY_YAML, 'utf8')
      .split('\n')
      .filter((l: string) => /^\s*-\s+uid:\s/.test(l)).length;

    expect(Number(wynik)).toBe(zPliku);
    expect(Number(wynik)).toBeGreaterThan(0);
  });

  it('okno czekania ma TRZYKROTNY zapas nad tym, co zmierzyliśmy na produkcji', () => {
    // Wdrożenie #71 — pierwsze z tą bramką — przeszło na „próbie 17", czyli po
    // 54 sekundach. Zakładałem dziesięć. Zapas wynosił trzy próby.
    //
    // Ta asercja pilnuje, żeby nikt (łącznie ze mną za pół roku) nie skrócił
    // okna z powrotem „bo deploy trwa długo". Deploy NIE trwa dłużej: pętla
    // kończy się w chwili, w której reguły się zgadzają. Dłuższe okno kosztuje
    // wyłącznie przy prawdziwej awarii prowizjonowania.
    const ZMIERZONE_S = 54;
    const okno = Number(
      execFileSync('bash', ['-c', `. "${BIBLIOTEKA}"; okno_bramki_sekundy`], {
        encoding: 'utf8',
      }).trim(),
    );
    expect(okno).toBeGreaterThanOrEqual(ZMIERZONE_S * 3);
  });

  it('log wdrożenia podaje PRAWDZIWE okno, a nie liczbę wpisaną obok', () => {
    // Gdyby skrypt miał własną liczbę w komunikacie, log mówiłby „do 60 s"
    // jeszcze długo po zmianie bramki — i okłamałby pierwszą osobę, która
    // czyta go w trakcie awarii. Klasyczne bliźniacze miejsce.
    const skrypt = require('fs').readFileSync(
      join(KORZEN, 'ops', 'scripts', 'prod-deploy-ghcr.sh'),
      'utf8',
    );
    expect(skrypt).toContain('okno_bramki_sekundy');
    expect(skrypt).not.toMatch(/oczekuj[eę].*regu[łl].*do \d+ s/);
  });

  it('skrypt wdrożeniowy używa tej biblioteki, a nie własnej kopii logiki', () => {
    // Bez tej asercji biblioteka mogłaby być zielona i nieużywana — a bramka
    // na produkcji nadal ścigałaby się ze schedulerem.
    const skrypt = require('fs').readFileSync(
      join(KORZEN, 'ops', 'scripts', 'prod-deploy-ghcr.sh'),
      'utf8',
    );
    expect(skrypt).toContain('ops/scripts/lib/bramka-regul-alertowych.sh');
    expect(skrypt).toContain('czekaj_na_reguly');
    expect(skrypt).toContain('policz_reguly_w_pliku');
    // Stary, jednorazowy odczyt nie może zostać obok nowego — dwa sprawdzenia
    // tej samej rzeczy to znów bliźniacze miejsce.
    expect(skrypt).not.toContain('Grafana nie ma ANI JEDNEJ reguły');
  });
});

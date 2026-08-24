import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-35 — reguła, która nie umiała powiedzieć „jest dobrze".
 *
 * CO SIĘ STAŁO. `VerrisPostgresBackupStale` — jedyna reguła `critical`
 * dotycząca kopii bazy — paliła się nieprzerwanie przez trzy tygodnie przy
 * w pełni zdrowym backupie. Zapytanie na produkcji 2026-08-24:
 *
 *   verris_backup_present == 0 or verris_backup_latest_age_seconds > 90000
 *   → {"resultType":"vector","result":[]}
 *
 * W PromQL `==` i `>` to FILTRY, nie predykaty. Zdrowy stan nie przechodzi
 * przez żaden, więc wynikiem jest PUSTY WEKTOR. Grafana nazywa to NoData,
 * a ta reguła miała `noDataState: Alerting`.
 *
 * DLACZEGO `noDataState` TO NIEWŁAŚCIWA DŹWIGNIA — i to jest sedno, którego
 * ten strażnik pilnuje. To pole nie umie odróżnić dwóch PRZECIWNYCH powodów
 * pustki: „filtr nikogo nie przepuścił, bo jest dobrze" i „metryki nie ma".
 * Każda jego wartość jest błędna w jednym z dwóch przypadków:
 *
 *   OK       → zdrowie czytane dobrze, martwy eksporter MILCZY   (13 reguł)
 *   Alerting → martwy eksporter czytany dobrze, zdrowie ALARMUJE (1 reguła)
 *
 * Plik miał obie wady naraz, każdą po innej stronie. Przestawienie dźwigni
 * zamieniłoby jedną na drugą — dokładnie to zrobił autor nadkorekty po `H-23`.
 * Rozwiązaniem jest wyrażenie CAŁKOWITE (zwraca próbkę zawsze) plus osobne
 * reguły `absent()` na ciszę eksportera.
 *
 * DLACZEGO TEN TEST SPRAWDZA SAM SIEBIE. Strażnik `X-28` porównywał plik
 * z plikiem: uid w rules.yaml występował w datasources.yml, test świecił na
 * zielono, a system nie działał. `X-34` dołożył drugą lekcję: atrapa musi
 * sięgać progu, na którym usterka żyje, inaczej asercje nie mają czego złapać.
 *
 * Dlatego logika sprawdzająca jest tu WYCIĄGNIĘTA DO FUNKCJI i puszczana
 * przez DWA wejścia: prawdziwy rules.yaml (ma przejść) oraz FIXTURE
 * odtwarzający regułę sprzed X-35 (ma zostać ODRZUCONY, z konkretnym powodem).
 * Test bez tego drugiego wejścia nie dowodziłby, że sprawdzenie w ogóle działa
 * — dowodziłby tylko, że dzisiejszy plik go nie wyzwala.
 *
 * CZEGO TEN TEST NIE DOWODZI. Że na produkcji jest dobrze. Asercje są
 * strukturalne, nie wykonują PromQL. Dowód, że nowe wyrażenie faktycznie
 * zwraca jedną próbkę o wartości 0, pochodzi z zapytania do żywego Prometheusa
 * i jest zapisany w docs/zadania/X-35 jako D2. Tutaj pilnujemy wyłącznie tego,
 * żeby usterka nie wróciła tą samą drogą.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const REGULY_YAML = join(
  KORZEN,
  'ops',
  'observability',
  'grafana',
  'provisioning',
  'alerting',
  'rules.yaml',
);
const METRICS_SERVICE = join(
  KORZEN,
  'apps',
  'api',
  'src',
  'observability',
  'metrics.service.ts',
);

// ── Model reguły wyciągnięty z pliku ────────────────────────────────────────
// Bez js-yaml (nie ma go w zależnościach API), za to na blokach `- uid:`,
// których format w tym pliku jest jednolity od czasu migracji z X-28.
interface Regula {
  uid: string;
  expr: string;
  noDataState: string;
}

export function wczytajReguly(tresc: string): Regula[] {
  const bloki = tresc.split(/^ {2}- uid: /m).slice(1);
  return bloki.map((blok) => {
    const uid = blok.split('\n')[0].trim();
    // `expr:` bywa złamany na dwie linie przez zawijanie YAML — sklejamy
    // kontynuacje (wcięcie głębsze niż `expr:`) w jeden ciąg.
    const linie = blok.split('\n');
    const i = linie.findIndex((l) => /^\s+expr:\s/.test(l));
    let expr = i === -1 ? '' : linie[i].replace(/^\s+expr:\s/, '').trim();
    for (let j = i + 1; j < linie.length && i !== -1; j++) {
      if (/^\s{10,}\S/.test(linie[j]) && !/^\s+\w+:/.test(linie[j])) {
        expr += ' ' + linie[j].trim();
      } else break;
    }
    const nd = blok.match(/^\s+noDataState:\s*(\S+)/m);
    return { uid, expr, noDataState: nd ? nd[1] : '' };
  });
}

// ── Sedno: czy wyrażenie potrafi zwrócić pustkę przy ZDROWYM systemie ───────
// Porównanie bez modyfikatora `bool` filtruje: zdrowy stan znika z wyniku.
// Z `bool` zwraca 0/1, czyli próbka istnieje zawsze.
export function jestFiltrem(expr: string): boolean {
  const bezBool = expr.replace(/(==|!=|>=|<=|>|<)\s*bool\b/g, ' ');
  return /(==|!=|>=|<=|>|<)/.test(bezBool);
}

export interface Zarzut {
  uid: string;
  powod: string;
}

/**
 * Jedyna wada, której ten strażnik pilnuje w regułach warunkowych:
 * wyrażenie filtrujące + `noDataState: Alerting` = alarm na zdrowym systemie.
 */
export function znajdzReguleKtoraAlarmujeNaZdrowiu(reguly: Regula[]): Zarzut[] {
  return reguly
    .filter((r) => r.noDataState === 'Alerting' && jestFiltrem(r.expr))
    .map((r) => ({
      uid: r.uid,
      powod:
        'wyrazenie filtruje (porownanie bez `bool`), wiec zdrowy stan zwraca ' +
        'pusty wektor — a `noDataState: Alerting` zamienia pustke w alarm',
    }));
}

// ── Granice emisji metryk ───────────────────────────────────────────────────
// Nie „po jednym strażniku ciszy na regułę" (byłoby ich trzynaście i mail
// o jednej awarii przyszedłby trzynaście razy — X-28 od nowa), tylko po jednym
// na MIEJSCE, w którym emisja może zniknąć niezależnie od reszty.
const GRANICE_EMISJI: Array<{
  straz: string;
  sentinel: string | null;
  powod?: string;
}> = [
  {
    straz: 'this.provisioningQueue',
    sentinel: 'verris_provisioning_queue_oldest_waiting_seconds',
  },
  { straz: 'this.objectStorage', sentinel: 'verris_backup_present' },
  {
    straz: 'this.runtimeErrors',
    sentinel: null,
    powod:
      'licznik — brak metryki znaczy „nic jej nie zwiekszylo", nie slepote. ' +
      'Pilnuje go obecnosc calego eksportera.',
  },
  {
    straz: 'this.httpMetrics',
    sentinel: null,
    powod: 'j.w. — histogramy HTTP pojawiaja sie dopiero po pierwszym ruchu.',
  },
];

const SENTINEL_CALEGO_EKSPORTERA = 'verris_process_uptime_seconds';

describe('X-35 — reguły alertowe nie mylą pustki ze zdrowiem', () => {
  const tresc = readFileSync(REGULY_YAML, 'utf8');
  const reguly = wczytajReguly(tresc);
  const serwis = readFileSync(METRICS_SERVICE, 'utf8');

  it('plik w ogóle się parsuje i reguły mają unikalne uid', () => {
    expect(reguly.length).toBeGreaterThan(10);
    const uidy = reguly.map((r) => r.uid);
    expect(new Set(uidy).size).toBe(uidy.length);
    expect(reguly.every((r) => r.expr.length > 0)).toBe(true);
  });

  it('żadna reguła nie alarmuje na zdrowym systemie', () => {
    const zarzuty = znajdzReguleKtoraAlarmujeNaZdrowiu(reguly);
    expect(
      zarzuty.map((z) => `${z.uid}: ${z.powod}`).join('\n'),
    ).toBe('');
  });

  it('SPRAWDZENIE SAMEGO SPRAWDZENIA: reguła sprzed X-35 zostaje odrzucona', () => {
    // Bez tej asercji test dowodziłby tylko, że dzisiejszy plik nie wyzwala
    // sprawdzenia — nie, że sprawdzenie cokolwiek łapie (lekcja z X-28/X-34).
    const przedX35 = `  - uid: verris-postgres-backup-stale
    title: VerrisPostgresBackupStale
    data:
    - refId: A
      model:
        expr: verris_backup_present == 0 or verris_backup_latest_age_seconds > 90000
    for: 30m
    noDataState: Alerting
    execErrState: Alerting
`;
    const zarzuty = znajdzReguleKtoraAlarmujeNaZdrowiu(
      wczytajReguly(przedX35),
    );
    expect(zarzuty).toHaveLength(1);
    expect(zarzuty[0].uid).toBe('verris-postgres-backup-stale');
  });

  it('`noDataState: Alerting` zostaje wyłącznie na dead man\'s switchu', () => {
    const alarmujace = reguly.filter((r) => r.noDataState === 'Alerting');
    expect(alarmujace).toHaveLength(1);
    // vector(1) zwraca próbkę zawsze, więc NoData znaczy tu jedno: Grafana
    // albo Prometheus przestały odpowiadać. To jedyny poprawny użytek.
    expect(alarmujace[0].expr).toContain('vector(1)');
  });

  it('każda granica emisji ma strażnika ciszy albo zapisany powód, dlaczego nie', () => {
    for (const granica of GRANICE_EMISJI) {
      expect(serwis).toContain(granica.straz);
      if (granica.sentinel === null) {
        expect(granica.powod && granica.powod.length > 20).toBe(true);
        continue;
      }
      expect(serwis).toContain(granica.sentinel);
      expect(tresc).toContain(`absent(${granica.sentinel})`);
    }
  });

  it('cisza całego eksportera ma własną regułę', () => {
    expect(serwis).toContain(SENTINEL_CALEGO_EKSPORTERA);
    // emitowany bezwarunkowo — nie wolno go schować za żadnym `if (this.…)`
    expect(tresc).toContain(`absent(${SENTINEL_CALEGO_EKSPORTERA})`);
  });

  it('dołożenie nowej granicy emisji czerwieni ten test', () => {
    // Liczymy `if (this.X)` w serwisie metryk z pominięciem cache'u, który
    // nie jest granicą emisji. Gdy ktoś doda piąty blok warunkowy, ta asercja
    // pęka i wymusza decyzję: sentinel czy zapisany powód. Bez niej `H-23`
    // wróciłby po cichu przy pierwszym nowym `try/catch`.
    const straze = [...serwis.matchAll(/if \(this\.(\w+)/g)]
      .map((m) => m[1])
      .filter((n) => n !== 'cached');
    const unikalne = [...new Set(straze)].sort();
    const zadeklarowane = GRANICE_EMISJI.map((g) =>
      g.straz.replace('this.', ''),
    ).sort();
    expect(unikalne).toEqual(zadeklarowane);
  });
});

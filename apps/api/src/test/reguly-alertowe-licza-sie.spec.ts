import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-30 — reguła wczytana to nie reguła działająca.
 *
 * CO SIĘ STAŁO. Wdrożenie #67 przeszło na zielono. Krok X-29 zrobił swoje:
 * `promtool` przyjął konfigurację, Prometheus i Grafana wstały, oba odpowiedziały
 * na health-check. Grafana zalogowała „starting to provision alerting" i „finished".
 * Trzynaście reguł było w bazie Grafany.
 *
 * I wszystkie trzynaście waliło się co trzydzieści sekund:
 *
 *     level=error msg="Failed to build rule evaluator"
 *     error="failed to build query 'A': data source not found"
 *
 * Reguły odwołują się do źródła danych po `uid`. Grafana przy provisioningu
 * aktualizuje istniejące źródło po NAZWIE i zostawia mu uid wylosowany przy
 * pierwszym utworzeniu — dopisanie `uid:` do pliku niczego nie zmieniło.
 * Dashboardy tego nie zauważyły, bo mają starą, nazwową ścieżkę zgodności;
 * reguły alertowe takiej nie mają.
 *
 * MÓJ BŁĄD, NAZWANY WPROST. Strażnik X-28 sprawdzał, że `datasourceUid` użyty
 * w regułach WYSTĘPUJE w `datasources.yml`. Występował. Plik był spójny z plikiem
 * — i to nie dowodziło NICZEGO o działającym systemie, bo pytanie nie brzmiało
 * „czy napis się zgadza", tylko „czy Grafana rozwiąże to odwołanie". Test
 * zgodności plików nie widzi semantyki upsertu Grafany.
 *
 * To ta sama pułapka co przy Z-01, H-20 i dwa razy przy diagnozie
 * `@prisma/client`: test przechodzi, system nie działa. Napisałem o niej
 * w komentarzu do X-28 i wpadłem w nią godzinę później.
 *
 * DLATEGO TEN STRAŻNIK PILNUJE CZEGOŚ INNEGO. Nie sprawdza już zgodności
 * napisów — sprawdza, że WDROŻENIE pyta działającą Grafanę, czy jej reguły się
 * liczą, i przerywa, gdy się nie liczą. Zgodności plików pilnuje nadal
 * `routing-alertow.spec.ts`; ona jest potrzebna, tylko niewystarczająca.
 *
 * CZEGO NIE DA SIĘ TU SPRAWDZIĆ. Że alarm o niedziałających alarmach zadziała.
 * Meta-reguła po stronie Grafany łapie pojedynczą regułę z błędnym wyrażeniem,
 * ale NIE złamane źródło danych — wtedy sama też się nie liczy. Ten przypadek
 * łapie wyłącznie bramka we wdrożeniu i tak ma zostać.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'prod-deploy-ghcr.sh');
const ZRODLA = join(
  KORZEN,
  'ops',
  'observability',
  'grafana',
  'provisioning',
  'datasources',
  'datasources.yml',
);

/** Treść bez komentarzy — po raz dwunasty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('X-30 — wdrożenie pyta Grafanę, czy reguły się liczą', () => {
  const skrypt = kod(SKRYPT);

  it('strażnik czyta właściwy plik', () => {
    expect(skrypt).toContain('OBS_SERVICES=');
    expect(skrypt).toContain('/api/health');
  });

  it('czyta metryki z działającej Grafany, a nie plik z repo', () => {
    // Cała różnica między tym strażnikiem a poprzednim.
    expect(skrypt).toContain('3000/metrics');
    expect(skrypt).toContain('grafana_alerting_rule_evaluation_failures_total');
  });

  it('odrzuca wdrożenie, w którym Grafana nie ma ANI JEDNEJ reguły', () => {
    // Pusty provisioning wygląda identycznie jak zdrowa Grafana: /api/health
    // odpowiada, kontener stoi, log nie krzyczy.
    expect(skrypt).toContain('grafana_alerting_rule_group_rules');
    const od = skrypt.indexOf('grafana_alerting_rule_group_rules');
    const fragment = skrypt.slice(od, od + 600);
    expect(fragment).toMatch(/-le 0|-lt 1|-eq 0/);
    expect(fragment).toContain('exit 1');
  });

  it('porównuje licznik błędów DWA razy, nie raz', () => {
    // Wartość bezwzględna nie wystarcza: pojedyncze niepowodzenie zaraz po
    // restarcie, gdy Prometheus jeszcze wstaje, jest normalne. Liczy się
    // PRZYROST — czyli że reguły czerwienią się NADAL.
    expect(skrypt).toContain('BLEDY_PRZED');
    expect(skrypt).toContain('BLEDY_PO');
    expect(skrypt).toMatch(/\$\{BLEDY_PO:-0\}"?\s+-gt\s+"?\$\{BLEDY_PRZED:-0\}/);
  });

  it('czeka dłużej niż cykl najkrótszej grupy reguł', () => {
    // Grupa `verris_control_plane` liczy się co 30 s. Odczyt po krótszym czasie
    // pokazałby zero błędów tylko dlatego, że nic się jeszcze nie policzyło.
    const od = skrypt.indexOf('BLEDY_PRZED=');
    const fragment = skrypt.slice(od, skrypt.indexOf('BLEDY_PO=', od));
    const m = fragment.match(/sleep (\d+)/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThan(30);
  });

  it('przerywa wdrożenie i mówi, gdzie szukać', () => {
    const od = skrypt.indexOf('BLEDY_PO=');
    const ogon = skrypt.slice(od);
    expect(ogon).toContain('data source not found');
    expect(ogon).toMatch(/exit 1/);
  });

  it('sprawdzenie idzie PO tym, jak monitoring wstał', () => {
    // Pytanie o metryki kontenera, który jeszcze nie odpowiada, dałoby pustkę —
    // czyli zero błędów i fałszywą zieleń.
    const wstal = skrypt.indexOf('OBS_OK');
    const metryki = skrypt.indexOf('3000/metrics');
    expect(wstal).toBeGreaterThan(-1);
    expect(metryki).toBeGreaterThan(wstal);
  });
});

describe('X-30 — uid źródła danych jest wymuszony, a nie tylko zapisany', () => {
  const zrodla = kod(ZRODLA);

  it('strażnik czyta właściwy plik', () => {
    expect(zrodla).toContain('datasources:');
    expect(zrodla).toContain('name: Prometheus');
  });

  it('źródło danych jest odtwarzane, żeby uid faktycznie się zastosował', () => {
    // Samo `uid:` w pliku nie wystarcza: Grafana aktualizuje istniejące źródło
    // po nazwie i zachowuje uid nadany przy pierwszym utworzeniu. Dopiero
    // `deleteDatasources` sprawia, że deklaracja z repo wygrywa.
    expect(zrodla).toContain('deleteDatasources:');
    const od = zrodla.indexOf('deleteDatasources:');
    const fragment = zrodla.slice(od, zrodla.indexOf('datasources:', od + 1));
    expect(fragment).toContain('name: Prometheus');
  });

  it('usunięcie stoi PRZED deklaracją, bo w tej kolejności działa', () => {
    expect(zrodla.indexOf('deleteDatasources:')).toBeLessThan(
      zrodla.indexOf('\ndatasources:'),
    );
  });

  it('uid jest jawny i taki sam, jakiego używają reguły', () => {
    const uid = zrodla.match(/uid:\s*(\S+)/);
    expect(uid).not.toBeNull();
    const reguly = kod(
      join(KORZEN, 'ops', 'observability', 'grafana', 'provisioning', 'alerting', 'rules.yaml'),
    );
    expect(reguly).toContain(`datasourceUid: ${uid![1]}`);
  });
});

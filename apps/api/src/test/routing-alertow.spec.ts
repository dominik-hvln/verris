import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-28 — alert, który nie ma dokąd trafić, nie jest alertem.
 *
 * CO SIĘ STAŁO. Kopia bazy nie wykonała się ani razu przez ponad miesiąc.
 * Reguła `VerrisPostgresBackupStale` (severity: critical) zapaliła się
 * POPRAWNIE i dokładnie wtedy, kiedy powinna. Nie dotarła do nikogo, bo
 * w całym repozytorium nie było Alertmanagera, a `prometheus.yml` nie miał
 * sekcji `alerting:`. Prometheus liczył trzynaście reguł — pięć z nich
 * krytycznych — i pokazywał je we własnym interfejsie, którego nikt nie
 * otwiera. Grafana miała problem odwrotny: punkt kontaktowy, politykę
 * powiadomień i działający SMTP, a do tego ZERO reguł. Dwie połowy jednego
 * mechanizmu, każda bezużyteczna bez drugiej.
 *
 * To ta sama rodzina, którą macierz zna jako „bramka, która melduje zamiast
 * bramkować" (X-14, X-23, H-19, H-20, X-27) — tylko o krok dalej. Tam kontrola
 * istniała i niczego nie zatrzymywała. Tu alarm istnieje, działa i dzwoni
 * w pustym pokoju.
 *
 * DLACZEGO PRZENIESIENIE, A NIE SKOPIOWANIE. Reguły mogły zostać
 * w Prometheusie i dodatkowo powstać w Grafanie. Byłby to szósty przypadek
 * „bliźniaczych miejsc" w tym projekcie (Z-12, Z-16, M-06, X-24, H-24): dwa
 * egzemplarze jednej reguły, jeden poprawiony przy następnej zmianie progu,
 * drugi zapomniany. Zapomniana kopia alertu jest gorsza niż brak alertu, bo
 * wygląda na działającą. Dlatego `alerts.yml` został USUNIĘTY, a `rule_files`
 * wycięte z `prometheus.yml`.
 *
 * CZEGO TEN TEST NIE DOWODZI. Nie dowodzi, że mail dochodzi — to wymaga
 * wysyłki i skrzynki, czyli dowodu D3, i stoi osobno. Dowodzi rzeczy słabszej
 * i sprawdzalnej w CI: że każda reguła ma zdefiniowaną drogę do człowieka,
 * a droga kończy się adresem, a nie w połowie.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const OBS = join(KORZEN, 'ops', 'observability');
const ALERTING = join(OBS, 'grafana', 'provisioning', 'alerting');
const REGULY = join(ALERTING, 'rules.yaml');
const KONTAKTY = join(ALERTING, 'contactpoints.yaml');
const POLITYKI = join(ALERTING, 'policies.yaml');

/** Treść bez komentarzy — po raz dziesiąty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

/**
 * Wszystkie trzynaście alertów, które istniały w Prometheusie 2026-08-22.
 *
 * Lista jest wpisana wprost, a nie czytana z pliku źródłowego, bo plik
 * źródłowy przestał istnieć — i o to chodziło. Bez tej listy przeniesienie
 * mogłoby zgubić regułę po drodze i nikt by się nie dowiedział: brakujący
 * alert nie ma jak o sobie powiedzieć.
 */
const ALERTY = [
  'VerrisStaleComputeHeartbeat',
  'VerrisProvisioningBacklog',
  'VerrisProvisioningQueueFailed',
  'VerrisProvisioningQueueStale',
  'VerrisOpenMajorIncident',
  'VerrisStatusWebhookBacklog',
  'VerrisStatusWebhookFailed',
  'VerrisPostgresBackupStale',
  'VerrisMigrationJobsFailed',
  'VerrisRuntimeErrorsSpike',
  'VerrisRuntimeErrorsHigh',
  'VerrisSecurityWatchFindings',
  'VerrisSecurityWatchStale',
] as const;

/**
 * Reguły dopisane PO migracji, ręcznie.
 *
 * Trzymane osobno od `ALERTY` celowo. Tamta lista odpowiada na pytanie „czy
 * przeniesienie czegoś nie zgubiło" i ma zostać zamrożona. Ta odpowiada na
 * pytanie „czy ktoś czegoś po cichu nie dołożył" — nowa reguła musi tu trafić
 * świadomie, a nie prześlizgnąć się przy okazji.
 */
const DOPISANE_POZNIEJ = [
  // X-31 — dead man's switch: pali się zawsze, jego BRAK jest sygnałem.
  'VerrisKanalAlertowZyje',
  // X-35 — strażnicy ciszy. Po jednym na MIEJSCE, w którym emisja metryk może
  // zniknąć niezależnie od reszty (bloki `if (this.…)` z własnym `try/catch`
  // w metrics.service.ts), a NIE po jednym na regułę: trzynaście maili o jednej
  // awarii eksportera to X-28 od nowa, tylko z drugiej strony.
  'VerrisEksporterApiNiemy',
  'VerrisMetrykiBackupuNieobecne',
  'VerrisMetrykiKolejkiNieobecne',
] as const;

/** Te pięć musi mieć `severity: critical` — inaczej wyciszy je grupowanie. */
const KRYTYCZNE = [
  'VerrisProvisioningQueueFailed',
  'VerrisOpenMajorIncident',
  'VerrisPostgresBackupStale',
  'VerrisRuntimeErrorsHigh',
  'VerrisSecurityWatchFindings',
] as const;

describe('X-28 — reguły alertowe mają jeden dom i ten dom powiadamia', () => {
  it('strażnik czyta właściwy plik', () => {
    expect(existsSync(REGULY)).toBe(true);
    const tresc = kod(REGULY);
    expect(tresc).toContain('apiVersion: 1');
    expect(tresc).toContain('groups:');
  });

  it.each(ALERTY)('%s istnieje po stronie Grafany', (nazwa) => {
    // Przeniesienie, które gubi regułę, jest gorsze od braku przeniesienia:
    // wygląda na zrobione.
    expect(kod(REGULY)).toContain(`title: ${nazwa}`);
  });

  it('wszystkie trzynaście reguł, ani jednej mniej — i nic po cichu dołożonego', () => {
    const tytuly = [...kod(REGULY).matchAll(/^\s*title:\s*(\S+)/gm)].map((m) => m[1]);
    expect(tytuly.sort()).toEqual([...ALERTY, ...DOPISANE_POZNIEJ].sort());
  });

  it.each(KRYTYCZNE)('%s zachowała severity: critical', (nazwa) => {
    const tresc = kod(REGULY);
    const od = tresc.indexOf(`title: ${nazwa}`);
    expect(od).toBeGreaterThan(-1);
    // Etykiety reguły stoją po jej tytule, przed tytułem następnej.
    const nastepny = tresc.indexOf('title: Verris', od + 1);
    const blok = tresc.slice(od, nastepny === -1 ? undefined : nastepny);
    expect(blok).toContain('severity: critical');
  });

  it('każda reguła ma etykietę severity', () => {
    const tytuly = (kod(REGULY).match(/^\s*title:\s*Verris/gm) ?? []).length;
    const severity = (kod(REGULY).match(/^\s*severity:\s*\S+/gm) ?? []).length;
    expect(severity).toBe(tytuly);
  });

  it('ślepota na kopię bazy nie czyta się jak zdrowie', () => {
    // ZMIENIONE W X-35 — i powód jest ważniejszy niż sama zmiana.
    //
    // Poprzednia wersja tej asercji brzmiała `expect(blok).toMatch(
    // /noDataState:\s*Alerting/)`, a jej komentarz stawiał diagnozę CAŁKOWICIE
    // POPRAWNĄ: „brak serii znaczy »warunek niespełniony«, bo prometheusowe
    // expr z porównaniem zwraca pusty wynik, gdy jest dobrze".
    //
    // Diagnoza była trafna, lekarstwo nie. `noDataState` nie umie odróżnić
    // dwóch PRZECIWNYCH powodów pustki — „filtr nikogo nie przepuścił, bo jest
    // dobrze" i „metryki nie ma wcale" — bo do Grafany docierają jako to samo
    // NoData. Ustawienie `Alerting` naprawiało drugi przypadek kosztem
    // pierwszego: reguła paliła się NIEPRZERWANIE przez trzy tygodnie przy
    // zdrowej kopii sprzed dziesięciu godzin. Ten test PILNOWAŁ tej usterki.
    //
    // Właściwe rozwiązanie nie przestawia dźwigni, tylko przestaje jej używać:
    // wyrażenie jest całkowite (zwraca próbkę zawsze, zdrowie to jawne zero),
    // a ślepota dostaje własną regułę, własny opis i własny próg czasu.
    // Pełne omówienie i strażnik ogólny: X-35 oraz
    // apps/api/src/test/reguly-nie-myla-pustki-ze-zdrowiem.spec.ts.
    const tresc = kod(REGULY);
    const od = tresc.indexOf('title: VerrisPostgresBackupStale');
    const nastepny = tresc.indexOf('title: Verris', od + 1);
    const blok = tresc.slice(od, nastepny === -1 ? undefined : nastepny);

    const expr = (blok.match(/expr:\s*([\s\S]*?)\n\s*instant:/) ?? [])[1] ?? '';
    expect(expr).not.toBe('');
    // Każde porównanie z modyfikatorem `bool` — inaczej filtruje i zdrowy stan
    // znika z wyniku. Po usunięciu porównań z `bool` nie może zostać żadne.
    expect(expr.replace(/(==|!=|>=|<=|>|<)\s*bool\b/g, ' ')).not.toMatch(
      /(==|!=|>=|<=|>|<)/,
    );
    // Domknięcie na wypadek zniknięcia metryki — bez tego `max()` po pustce
    // znów zwróciłby pustkę.
    expect(expr).toContain('or vector(');
    // Nie przez `noDataState`, tylko przez osobną regułę o własnym opisie.
    expect(tresc).toContain('absent(verris_backup_present)');
    // `for` chroni przed alarmem przy zwykłym restarcie API.
    expect(blok).toMatch(/for:\s*30m/);
  });

  it('reguły pytają źródło danych, które naprawdę jest zdefiniowane', () => {
    const uzyte = new Set(
      [...kod(REGULY).matchAll(/datasourceUid:\s*(\S+)/g)]
        .map((m) => m[1])
        .filter((u) => u !== '__expr__'),
    );
    const zrodla = kod(join(OBS, 'grafana', 'provisioning', 'datasources', 'datasources.yml'));
    const zdefiniowane = new Set([...zrodla.matchAll(/^\s*uid:\s*(\S+)/gm)].map((m) => m[1]));
    expect(uzyte.size).toBeGreaterThan(0);
    for (const u of uzyte) expect(zdefiniowane.has(u)).toBe(true);
  });
});

describe('X-31 — kanał alertów daje znak życia', () => {
  const reguly = kod(REGULY);
  const polityki = kod(POLITYKI);

  it('strażnik czyta właściwe pliki', () => {
    expect(reguly).toContain('title: VerrisKanalAlertowZyje');
    expect(polityki).toContain('policies:');
  });

  it('reguła pali się zawsze, także gdy Prometheus milczy', () => {
    // `vector(1)` zwraca stałą jedynkę przy każdej ewaluacji. Gdyby Prometheus
    // przestał odpowiadać, `execErrState: Alerting` zapali ją tym bardziej —
    // a o to właśnie chodzi: milczenie ma znaczyć awarię, nigdy spokój.
    const od = reguly.indexOf('title: VerrisKanalAlertowZyje');
    const blok = reguly.slice(od);
    expect(blok).toContain('expr: vector(1)');
    expect(blok).toMatch(/execErrState:\s*Alerting/);
    expect(blok).toMatch(/noDataState:\s*Alerting/);
    expect(blok).toMatch(/for:\s*0s/);
  });

  it('ma etykietę, po której polityka ją rozpozna', () => {
    const od = reguly.indexOf('title: VerrisKanalAlertowZyje');
    expect(reguly.slice(od)).toContain('kanal: heartbeat');
  });

  it('idzie OSOBNĄ gałęzią, raz na dobę', () => {
    // Na domyślnej polityce (repeat_interval: 4h) byłoby sześć maili dziennie.
    // Alert przychodzący sześć razy dziennie przestaje być czytany — a wtedy
    // przestaje cokolwiek dawać, bo jego BRAK jest jedyną informacją, jaką niesie.
    expect(polityki).toContain('routes:');
    const od = polityki.indexOf('routes:');
    const galaz = polityki.slice(od);
    expect(galaz).toContain("'kanal'");
    expect(galaz).toContain('heartbeat');
    expect(galaz).toMatch(/repeat_interval:\s*24h/);
  });

  it('domyślna polityka NIE została przestawiona na dobę', () => {
    // Gałąź heartbeatu nie może po cichu wyciszyć wszystkiego innego: prawdziwy
    // alarm ma się przypominać co cztery godziny, a nie raz dziennie.
    const doGalezi = polityki.slice(0, polityki.indexOf('routes:'));
    expect(doGalezi).toMatch(/repeat_interval:\s*4h/);
  });
});

describe('X-28 — droga od reguły do człowieka kończy się adresem', () => {
  it('strażnik czyta właściwe pliki', () => {
    expect(kod(POLITYKI)).toContain('policies:');
    expect(kod(KONTAKTY)).toContain('contactPoints:');
  });

  it('odbiorca z polityki powiadomień naprawdę istnieje', () => {
    // Literówka w nazwie odbiorcy jest cicha: Grafana przyjmuje politykę
    // i nic nie wysyła.
    const odbiorcy = [...kod(POLITYKI).matchAll(/receiver:\s*(\S+)/g)].map((m) => m[1]);
    const nazwy = [...kod(KONTAKTY).matchAll(/^\s*-?\s*name:\s*(\S+)/gm)].map((m) => m[1]);
    expect(odbiorcy.length).toBeGreaterThan(0);
    for (const o of odbiorcy) expect(nazwy).toContain(o);
  });

  it('punkt kontaktowy ma niepusty adres', () => {
    const tresc = kod(KONTAKTY);
    const m = tresc.match(/addresses:\s*(\S+)/);
    expect(m).not.toBeNull();
    expect(m![1].trim().length).toBeGreaterThan(0);
    expect(m![1]).toContain('@');
  });
});

describe('X-28 — nie ma drugiego domu dla tych samych reguł', () => {
  const prometheus = kod(join(OBS, 'prometheus.yml'));

  it('strażnik czyta właściwy plik', () => {
    expect(prometheus).toContain('scrape_configs:');
  });

  it('Prometheus nie trzyma reguł, których nie ma jak wysłać', () => {
    // `rule_files` bez sekcji `alerting:` to alarm dzwoniący w pustym pokoju.
    // Jeśli kiedyś wróci Alertmanager, ten warunek trzeba świadomie zmienić —
    // razem z dołożeniem usługi do compose.
    expect(prometheus).not.toMatch(/^\s*rule_files:/m);
    expect(existsSync(join(OBS, 'prometheus', 'alerts.yml'))).toBe(false);
  });

  it('compose nie montuje pliku, którego już nie ma', () => {
    // Docker przy nieistniejącym źródle bind-mounta tworzy pusty KATALOG
    // i uruchamia kontener bez słowa skargi. Zostawiony wiersz wyglądałby
    // więc na działającą konfigurację alertów — i byłby gorszy niż jego brak.
    const compose = kod(join(KORZEN, 'docker-compose.prod.yml'));
    expect(compose).not.toContain('prometheus/alerts.yml');
  });

  it('gdyby Prometheus miał reguły, musiałby mieć też Alertmanagera', () => {
    // Warunek pilnuje przyszłości, nie teraźniejszości: samo dopisanie
    // `rule_files` bez `alerting:` i bez usługi w compose ma czerwienić CI.
    const compose = kod(join(KORZEN, 'docker-compose.prod.yml'));
    const maReguly = /^\s*rule_files:/m.test(prometheus);
    if (maReguly) {
      expect(prometheus).toMatch(/^alerting:/m);
      expect(compose).toMatch(/^\s{2}alertmanager:/m);
    }
    expect(true).toBe(true);
  });

  it('katalog z regułami Grafany jest naprawdę podmontowany', () => {
    // Najcichsza z możliwych awarii: plik w repo, którego kontener nie widzi.
    const compose = kod(join(KORZEN, 'docker-compose.prod.yml'));
    expect(compose).toContain('/etc/grafana/provisioning');
  });
});

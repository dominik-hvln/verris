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

  it('wszystkie trzynaście reguł, ani jednej mniej', () => {
    const tytuly = [...kod(REGULY).matchAll(/^\s*title:\s*(\S+)/gm)].map((m) => m[1]);
    expect(tytuly.sort()).toEqual([...ALERTY].sort());
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

  it('kanarek od kopii bazy alarmuje także przy BRAKU danych', () => {
    // Domyślnie brak serii znaczy „warunek niespełniony", bo prometheusowe
    // `expr` z porównaniem zwraca pusty wynik, gdy jest dobrze. Dla tej jednej
    // reguły „metryka zniknęła" i „kopia jest świeża" wyglądałyby identycznie —
    // a to jest dokładnie ten przypadek, który kosztował nas miesiąc bez kopii.
    const tresc = kod(REGULY);
    const od = tresc.indexOf('title: VerrisPostgresBackupStale');
    const nastepny = tresc.indexOf('title: Verris', od + 1);
    const blok = tresc.slice(od, nastepny === -1 ? undefined : nastepny);
    expect(blok).toMatch(/noDataState:\s*Alerting/);
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

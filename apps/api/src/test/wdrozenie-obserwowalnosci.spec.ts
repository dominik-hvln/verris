import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * X-29 — konfiguracja obserwowalności zmieniała się w repo i nie docierała na produkcję.
 *
 * JAK TO WYSZŁO. Zaraz po scaleniu X-28 — czyli poprawki, która PRZENOSI reguły
 * alertowe do Grafany — okazało się, że wdrożenie tej poprawki nie zmieni na
 * serwerze niczego. `prod-deploy-ghcr.sh` robi `checkout` repozytorium do SHA,
 * więc nowe pliki lądują na dysku, a potem restartuje wyłącznie:
 *
 *     APP_SERVICES="api client-panel staff-panel admin-panel status-page www"
 *
 * Prometheus i Grafana nie są na tej liście. Oba czytają konfigurację TYLKO przy
 * starcie kontenera i oba mają ją podmontowaną z repozytorium. Nowy `rules.yaml`
 * leżałby więc na serwerze, a Grafana dalej działałaby z tym, co wczytała przy
 * ostatnim restarcie — czyli z niczym.
 *
 * DLACZEGO TO JEST TA SAMA RODZINA. Zielone CI, zielony deploy, plik na dysku,
 * pozycja w macierzy zamknięta — i zero zmiany w działającym systemie. To jest
 * ten sam kształt co X-28 (alarm bez odbiorcy), X-14 i X-23 (kontrola, która
 * melduje zamiast zatrzymywać) i H-20 (procedura bez dowodu wykonania): coś
 * wygląda na zrobione, bo istnieje.
 *
 * Zasięg jest szerszy niż alerty. Tą samą drogą nie docierały na produkcję
 * zmiany w `prometheus.yml`, w źródłach danych i w dashboardach Grafany —
 * wszystko, co leży pod `ops/observability/`.
 *
 * DLACZEGO RESTART BEZWARUNKOWY, A NIE „GDY SIĘ ZMIENIŁO". Porównanie z
 * poprzednim wdrożeniem wymagałoby dostępu do obu SHA w repozytorium na
 * serwerze, a `fetch` jest tam płytki (`--depth 1`). Nieudane porównanie
 * skończyłoby się cichym „brak zmian → nie restartuj" — czyli dokładnie tym
 * błędem, który ta pozycja naprawia. Restart dwóch kontenerów kosztuje
 * kilkanaście sekund przerwy w zbieraniu metryk; cicha rozbieżność
 * konfiguracji kosztowała miesiąc bez kopii bazy.
 */

const KORZEN = join(__dirname, '..', '..', '..', '..');
const SKRYPT = join(KORZEN, 'ops', 'scripts', 'prod-deploy-ghcr.sh');

/** Treść bez komentarzy — po raz jedenasty ta sama lekcja w tym projekcie. */
function kod(sciezka: string): string {
  return readFileSync(sciezka, 'utf8')
    .split('\n')
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

describe('X-29 — wdrożenie dowozi konfigurację obserwowalności', () => {
  const skrypt = kod(SKRYPT);

  it('strażnik czyta właściwy plik', () => {
    expect(skrypt).toContain('APP_SERVICES=');
    expect(skrypt).toContain('prisma migrate deploy');
  });

  it('usługi obserwowalności są nazwane wprost', () => {
    expect(skrypt).toMatch(/OBS_SERVICES="[^"]*prometheus[^"]*"/);
    expect(skrypt).toMatch(/OBS_SERVICES="[^"]*grafana[^"]*"/);
  });

  it('nie doklejono ich do APP_SERVICES', () => {
    // Doklejenie zadziałałoby przypadkiem i zepsułoby dwie inne rzeczy: rollback
    // cofałby monitoring razem z aplikacją (a on nie ma tagu obrazu z GHCR),
    // a `compose pull ${APP_SERVICES}` próbowałby pobrać je po IMAGE_TAG.
    const m = skrypt.match(/APP_SERVICES="([^"]*)"/);
    expect(m).not.toBeNull();
    expect(m![1]).not.toContain('prometheus');
    expect(m![1]).not.toContain('grafana');
  });

  it('kontenery są ODTWARZANE, nie tylko restartowane', () => {
    // Sam `restart` ponownie czyta pliki, ale NIE zastosuje zmiany w definicji
    // usługi — a X-28 usunęło montowanie `alerts.yml`. Potrzebne jest jedno
    // i drugie: `up -d` na wypadek zmiany definicji, `restart` na wypadek
    // zmiany samej TREŚCI podmontowanego pliku (compose jej nie widzi).
    expect(skrypt).toMatch(/compose up -d [^\n]*\$\{OBS_SERVICES\}/);
    expect(skrypt).toMatch(/compose restart \$\{OBS_SERVICES\}/);
  });

  it('konfiguracja Prometheusa jest sprawdzana PRZED restartem', () => {
    // Restart na zepsutej konfiguracji zdejmuje monitoring i nikt tego nie
    // zauważy, bo to właśnie monitoring miał zauważać.
    const promtool = skrypt.indexOf('promtool check config');
    const restart = skrypt.indexOf('compose restart ${OBS_SERVICES}');
    expect(promtool).toBeGreaterThan(-1);
    expect(restart).toBeGreaterThan(-1);
    expect(promtool).toBeLessThan(restart);
  });

  it('po restarcie sprawdzamy, że wróciły — i przerywamy, gdy nie', () => {
    // Bez tego „restart" znaczy tylko „wydałem polecenie".
    const od = skrypt.indexOf('OBS_SERVICES=');
    const ogon = skrypt.slice(od);
    expect(ogon).toContain('/api/health');
    expect(ogon).toContain('/-/healthy');
    expect(ogon).toMatch(/exit 1/);
  });

  it('restart idzie PO bramce zdrowia aplikacji', () => {
    // Kolejność ma znaczenie w dwie strony: awaria monitoringu nie może
    // wywrócić wdrożenia aplikacji, a wdrożenie aplikacji nie może zostać
    // uznane za skończone, zanim monitoring dostanie nową konfigurację.
    const health = skrypt.indexOf('health-check');
    const obs = skrypt.indexOf('OBS_SERVICES=');
    expect(health).toBeGreaterThan(-1);
    expect(obs).toBeGreaterThan(health);
  });

  it('ostatni dobry tag zapisuje się PRZED restartem obserwowalności', () => {
    // Wydanie aplikacji jest w tym momencie udane i ma takie zostać. Gdyby
    // Grafana nie wstała, nie chcemy przy następnym wdrożeniu wycofywać się
    // do wersji sprzed dwóch — chcemy głośnego błędu i tyle.
    const zapis = skrypt.indexOf('LAST_GOOD_FILE"');
    const obs = skrypt.indexOf('compose restart ${OBS_SERVICES}');
    expect(zapis).toBeGreaterThan(-1);
    expect(obs).toBeGreaterThan(zapis);
  });
});

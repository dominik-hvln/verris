import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const KORZEN = resolve(__dirname, '../../../..');

/**
 * ENV-01 — jedna wersja Node w czterech miejscach.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * DLACZEGO TO NIE JEST KOSMETYKA
 * ────────────────────────────────────────────────────────────────────────────
 *
 * Wersja silnika jest dziś deklarowana w czterech miejscach, w trzech różnych
 * formatach: `engines.node` w package.json, `node-version:` w siedmiu krokach
 * workflowów, `ARG NODE_VERSION` w dwóch Dockerfile'ach i — od teraz — `.nvmrc`
 * dla maszyny dewelopera. Nic ich ze sobą nie wiązało, więc rozjechanie się
 * było kwestią czasu i przez pewien czas było faktem: repozytorium wymagało
 * `>=22.12`, CI budowało na 22, a bramka lokalna biegła na **20.19.2**. `pnpm`
 * mówił o tym przy KAŻDYM uruchomieniu i nikt tego nie czytał, bo to było
 * ostrzeżenie, a nie błąd.
 *
 * Waga tej rozbieżności zmieniła się 2026-08-28 wraz z decyzją o pozostaniu
 * przy pushach na `main` bez pull requestów. Od tamtej decyzji **jedyną realną
 * kontrolą przed `main` jest bramka uruchamiana lokalnie** — a ta biegła na
 * innym silniku niż ten, który ostatecznie ocenia kod. „Zielone u mnie" było
 * słabszym dowodem, niż wyglądało, dokładnie w miejscu, na którym oparliśmy proces.
 *
 * Tego samego dnia M-02 pokazał, ile kosztuje różnica między maszynami:
 * numer faktury zależał od strefy czasowej procesu, a defekt wyszedł wyłącznie
 * dlatego, że Mac ma inną strefę niż kontener. Tam różnica środowisk uratowała
 * nam skórę przypadkiem. Tu może zadziałać w drugą stronę.
 *
 * Ten strażnik nie sprawdza, czy ktoś ma zainstalowaną właściwą wersję — tego
 * z poziomu testu wiarygodnie nie da się wymusić. Sprawdza słabszą, ale
 * egzekwowalną własność: że wszystkie DEKLARACJE mówią to samo. Dzięki temu
 * podniesienie wersji jest jedną świadomą zmianą w kilku plikach naraz,
 * a nie cichym dryfem jednego z nich.
 */
describe('ENV-01 — wersja Node jest jedna we wszystkich deklaracjach', () => {
  const pkg = JSON.parse(readFileSync(resolve(KORZEN, 'package.json'), 'utf-8'));

  /** Główny numer wersji wymaganej przez repozytorium, np. 22 z ">=22.12". */
  const wymaganyMajor = (() => {
    const surowy: string = pkg.engines?.node ?? '';
    const m = surowy.match(/(\d+)/);
    if (!m) throw new Error(`Nie potrafię odczytać wersji Node z engines.node = "${surowy}"`);
    return m[1];
  })();

  it('package.json deklaruje wersję Node', () => {
    expect(pkg.engines?.node).toBeDefined();
    expect(wymaganyMajor).toBe('22');
  });

  it('.nvmrc istnieje i zgadza się z engines.node', () => {
    const sciezka = resolve(KORZEN, '.nvmrc');
    expect(existsSync(sciezka)).toBe(true);
    expect(readFileSync(sciezka, 'utf-8').trim()).toBe(wymaganyMajor);
  });

  // Siedem kroków w dwóch workflowach. Gdyby ktoś podniósł jeden i zapomniał
  // o reszcie, CI budowałby część zadań na innym silniku niż pozostałe — a to
  // objawia się jako „u mnie ten job przechodzi, tamten nie" bez widocznej przyczyny.
  it('każdy krok setup-node w workflowach używa tej samej wersji', () => {
    const workflowy = ['.github/workflows/ci.yml', '.github/workflows/deploy.yml'];
    const znalezione: string[] = [];

    for (const plik of workflowy) {
      const tresc = readFileSync(resolve(KORZEN, plik), 'utf-8');
      for (const m of tresc.matchAll(/node-version:\s*['"]?([\d.]+)['"]?/g)) {
        znalezione.push(`${plik}: ${m[1]}`);
        expect(m[1]).toBe(wymaganyMajor);
      }
    }

    // Kontrola samego strażnika: gdyby wyrażenie przestało cokolwiek łapać,
    // pętla wyżej nie wykonałaby ani jednej asercji i test byłby zielony
    // zawsze — najgorszy możliwy rodzaj strażnika (rodzina X-35/X-38/X-40).
    expect(znalezione.length).toBeGreaterThanOrEqual(7);
  });

  it('obrazy Dockera budują się na tej samej wersji', () => {
    const pliki = ['Dockerfile.api', 'Dockerfile.panel'];
    let sprawdzone = 0;

    for (const plik of pliki) {
      const tresc = readFileSync(resolve(KORZEN, plik), 'utf-8');
      for (const m of tresc.matchAll(/ARG\s+NODE_VERSION=([\d.]+)/g)) {
        expect(m[1]).toBe(wymaganyMajor);
        sprawdzone++;
      }
    }

    expect(sprawdzone).toBe(2);
  });
});

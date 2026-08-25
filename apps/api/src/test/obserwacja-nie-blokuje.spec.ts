import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Obserwacja egressu kontenerów OBSERWUJE — i nic poza tym.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-41, etap 1. Przy diagnozie X-37 wyszło, że cały hardening egressu z X-36
 * wisi w łańcuchu OUTPUT, czyli dotyczy wyłącznie pakietów tworzonych lokalnie
 * przez host. Ruch KONTENERÓW idzie przez FORWARD, gdzie `DOCKER-USER` jest
 * pusty. Zmierzone: wypięcie `VERRIS_ANTISCAN` z OUTPUT nie zmieniło
 * zachowania aplikacji ani o jotę, bo nigdy jej nie dotyczyło.
 *
 * Domknięcie tej dziury jest kuszące do zrobienia od razu i byłoby to błędem.
 * Dwie miny, obie policzalne dopiero po pomiarze:
 *
 *   1. `VERRIS_EGRESS_BOGON` odrzuca nowe połączenia do 172.16.0.0/12 na
 *      80/443. W DOCKER-USER dotyczyłoby ruchu MIĘDZY KONTENERAMI — nasze
 *      sieci Dockera to 172.18–172.20.
 *   2. Próg anty-skanu (40 poł./60 s) dobrano dla całego hosta jako JEDNEGO
 *      wiadra. W FORWARD wiadro jest per kontener. To inna wielkość.
 *
 * Dlatego etap 1 tylko loguje. Ten strażnik pilnuje, żeby tak zostało do
 * momentu świadomej decyzji — a nie żeby ktoś „przy okazji" dopisał DROP
 * do łańcucha, który w nazwie ma OBSERW.
 */

const SKRYPT = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'ops', 'scripts', 'security-control-plane-egress.sh'),
  'utf8',
);

/** Ciało funkcji, bez komentarzy — proza cytuje reguły, których zabrania. */
function cialoFunkcji(nazwa: string): string {
  const linie = SKRYPT.split('\n');
  const start = linie.findIndex((l) => l.startsWith(`${nazwa}() {`));
  if (start === -1) return '';
  const koniec = linie.findIndex((l, i) => i > start && l === '}');
  return linie
    .slice(start + 1, koniec)
    .filter((l) => !/^\s*#/.test(l))
    .join('\n');
}

const OBSERWACJA = cialoFunkcji('apply_forward_observe');

describe('obserwacja egressu kontenerów nie blokuje', () => {
  it('funkcja obserwacji w ogóle istnieje', () => {
    expect(OBSERWACJA.length).toBeGreaterThan(200);
  });

  it('nie zawiera ANI JEDNEJ reguły odrzucającej', () => {
    const zakazane = OBSERWACJA.split('\n').filter((l) =>
      /-j\s+(DROP|REJECT)\b/.test(l),
    );
    expect(zakazane).toEqual([]);
  });

  it('zwalnia ruch WCHODZĄCY do kontenerów, zanim cokolwiek zaloguje', () => {
    const linie = OBSERWACJA.split('\n');
    const iLog = linie.findIndex((l) => l.includes('-j LOG'));
    const iBridge = linie.findIndex((l) => /-o\s+'?br-\+/.test(l));
    const iDocker0 = linie.findIndex((l) => /-o\s+docker0/.test(l));

    expect(iLog).toBeGreaterThan(-1);
    expect(iBridge).toBeGreaterThan(-1);
    expect(iDocker0).toBeGreaterThan(-1);
    // Bez tego inwentarz zawierałby ruch kontener→kontener, który egressem
    // nie jest — i pierwsza próba egzekwowania oparłaby progi na śmieciach.
    expect(iBridge).toBeLessThan(iLog);
    expect(iDocker0).toBeLessThan(iLog);
  });

  it('wpina się w DOCKER-USER, a nie w OUTPUT', () => {
    expect(OBSERWACJA).toMatch(/DOCKER-USER/);
    expect(OBSERWACJA).not.toMatch(/\bOUTPUT\b/);
  });

  it('tryb obserwacji jest wyłączny — nie uruchamia reszty hardeningu', () => {
    const linie = SKRYPT.split('\n').filter((l) => !/^\s*#/.test(l));

    // WYWOŁANIE, nie definicja. Pierwsza wersja tej asercji szukała napisu
    // `\napply_ioc_drop` i trafiała w `apply_ioc_drop() {` — czyli w miejsce,
    // gdzie funkcja jest ZADEKLAROWANA, a ono z natury stoi wyżej niż
    // dyspozytor. Test był czerwony przy poprawnym skrypcie. Linia będąca
    // dokładnie nazwą funkcji może znaczyć tylko jedno.
    const iObserwuj = linie.findIndex((l) => l.includes('OBSERWUJ_KONTENERY" -eq 1'));
    const iWyjscie = linie.findIndex((l, i) => i > iObserwuj && l.trim() === 'exit 0');
    const iIoc = linie.findIndex((l) => l.trim() === 'apply_ioc_drop');

    expect(iObserwuj).toBeGreaterThan(-1);
    expect(iIoc).toBeGreaterThan(-1);
    // Wyjście musi nastąpić PRZED wywołaniem właściwego hardeningu.
    expect(iWyjscie).toBeGreaterThan(iObserwuj);
    expect(iWyjscie).toBeLessThan(iIoc);
  });

  it('strażnik faktycznie łapie dopisaną blokadę', () => {
    const zBlokada = [
      "  run \"iptables -A '$CHAIN_FWD_OBS' -j RETURN\"",
      "  run \"iptables -A '$CHAIN_FWD_OBS' -d 10.0.0.0/8 -j DROP\"",
    ].join('\n');
    const zakazane = zBlokada
      .split('\n')
      .filter((l) => /-j\s+(DROP|REJECT)\b/.test(l));
    expect(zakazane).toHaveLength(1);
  });
});

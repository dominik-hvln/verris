/**
 * Zamiana błędu sieciowego na zdanie, które coś znaczy.
 *
 * POWÓD ISTNIENIA
 * ───────────────
 * X-38, po awarii X-37. Panel klienta pokazywał użytkownikom dokładnie to:
 *
 *     Część danych jest chwilowo niedostępna
 *     Usługi: fetch failed
 *     Domeny: fetch failed
 *
 * `fetch failed` to `TypeError.message` z undici. Nie mówi ani co zawiodło,
 * ani czy to wina API, sieci, czy nazwy hosta. Prawdziwa informacja siedzi
 * piętro niżej, w `err.cause.code` — i tam była przez cały czas:
 * `UND_ERR_CONNECT_TIMEOUT`. Gdyby ten kod trafił do komunikatu i do logu,
 * diagnoza zajęłaby minuty zamiast godzin.
 *
 * DWÓCH ODBIORCÓW, DWIE RÓŻNE TREŚCI
 * ──────────────────────────────────
 * Klient ma zobaczyć zdanie po polsku, bez adresów wewnętrznych — topologia
 * sieci nie jest jego sprawą. Log serwera ma zobaczyć wszystko: kod, czas,
 * ścieżkę i adres bazowy. Ten moduł produkuje pierwsze; drugie składa
 * `apiFetch`.
 *
 * Moduł jest CELOWO bez zależności — dzięki temu da się go uruchomić
 * w testach paczki `api`, a to jedyna suita, którą naprawdę odpala bramka CI.
 */

export type OpisBleduSieci = {
  /** Kod z `err.cause.code`, `err.name` albo `err.code`. */
  kod: string;
  /** Zdanie dla użytkownika. Nigdy nie zawiera adresu wewnętrznego. */
  komunikat: string;
  czyPrzekroczonyCzas: boolean;
};

/**
 * Kody, przy których wiadomo, że druga strona nie odpowiedziała na czas.
 * Rozróżnienie ma znaczenie: „nie zdążyło" leczy się inaczej niż „odmówiło".
 */
const KODY_CZASU: ReadonlySet<string> = new Set([
  'UND_ERR_CONNECT_TIMEOUT',
  'UND_ERR_HEADERS_TIMEOUT',
  'UND_ERR_BODY_TIMEOUT',
  'ETIMEDOUT',
  'TimeoutError',
  'AbortError',
]);

function napis(wartosc: unknown): string | null {
  return typeof wartosc === 'string' && wartosc.length > 0 ? wartosc : null;
}

/**
 * Wyciąga najbardziej konkretny kod, jaki da się z błędu wydobyć.
 *
 * Kolejność nie jest przypadkowa. `fetch` opakowuje przyczynę w `TypeError`
 * o bezużytecznej nazwie `TypeError` i treści `fetch failed`, więc najpierw
 * schodzimy do `cause`. Dopiero gdy go nie ma, sięgamy po `name` (tak zgłasza
 * się `TimeoutError` z `AbortSignal.timeout`) i po `code`.
 */
export function kodBleduSieci(err: unknown): string {
  if (typeof err !== 'object' || err === null) return 'NIEZNANY';

  const przyczyna = (err as { cause?: unknown }).cause;
  if (typeof przyczyna === 'object' && przyczyna !== null) {
    const kod = napis((przyczyna as { code?: unknown }).code);
    if (kod) return kod;
    const nazwa = napis((przyczyna as { name?: unknown }).name);
    if (nazwa && nazwa !== 'Error') return nazwa;
  }

  const nazwa = napis((err as { name?: unknown }).name);
  if (nazwa && nazwa !== 'Error' && nazwa !== 'TypeError') return nazwa;

  const kod = napis((err as { code?: unknown }).code);
  if (kod) return kod;

  return 'NIEZNANY';
}

/**
 * @param budzetMs budżet czasu, jeśli był narzucony przez `apiFetch`. Podany,
 *   trafia do komunikatu — „nie odpowiedziało w ciągu 20 s" niesie więcej niż
 *   „nie odpowiedziało", bo od razu widać, czy limit jest rozsądny.
 */
export function opiszBladSieci(err: unknown, budzetMs?: number): OpisBleduSieci {
  const kod = kodBleduSieci(err);
  const czyPrzekroczonyCzas = KODY_CZASU.has(kod);

  let komunikat: string;
  if (czyPrzekroczonyCzas) {
    komunikat =
      typeof budzetMs === 'number' && budzetMs > 0
        ? `API nie odpowiedziało w ciągu ${Math.round(budzetMs / 1000)} s`
        : 'API nie odpowiedziało w wyznaczonym czasie';
  } else if (kod === 'ECONNREFUSED') {
    komunikat = 'API nie przyjmuje połączeń';
  } else if (kod === 'ENOTFOUND' || kod === 'EAI_AGAIN') {
    komunikat = 'Nie udało się ustalić adresu API';
  } else if (kod === 'ECONNRESET' || kod === 'UND_ERR_SOCKET' || kod === 'EPIPE') {
    komunikat = 'Połączenie z API zostało przerwane';
  } else if (kod === 'CERT_HAS_EXPIRED' || kod.startsWith('ERR_TLS')) {
    komunikat = 'Nie udało się nawiązać bezpiecznego połączenia z API';
  } else {
    komunikat = 'Brak połączenia z API';
  }

  return { kod, komunikat, czyPrzekroczonyCzas };
}

/** Jednowierszowy wpis do logu serwera. Tu wolno pokazać wszystko. */
export function wpisDoLogu(args: {
  metoda: string;
  sciezka: string;
  czasMs: number;
  kod: string;
  baza: string;
}): string {
  return `[apiFetch] ${args.metoda} ${args.sciezka} — brak odpowiedzi po ${args.czasMs} ms (${args.kod}); baza=${args.baza}`;
}

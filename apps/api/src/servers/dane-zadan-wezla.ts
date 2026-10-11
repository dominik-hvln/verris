import { NodeTaskKind } from '@verris/database';

/**
 * Audyt Fali 3 — wyniki zadań węzła z danymi osobowymi (także osób trzecich): nagłówki kolejki poczty (MAIL_QUEUE),
 * dziennik dostarczania (MAIL_LOG), lista blokad fail2ban całego węzła (IP_BLOCKS), adresy IP odwiedzających
 * i ścieżki z WAF (WAF_HITS), ogon logów usług węzła (NODE_SERVICES, tryb `log` — m.in. log exima bez maski).
 * Panel pokazuje tylko ostatnie wyniki, więc surowy `outputLog` i dane osobowe z parametrów nie leżą bez terminu.
 */
export const RETENCJA_WYNIKOW_ZADAN_DNI = 30;
/** Rodzaje zadań konta, których wynik i parametry czyści anonimizacja konta (art. 17). */
export const ZADANIA_KONTA_Z_DANYMI_OSOBOWYMI: readonly NodeTaskKind[] = [
  NodeTaskKind.MAIL_QUEUE,
  NodeTaskKind.MAIL_LOG,
  NodeTaskKind.IP_BLOCKS,
  NodeTaskKind.WAF_HITS,
];
/**
 * Parametry zadań z danymi osobowymi: adres IP (IP_BLOCKS), adres e-mail z filtra (MAIL_LOG), fraza szukania
 * (MAIL_QUEUE), filtr logu (NODE_SERVICES — bywa pełnym adresem).
 */
export const KLUCZE_OSOBOWE_PARAMETROW: readonly string[] = ['ip', 'address', 'szukaj', 'filter'];

/** Wynik wyczyszczony retencją albo anonimizacją — widok traktuje go jak „nie wczytano”, nie jak pusty wynik. */
export const wynikWyczyszczony = (z: { status: string; outputLog: string | null }) => z.status === 'COMPLETED' && z.outputLog === null;

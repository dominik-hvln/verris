import { AsyncLocalStorage } from 'node:async_hooks';

/** Kontekst żądania dla dziennika audytu (impersonacja, subkonto) — patrz kontekst-zadania.ts. */
export const kontekstZadania = new AsyncLocalStorage<{ impersonatedBy?: string; subkonto?: { wlasciciel: string; osoba: string } }>();

/**
 * F2.8 (OJ-01) — reguły rejestru zadań w tle, bez Nesta i bazy (testowane wprost).
 * Wzór: WHMCS Automation Status https://docs.whmcs.com/9-0/system/automation/automation-status/
 */

/** Przebiegi starsze niż tyle dni kasuje zadanie retencji. */
export const RETENCJA_DNI = 30;
/** Alert o zaległym zadaniu — najwyżej raz na dobę na zadanie (cooldown przez AuditLog). */
export const COOLDOWN_ALERTU_MS = 24 * 60 * 60 * 1000;
/** Zapas ponad dwa terminy z harmonogramu (opóźnienie pętli zdarzeń, długi przebieg poprzednika). */
export const ZAPAS_MS = 5 * 60 * 1000;
export const AKCJA_ALERTU = 'ZADANIE_W_TLE_ZALEGLE';
export const AKCJA_RECZNEGO = 'ZADANIE_W_TLE_RECZNE';

/**
 * Ręczne uruchomienie z panelu (tylko ADMIN) — wyłącznie zadania idempotentne, które niczego nie rozliczają:
 * odczyt stanu, odświeżenie danych, alert do zespołu z własnym cooldownem. Poza listą z rozmysłu: windykacja
 * i odnowienia, KSeF, faktury, portfel, prowizje, autoskalowanie, SSL i transfery domen (zwroty pieniędzy),
 * retencja i anonimizacja (kasowanie danych), wysyłki do klientów.
 * Klucz = „Klasa.metoda” (test pilnuje, że każdy wpis wskazuje istniejące zadanie @Cron).
 */
export const RECZNE_URUCHOMIENIE: ReadonlySet<string> = new Set([
  'NbpFxService.refreshScheduled',
  'ProbeScheduler.tick',
  'OpsWatchdogScheduler.checkNodes',
  'MailHealthScheduler.checkFailureRate',
  'RblReputationScheduler.scanFleet',
  'WpPodatnosciService.odswiez',
  'ZadaniaWTleService.sprawdzZalegle',
]);

export const kluczZadania = (klasa: string, metoda: string) => `${klasa}.${metoda}`;

/**
 * Czy zadanie „nie biegło dłużej niż 2× interwał”. Interwał wynika z harmonogramu, więc liczymy terminy, a nie
 * minuty: od ostatniego przebiegu (albo startu procesu, jeśli od startu jeszcze nie biegło — przestój API to nie
 * awaria zadania) minęły dwa kolejne terminy i zapas. Działa też dla nieregularnych wyrażeń (dni robocze, 1. dzień
 * miesiąca). `nastepnyPo` — następny termin ściśle po dacie; null — harmonogram bez kolejnych terminów.
 */
export function czyZalegle(o: {
  ostatniStart: Date | null;
  startProcesu: Date;
  teraz: Date;
  nastepnyPo: (d: Date) => Date | null;
}): boolean {
  const odniesienie =
    o.ostatniStart && o.ostatniStart.getTime() > o.startProcesu.getTime() ? o.ostatniStart : o.startProcesu;
  const pierwszy = o.nastepnyPo(odniesienie);
  if (!pierwszy) return false;
  const drugi = o.nastepnyPo(pierwszy);
  if (!drugi) return false;
  return o.teraz.getTime() > drugi.getTime() + ZAPAS_MS;
}

/** Treść błędu do rejestru — bez stosu, przycięta (stos jest w logu procesu i GlitchTipie). */
export function opisBledu(e: unknown): string {
  const t = e instanceof Error ? `${e.name === 'Error' ? '' : `${e.name}: `}${e.message}` : String(e);
  return t.slice(0, 2000);
}

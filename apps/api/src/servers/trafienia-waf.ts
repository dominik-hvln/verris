import { NodeTaskStatus } from '@verris/database';

/**
 * F3.2 — odczyt wyniku zadania WAF_HITS (ops/scripts/node-waf-hits.sh): ostatnie trafienia reguł ModSecurity dla domen
 * konta. Tylko pola bez treści żądań: czas, domena, adres klienta, metoda, ścieżka bez query, reguła, czy zablokowano.
 */
export interface TrafienieWaf {
  czas: string | null;
  domena: string;
  ip: string;
  metoda: string;
  sciezka: string;
  regula: string;
  opis: string;
  zablokowano: boolean;
  status: string;
}

/**
 * Weryfikacja 11.10 — reguły zbiorcze OWASP CRS: nie konkretny atak, tylko przekroczony próg sumy punktów anomalii
 * (949110/980130 — żądanie, 959100/980140 — odpowiedź). Ta sama lista co ZBIORCZE w ops/scripts/node-waf-hits.sh.
 */
export const REGULY_ZBIORCZE_CRS: Readonly<Record<string, string>> = {
  '949110': 'Przekroczony próg anomalii (CRS)',
  '980130': 'Przekroczony próg anomalii (CRS)',
  '959100': 'Przekroczony próg anomalii w odpowiedzi (CRS)',
  '980140': 'Przekroczony próg anomalii w odpowiedzi (CRS)',
};

/**
 * Weryfikacja 11.10 — trafienie z samą regułą zbiorczą nie liczy się osobno, gdy w tym samym zdarzeniu (czas, domena,
 * adres, metoda, ścieżka) jest reguła konkretna; jego odmowa przechodzi na konkretną. Skrypt węzła robi to samo — tu dla
 * wyników zapisanych starszą wersją skryptu. Sama zbiorcza dostaje polski opis.
 */
function bezZbiorczychObokKonkretnych(t: TrafienieWaf[]): TrafienieWaf[] {
  const klucz = (x: TrafienieWaf) => [x.czas, x.domena, x.ip, x.metoda, x.sciezka].join('|');
  const konkretne = new Map<string, TrafienieWaf>();
  for (const x of t) if (!(x.regula in REGULY_ZBIORCZE_CRS) && !konkretne.has(klucz(x))) konkretne.set(klucz(x), x);
  const out: TrafienieWaf[] = [];
  for (const x of t) {
    const opisZbiorczej = REGULY_ZBIORCZE_CRS[x.regula];
    if (!opisZbiorczej) {
      out.push(x);
      continue;
    }
    const k = konkretne.get(klucz(x));
    if (!k) {
      out.push({ ...x, opis: opisZbiorczej });
      continue;
    }
    if (x.zablokowano && !k.zablokowano) Object.assign(k, { zablokowano: true, status: x.status });
  }
  return out;
}

export function trafieniaZLogu(log: string | null): TrafienieWaf[] {
  const out: TrafienieWaf[] = [];
  for (const l of (log ?? '').split('\n')) {
    const m = /^VERRIS_WAF ([^|]{1,25})\|([a-z0-9.-]{3,253})\|([0-9a-fA-F:.-]{1,45})\|([A-Z-]{1,10})\|([^|]{1,200})\|(\d{1,9})\|([^|]{0,150})\|([01])\|([0-9-]{1,3})$/.exec(l);
    if (!m || out.length >= 300) continue;
    out.push({
      czas: /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(m[1]!) ? m[1]! : null,
      domena: m[2]!,
      ip: m[3]!,
      metoda: m[4]!,
      sciezka: m[5]!,
      regula: m[6]!,
      opis: m[7]!,
      zablokowano: m[8] === '1',
      status: m[9]!,
    });
  }
  // Audyt Fali 3 — skrypt wypisuje od najstarszego (obcięcie przez agenta zabiera najstarsze); panel pokazuje najnowsze
  // pierwsze. Sortowanie stabilne, bez czasu na końcu — działa też dla wyniku starszego skryptu (najnowsze pierwsze).
  const t = (x: TrafienieWaf) => (x.czas ? Date.parse(x.czas) : -Infinity);
  return bezZbiorczychObokKonkretnych(out)
    .map((x, i) => ({ x, i }))
    .sort((a, b) => t(b.x) - t(a.x) || a.i - b.i)
    .map(({ x }) => x);
}

/** Najczęstsze reguły (do szybkiej diagnozy „co blokuje”): id, opis, ile razy, ile zablokowano, ostatnio. */
export function regulyZTrafien(t: TrafienieWaf[]) {
  const mapa = new Map<string, { regula: string; opis: string; razy: number; zablokowano: number; ostatnio: string | null; domeny: string[] }>();
  for (const x of t) {
    const r = mapa.get(x.regula) ?? { regula: x.regula, opis: x.opis, razy: 0, zablokowano: 0, ostatnio: null, domeny: [] };
    r.razy += 1;
    if (x.zablokowano) r.zablokowano += 1;
    if (x.czas && (!r.ostatnio || x.czas > r.ostatnio)) r.ostatnio = x.czas;
    if (!r.domeny.includes(x.domena)) r.domeny.push(x.domena);
    mapa.set(x.regula, r);
  }
  return [...mapa.values()].sort((a, b) => b.razy - a.razy).slice(0, 20);
}

export type ZadanieWaf = {
  id?: string;
  status: NodeTaskStatus;
  outputLog: string | null;
  errorMessage: string | null;
  createdAt: Date;
  /** Ostatni sygnał z węzła (heartbeat runnera co 60 s aktualizuje outputLog → updatedAt). */
  updatedAt?: Date;
  completedAt: Date | null;
};

/**
 * Noc 11→12.10 (d3: „Wczytaj z serwera” 21:47, o 23:0x dalej „stan z 16:58”) — zadanie, którego węzeł nie podjął
 * (QUEUED), albo podjął i przestał dawać znak życia (RUNNING bez heartbeatu), wisiało jako „w toku” bez końca:
 * QUEUED nie wygasa nigdzie, a RUNNING zamyka dopiero lease agenta (reclaimStaleRunningTasks — gdy agent nie pyta
 * o zadania, nigdy). Panel pokazywał wtedy tylko „Wczytywanie…”, a nowe zlecenie dostawało 409. Odczyt WAF trwa
 * sekundy, agent pyta co minutę, runner wysyła heartbeat co 60 s — 15 min (jak HEARTBEAT_STALE_MS w node-tasks.service)
 * bez podjęcia albo bez sygnału to zadanie wiszące: nie „w toku”, tylko błąd z możliwością ponowienia.
 */
export const ODCZYT_WISI_MS = 15 * 60 * 1000;

export const BLAD_NIE_PODJETO =
  'Serwer nie podjął odczytu w ciągu 15 min (agent zadań węzła nie odpowiada albo kolejka węzła stoi) — spróbuj ponownie; jeśli się powtarza, sprawdź kolejkę zadań węzła.';
export const BLAD_BEZ_SYGNALU =
  'Odczyt na serwerze nie dał znaku życia przez 15 min i nie zakończył się — spróbuj ponownie; jeśli się powtarza, sprawdź log zadania na węźle.';

export function zadanieWisi(z: ZadanieWaf, teraz: number = Date.now()): boolean {
  if (z.status === NodeTaskStatus.QUEUED) return teraz - z.createdAt.getTime() > ODCZYT_WISI_MS;
  if (z.status === NodeTaskStatus.RUNNING) return teraz - (z.updatedAt ?? z.createdAt).getTime() > ODCZYT_WISI_MS;
  return false;
}

const wToku = (z: ZadanieWaf) => z.status === NodeTaskStatus.QUEUED || z.status === NodeTaskStatus.RUNNING;

export function bladWaf(log: string | null, errorMessage: string | null): string {
  const l = (log ?? '').split('\n').reverse().find((x) => x.includes('[waf-hits] BŁĄD: '));
  if (l) return l.slice(l.indexOf('[waf-hits] BŁĄD: ') + '[waf-hits] BŁĄD: '.length).slice(0, 300);
  return (errorMessage ?? 'Zadanie na węźle nie powiodło się.').slice(0, 300);
}

/** Stan z ostatnich zadań WAF_HITS konta (najnowsze pierwsze). */
export function stanTrafien(zadania: ZadanieWaf[], teraz: number = Date.now()) {
  // Audyt Fali 3 — wynik wyczyszczony retencją (30 dni) to „nie wczytano”, nie „brak trafień”.
  const wynik = zadania.find((z) => z.status === NodeTaskStatus.COMPLETED && z.outputLog !== null) ?? null;
  const ostatnie = zadania[0] ?? null;
  // Noc 11→12.10 — zadanie wiszące nie jest „w toku” (nie blokuje ponowienia), tylko błędem ostatniego odczytu.
  const trwa = zadania.find((z) => wToku(z) && !zadanieWisi(z, teraz)) ?? null;
  const trafienia = trafieniaZLogu(wynik?.outputLog ?? null);
  const razem = /^VERRIS_WAF_RAZEM (\d+) (\d+)/m.exec(wynik?.outputLog ?? '');
  let blad: string | null = null;
  if (ostatnie?.status === NodeTaskStatus.FAILED) blad = bladWaf(ostatnie.outputLog, ostatnie.errorMessage);
  else if (ostatnie && zadanieWisi(ostatnie, teraz)) blad = ostatnie.status === NodeTaskStatus.QUEUED ? BLAD_NIE_PODJETO : BLAD_BEZ_SYGNALU;
  return {
    wToku: trwa !== null,
    /** Kiedy zlecono trwający odczyt i czy serwer już go podjął — panel mówi, na co czeka (nie samo „Wczytywanie…”). */
    zlecono: trwa ? trwa.createdAt.toISOString() : null,
    czekaNaSerwer: trwa?.status === NodeTaskStatus.QUEUED,
    wczytano: wynik ? (wynik.completedAt ?? wynik.createdAt).toISOString() : null,
    razem: razem ? Number(razem[1]) : null,
    trafienia,
    reguly: regulyZTrafien(trafienia),
    blad,
  };
}

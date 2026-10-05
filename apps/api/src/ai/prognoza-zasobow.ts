import type { ForecastConfidence, ForecastResource, ServiceForecastResourceDto } from '@verris/contracts';

/**
 * Prognoza zasobów liczona w panelu (decyzja 2026-10-05): liczby z regresji liniowej po pomiarach,
 * AI dopisuje tylko komentarz i zalecenia do gotowych liczb. Bez AI prognoza nadal działa.
 */
export const HORYZONT_DNI = 7;

export interface Pomiar {
  bucketStart: Date;
  cpuUsageAvg: number;
  memUsageAvgMb: number;
  diskUsageMb: number;
  ioUsageKbps: number;
}

export interface LimityPlanu {
  cpuLimit: number;
  ramLimitMb: number;
  diskLimitMb: number;
  ioLimitKbps: number;
}

const DZIEN_MS = 86_400_000;
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Nachylenie prostej najmniejszych kwadratów: przyrost y na dzień. */
function nachylenie(punkty: { x: number; y: number }[]): number {
  const n = punkty.length;
  const sx = punkty.reduce((a, p) => a + p.x, 0) / n;
  const sy = punkty.reduce((a, p) => a + p.y, 0) / n;
  const licz = punkty.reduce((a, p) => a + (p.x - sx) * (p.y - sy), 0);
  const mian = punkty.reduce((a, p) => a + (p.x - sx) ** 2, 0);
  return mian > 0 ? licz / mian : 0;
}

export function policzPrognoze(plan: LimityPlanu, pomiary: Pomiar[]) {
  const posort = [...pomiary].sort((a, b) => a.bucketStart.getTime() - b.bucketStart.getTime());
  const t0 = posort[0]?.bucketStart.getTime() ?? 0;
  const zakresDni = posort.length ? (posort[posort.length - 1].bucketStart.getTime() - t0) / DZIEN_MS : 0;
  const zasoby: [ForecastResource, number, (p: Pomiar) => number][] = [
    ['CPU', plan.cpuLimit, (p) => p.cpuUsageAvg],
    ['RAM', plan.ramLimitMb, (p) => p.memUsageAvgMb],
    ['DISK', plan.diskLimitMb, (p) => p.diskUsageMb],
    ['IO', plan.ioLimitKbps, (p) => p.ioUsageKbps],
  ];
  const resources: ServiceForecastResourceDto[] = zasoby
    .filter(([, limit]) => limit > 0)
    .map(([resource, limit, wart]) => {
      const pkt = posort.map((p) => ({ x: (p.bucketStart.getTime() - t0) / DZIEN_MS, y: (wart(p) / limit) * 100 }));
      const ostatnie = pkt.slice(-3);
      const teraz = ostatnie.reduce((a, p) => a + p.y, 0) / (ostatnie.length || 1);
      const naDzien = pkt.length > 1 ? nachylenie(pkt) : 0;
      const trend = Math.abs(naDzien) < 0.5 ? 'flat' : naDzien > 0 ? 'up' : 'down';
      const dni = teraz >= 100 ? 0 : naDzien > 0 ? (100 - teraz) / naDzien : null;
      return {
        resource,
        currentPct: r1(teraz),
        predictedPct: r1(Math.max(0, teraz + naDzien * HORYZONT_DNI)),
        trend,
        daysToLimit: dni === null || dni > 365 ? null : dni === 0 ? 0 : Math.max(1, Math.ceil(dni)),
        note: null,
      };
    });
  const confidence: ForecastConfidence = zakresDni >= 3 ? 'high' : zakresDni >= 1 ? 'medium' : 'low';
  return { confidence, horizonDays: HORYZONT_DNI, resources };
}

const NAZWA: Record<ForecastResource, string> = { CPU: 'CPU', RAM: 'pamięć RAM', DISK: 'dysk', IO: 'operacje dyskowe (IO)' };

/** Podsumowanie bez AI — zawsze dostępne. */
export function opisPrognozy(resources: ServiceForecastResourceDto[]): string {
  const zagrozone = resources
    .filter((r) => r.daysToLimit !== null && r.daysToLimit <= 30)
    .sort((a, b) => (a.daysToLimit ?? 0) - (b.daysToLimit ?? 0));
  if (!zagrozone.length) return 'Zasoby w normie — przy obecnym tempie żaden limit planu nie zostanie osiągnięty w ciągu 30 dni.';
  const r = zagrozone[0];
  return r.daysToLimit === 0
    ? `${NAZWA[r.resource][0].toUpperCase()}${NAZWA[r.resource].slice(1)} jest na limicie planu (${r.currentPct}%).`
    : `Najbliżej limitu: ${NAZWA[r.resource]} — ${r.currentPct}% teraz, limit za ok. ${r.daysToLimit} ${r.daysToLimit === 1 ? 'dzień' : 'dni'} przy obecnym tempie.`;
}

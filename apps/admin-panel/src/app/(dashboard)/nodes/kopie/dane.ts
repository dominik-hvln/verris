/** Odpowiedź GET /admin/live-readiness/proby-odtworzenia (H-20, model RestoreDrill; 50 ostatnich). */
export interface ProbaOdtworzenia {
  id: string;
  finishedAt: string;
  durationSec: number;
  result: "OK" | "FAILED";
  objectName: string;
  source: string;
  owner: string;
  notes: string | null;
  rowCounts: Record<string, number> | null;
}

/** Ostatnia próba z każdego źródła kopii (lista z API jest od najnowszej). */
export function ostatniePerZrodlo(proby: ProbaOdtworzenia[]): ProbaOdtworzenia[] {
  const out = new Map<string, ProbaOdtworzenia>();
  for (const p of proby) if (!out.has(p.source)) out.set(p.source, p);
  return [...out.values()];
}

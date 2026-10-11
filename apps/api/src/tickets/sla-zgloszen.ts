/**
 * F3.7 (OE-25) — progi SLA zgłoszeń: godziny na pierwszą odpowiedź i na rozwiązanie per priorytet. Do 11.10 zaszyte
 * w tickets.service.ts (URGENT/HIGH/NORMAL/LOW = 1/4/12/24 h i 8/24/72/120 h) — to są wartości domyślne. Zmienia je
 * tylko ADMIN (panel → Opieka nad zgłoszeniami), zapis w `platform_settings` pod `support.sla`.
 *
 * Czas zegarowy, przez całą dobę (decyzja 06.10 — bez godzin pracy i świąt, OE-26 poza zakresem).
 * Wzór polityk: Zendesk https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies,
 * HostBill https://hostbill.atlassian.net/wiki/spaces/DOCS/pages/2698412150/Ticket+Departments+-+SLA+Escalations.
 */
export const PRIORYTETY_SLA = ['URGENT', 'HIGH', 'NORMAL', 'LOW'] as const;
export type PriorytetSla = (typeof PRIORYTETY_SLA)[number];

export interface ProgiSla {
  /** Godziny na pierwszą odpowiedź człowieka. */
  odpowiedz: Record<PriorytetSla, number>;
  /** Godziny na rozwiązanie (zamknięcie). */
  rozwiazanie: Record<PriorytetSla, number>;
}

export const KLUCZ_SLA = 'support.sla';
export const SLA_MAX_GODZIN = 720;

export const DOMYSLNE_PROGI_SLA: ProgiSla = {
  odpowiedz: { URGENT: 1, HIGH: 4, NORMAL: 12, LOW: 24 },
  rozwiazanie: { URGENT: 8, HIGH: 24, NORMAL: 72, LOW: 120 },
};

const H = 3600_000;

/** Priorytet spoza listy (stare dane) liczy się jak LOW — tak działał dawny kod (gałąź „else”). */
function prio(p: string): PriorytetSla {
  return (PRIORYTETY_SLA as readonly string[]).includes(p) ? (p as PriorytetSla) : 'LOW';
}

/** Zapis z bazy → progi; uszkodzony zapis albo brak pola → wartość domyślna tego pola. */
export function odczytajProgiSla(raw: string | null | undefined): ProgiSla {
  let zapis: Partial<Record<keyof ProgiSla, Partial<Record<string, unknown>>>> = {};
  try {
    const p = raw ? JSON.parse(raw) : {};
    if (p && typeof p === 'object') zapis = p;
  } catch {
    /* uszkodzony zapis → domyślne */
  }
  const pole = (rodzaj: keyof ProgiSla) =>
    Object.fromEntries(
      PRIORYTETY_SLA.map((k) => {
        const v = zapis[rodzaj]?.[k];
        return [k, typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= SLA_MAX_GODZIN ? v : DOMYSLNE_PROGI_SLA[rodzaj][k]];
      }),
    ) as Record<PriorytetSla, number>;
  return { odpowiedz: pole('odpowiedz'), rozwiazanie: pole('rozwiazanie') };
}

/**
 * Błąd w progach (do pokazania administratorowi) albo null. Całe godziny 1–720; pilniejszy priorytet nie może mieć
 * dłuższego terminu niż mniej pilny; odpowiedź nie później niż rozwiązanie.
 */
export function bladProgowSla(p: ProgiSla): string | null {
  for (const rodzaj of ['odpowiedz', 'rozwiazanie'] as const) {
    for (const k of PRIORYTETY_SLA) {
      const v = p[rodzaj]?.[k];
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1 || v > SLA_MAX_GODZIN) {
        return `Podaj pełne godziny od 1 do ${SLA_MAX_GODZIN} (${rodzaj === 'odpowiedz' ? 'odpowiedź' : 'rozwiązanie'}, ${k}).`;
      }
    }
    for (let i = 1; i < PRIORYTETY_SLA.length; i++) {
      if (p[rodzaj][PRIORYTETY_SLA[i - 1]] > p[rodzaj][PRIORYTETY_SLA[i]]) {
        return `${PRIORYTETY_SLA[i - 1]} nie może mieć dłuższego terminu niż ${PRIORYTETY_SLA[i]}.`;
      }
    }
  }
  for (const k of PRIORYTETY_SLA) {
    if (p.odpowiedz[k] > p.rozwiazanie[k]) return `Termin odpowiedzi (${k}) nie może być dłuższy niż termin rozwiązania.`;
  }
  return null;
}

export function terminOdpowiedzi(priorytet: string, od: Date, progi: ProgiSla): Date {
  return new Date(od.getTime() + progi.odpowiedz[prio(priorytet)] * H);
}

export function terminRozwiazania(priorytet: string, od: Date, progi: ProgiSla): Date {
  return new Date(od.getTime() + progi.rozwiazanie[prio(priorytet)] * H);
}

/**
 * Terminy po zmianie priorytetu (OE-25, uwaga z przeglądu 10.10: wcześniej liczone tylko przy utworzeniu). Liczone od
 * utworzenia zgłoszenia, jak w politykach SLA helpdesków. Bez zmian, gdy termin już nie biegnie: pierwsza odpowiedź
 * była, zgłoszenie zamknięte albo terminu nie było (np. zgłoszenie założone przez obsługę nie ma terminu odpowiedzi).
 * Gdy nowy termin odpowiedzi jest w przyszłości, alert „SLA przekroczone” może przyjść ponownie.
 */
export function terminyPoZmianiePriorytetu(
  t: {
    createdAt: Date;
    status: string;
    firstResponseAt: Date | null;
    slaResponseDueAt: Date | null;
    slaResolveDueAt: Date | null;
  },
  nowyPriorytet: string,
  progi: ProgiSla,
  teraz = new Date(),
): { slaResponseDueAt?: Date; slaResolveDueAt?: Date; slaResponseBreachAlertedAt?: null } {
  const out: { slaResponseDueAt?: Date; slaResolveDueAt?: Date; slaResponseBreachAlertedAt?: null } = {};
  if (t.status === 'CLOSED') return out;
  if (t.slaResponseDueAt && !t.firstResponseAt) {
    out.slaResponseDueAt = terminOdpowiedzi(nowyPriorytet, t.createdAt, progi);
    if (out.slaResponseDueAt > teraz) out.slaResponseBreachAlertedAt = null;
  }
  if (t.slaResolveDueAt) out.slaResolveDueAt = terminRozwiazania(nowyPriorytet, t.createdAt, progi);
  return out;
}

/** Odczyt progów z `platform_settings` (bez pamięci podręcznej — jeden odczyt na zgłoszenie). */
export async function wczytajProgiSla(prisma: {
  platformSetting: { findUnique(a: { where: { key: string } }): Promise<{ value: string } | null> };
}): Promise<ProgiSla> {
  const w = await prisma.platformSetting.findUnique({ where: { key: KLUCZ_SLA } });
  return odczytajProgiSla(w?.value);
}

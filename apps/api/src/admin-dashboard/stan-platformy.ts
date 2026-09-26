/**
 * PB-34 — pulpit admina „Stan platformy” (makieta Main.dc.html): czyste funkcje bez bazy,
 * żeby reguły „co wymaga uwagi” i „jaki stan ma węzeł” dało się sprawdzić testem jednostkowym.
 */

export type Waga = 'crit' | 'warn';
export interface SprawaUwagi {
  waga: Waga;
  tytul: string;
  opis: string;
  akcja: string;
  href: string;
}

export interface WezelWejscie {
  id: string;
  name: string | null;
  hostname: string | null;
  ipAddress: string;
  status: string;
  acceptsNewAccounts: boolean;
  lastHeartbeatAt: Date | null;
  onboardVerifiedAt: Date | null;
  onboardReport: unknown;
  maintenanceReason: string | null;
  totalCpuCores: number | null;
}

/** Heartbeat agenta idzie co minutę; > 5 min = brak sygnału (jak w audycie węzła). */
export const SYGNAL_MAX_MIN = 5;

export const nazwaWezla = (s: Pick<WezelWejscie, 'name' | 'hostname' | 'ipAddress'>) =>
  s.name?.trim() || s.hostname?.trim() || s.ipAddress;

const minutOd = (d: Date, teraz: number) => Math.floor((teraz - d.getTime()) / 60_000);

function raportOnboardu(r: unknown): { fail: number; warn: number; podsumowanie: string } | null {
  if (!r || typeof r !== 'object') return null;
  const o = r as { fail?: unknown; warn?: unknown; podsumowanie?: unknown };
  return {
    fail: Number(o.fail) || 0,
    warn: Number(o.warn) || 0,
    podsumowanie: typeof o.podsumowanie === 'string' ? o.podsumowanie : '',
  };
}

/** Pierwsze linie FAIL z raportu gotowości — krótko, do jednego wiersza. */
function bledyOnboardu(podsumowanie: string): string {
  const linie = podsumowanie
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /FAIL/i.test(l))
    .map((l) => l.replace(/^[^A-Za-zÀ-ž]*FAIL[:\s-]*/i, '').trim())
    .filter(Boolean);
  return linie.slice(0, 3).join(', ');
}

/** Dlaczego węzeł nie dostaje nowych kont (null = jest w puli). */
export function pozaPula(s: WezelWejscie): string | null {
  if (s.status === 'OFFLINE') return 'offline';
  if (s.status === 'INIT') return 'zakładanie węzła';
  if (s.status === 'PENDING_APPROVAL') return 'czeka na zatwierdzenie';
  if (s.status === 'DEPROVISIONING') return 'wycofywany';
  if (s.status === 'MAINTENANCE') return 'poza pulą — serwis';
  if (!s.onboardVerifiedAt) return 'poza pulą — onboard';
  if (!s.acceptsNewAccounts) return 'poza pulą — wstrzymany';
  return null;
}

export type StanWezla = 'ok' | 'warn' | 'crit';

export function stanWezla(s: WezelWejscie, cpuProc: number | null, teraz: number): StanWezla {
  const cichy = s.status === 'ACTIVE' && (!s.lastHeartbeatAt || minutOd(s.lastHeartbeatAt, teraz) > SYGNAL_MAX_MIN);
  if (s.status === 'OFFLINE' || cichy) return 'crit';
  if (s.status === 'ACTIVE' && !s.onboardVerifiedAt && raportOnboardu(s.onboardReport)) return 'crit';
  if (pozaPula(s) || (cpuProc ?? 0) >= 60) return 'warn';
  return 'ok';
}

/** Sprawy węzłów do karty „Wymaga uwagi”. */
export function uwagaWezlow(wezly: WezelWejscie[], teraz: number): SprawaUwagi[] {
  const out: SprawaUwagi[] = [];
  for (const s of wezly) {
    const n = nazwaWezla(s);
    const href = `/nodes/${s.id}`;
    const raport = raportOnboardu(s.onboardReport);
    if (s.status === 'OFFLINE') {
      const kiedy = s.lastHeartbeatAt ? `ostatni sygnał ${minutOd(s.lastHeartbeatAt, teraz)} min temu` : 'brak sygnału od startu';
      out.push({ waga: 'crit', tytul: `${n} jest offline`, opis: `${kiedy} · konta na węźle mogą nie działać`, akcja: 'Węzeł', href });
      continue;
    }
    if (s.status === 'ACTIVE' && (!s.lastHeartbeatAt || minutOd(s.lastHeartbeatAt, teraz) > SYGNAL_MAX_MIN)) {
      const kiedy = s.lastHeartbeatAt ? `${minutOd(s.lastHeartbeatAt, teraz)} min bez sygnału` : 'agent jeszcze się nie odezwał';
      out.push({ waga: 'crit', tytul: `${n} nie wysyła sygnału`, opis: `${kiedy} · sprawdź agenta na węźle`, akcja: 'Węzeł', href });
    }
    if (s.status === 'ACTIVE' && !s.onboardVerifiedAt && raport) {
      const bledy = bledyOnboardu(raport.podsumowanie);
      out.push({
        waga: 'crit',
        tytul: `${n} nie przeszedł weryfikacji onboardu`,
        opis: `${raport.fail} × FAIL${bledy ? `: ${bledy}` : ''} · węzeł nie dostaje nowych kont`,
        akcja: 'Raport',
        href,
      });
    }
    if (s.status === 'PENDING_APPROVAL') {
      out.push({ waga: 'warn', tytul: `${n} czeka na zatwierdzenie`, opis: 'agent się połączył · zatwierdź, aby rozpocząć onboard', akcja: 'Węzeł', href });
    }
    if (s.status === 'MAINTENANCE') {
      out.push({
        waga: 'warn',
        tytul: `${n} w trybie serwisowym`,
        opis: `${s.maintenanceReason?.trim() || 'bez podanego powodu'} · węzeł nie dostaje nowych kont`,
        akcja: 'Węzeł',
        href,
      });
    }
  }
  return out;
}

export function sygnal(d: Date | null, teraz: number): string {
  if (!d) return 'brak';
  const m = minutOd(d, teraz);
  if (m < 2) return 'na żywo';
  if (m < 120) return `${m} min temu`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h} h temu` : `${Math.floor(h / 24)} dni temu`;
}

/** Zdarzenia do karty „Ostatnie zdarzenia” — tylko te, które mówią coś o stanie platformy. */
export const ZDARZENIA: Record<string, string> = {
  SERVER_INIT: 'Dodano węzeł',
  SERVER_APPROVED: 'Zatwierdzono węzeł',
  NODE_OFFLINE_ALERT: 'Węzeł przestał odpowiadać',
  NODE_RECOVERED: 'Węzeł znów odpowiada',
  NODE_SECURITY_ALERT: 'Alert bezpieczeństwa węzła',
  NODE_CAPACITY_ALERT: 'Węzeł blisko limitu pojemności',
  NODE_RBL_ALERT: 'IP węzła na liście blokad poczty',
  NODE_RBL_CLEARED: 'IP węzła zdjęte z listy blokad',
  ADMIN_NODE_MAINTENANCE_MODE_TOGGLED: 'Zmieniono tryb serwisowy węzła',
  FLEET_UPDATE_QUEUED: 'Uruchomiono falę aktualizacji floty',
  FLEET_UPDATE_FINISHED: 'Fala aktualizacji floty zakończona',
  FLEET_UPDATE_STOPPED: 'Fala aktualizacji zatrzymana',
  STACK_MANIFEST_UPDATED: 'Zmieniono manifest stosu floty',
  SUBSCRIPTION_ACTIVATED: 'Usługa uruchomiona',
  SUBSCRIPTION_SUSPENDED: 'Usługa zawieszona',
  SUBSCRIPTION_UNSUSPENDED: 'Usługa wznowiona',
  SUBSCRIPTION_CANCELED: 'Usługa anulowana',
  SUBSCRIPTION_CUSTOM_TERMS: 'Zmieniono warunki usługi',
  SUBSCRIPTION_PROVISIONING_FAILED: 'Zakładanie usługi nie powiodło się',
  PROVISIONING_FAILED: 'Zakładanie konta nie powiodło się',
  RESELLER_CLIENT_CREATED: 'Nowy klient przez resellera',
  ADMIN_CUSTOMER_CREATED_BY_OPERATOR: 'Operator założył klienta',
  PLATFORM_SETTINGS_UPDATED: 'Zmieniono ustawienia platformy',
  STAFF_OPERATOR_CREATED: 'Dodano operatora',
  STAFF_ROLE_ASSIGNED: 'Zmieniono rolę operatora',
  BREAK_GLASS_LOGIN_USED: 'Użyto logowania awaryjnego',
  KSEF_INVOICE_REJECTED: 'KSeF odrzucił fakturę',
  STRIPE_WEBHOOK_ZACIETY_ALERT: 'Zdarzenie płatności utknęło',
};

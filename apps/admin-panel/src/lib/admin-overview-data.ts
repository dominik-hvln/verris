import { adminApi } from "./api";

/** Odpowiedź `GET /admin/dashboard/overview`. */
export type AdminDashboardOverview = StanPlatformy & {
  generatedAt: string;
  users: { total: number; clients: number; staffAndAdmin: number };
  subscriptions: { byStatus: Record<string, number>; active: number };
  servers: { total: number; active: number; byStatus: Record<string, number> };
  accounts: { total: number };
  tickets: { openNonClosed: number };
  billing: {
    periodDays: number;
    walletNetPln: string;
    walletByTypePln: Record<string, string>;
  };
  serverRows: Array<{
    id: string;
    name: string;
    ipAddress: string;
    region: string | null;
    status: string;
    lastHeartbeatAt: string | null;
    allocatedCpu: number;
    totalCpuCores: number | null;
  }>;
  recentSubscriptions: Array<{
    id: string;
    status: string;
    createdAt: string;
    priceAmount: unknown;
    currency: string;
    interval: string;
    plan: { name: string; slug: string };
    user: { email: string; firstName: string | null; lastName: string | null };
  }>;
};

/** PB-34 — sprawa na karcie „Wymaga uwagi”. */
export type SprawaUwagi = { waga: "crit" | "warn"; tytul: string; opis: string; akcja: string; href: string };

/** PB-34 — „Stan platformy” (makieta Main.dc.html). */
export type StanPlatformy = {
  naUwadze: SprawaUwagi[];
  flota: {
    manifest: string;
    wezly: Array<{
      id: string;
      nazwa: string;
      status: string;
      stan: "ok" | "warn" | "crit";
      cpuProc: number | null;
      poza: string | null;
      konta: number;
      sygnal: string;
      naZywo: boolean;
    }>;
  };
  klienci: { razem: number; nowi7d: number; dzienne7: number[] };
  uslugi: { aktywne: number; hosting: number; poczta: number; inne: number; zakladane: number; zawieszone: number; wszystkie: number };
  wplywy: { okresDni: number; bruttoPln: string; dzienne7: number[] };
  zgloszenia: { otwarte: number; poTerminie: number; dzis: number };
  zdarzenia: Array<{ id: string; at: string; tekst: string; kto: string | null; czego: string | null; href: string | null }>;
  noweUslugi: Array<{
    id: string;
    status: string;
    interval: string;
    plan: string;
    domena: string | null;
    wezel: string | null;
    cenaIndywidualna: string | null;
    klient: string;
    klientId: string;
  }>;
};

export async function fetchAdminDashboardOverview(): Promise<AdminDashboardOverview> {
  return adminApi<AdminDashboardOverview>("/admin/dashboard/overview");
}

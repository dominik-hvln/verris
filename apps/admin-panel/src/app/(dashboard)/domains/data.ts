import { adminApi } from "@/lib/api";

/** F2.7 — kształty odpowiedzi admin/domains (apps/api/src/domains/domeny-operatora.service.ts). */
export interface WierszDomeny {
  id: string;
  name: string;
  status: string;
  registrarStatus: string | null;
  uNas: boolean;
  expiresAt: string | null;
  autoRenew: boolean;
  transferLock: boolean;
  lastRegistrarSyncAt: string | null;
  createdAt: string;
  user: { id: string; email: string; firstName: string | null; lastName: string | null };
}

export interface ListaDomen {
  rows: WierszDomeny[];
  total: number;
  page: number;
  totalPages: number;
  liczby: { verris: number; wygasa30: number; nieudane: number };
}

export interface ZamowienieDomeny {
  id: string;
  domainName: string;
  type: string;
  status: string;
  years: number;
  priceAmount: string | null;
  currency: string;
  lastError?: string | null;
  createdAt: string;
  submittedAt?: string | null;
  userId: string;
  user: { email: string; firstName: string | null; lastName: string | null };
  moznaPonowic?: boolean;
}

export interface KartaDomeny {
  id: string;
  name: string;
  status: string;
  registrarProvider: string | null;
  registrarExternalId: string | null;
  registrarStatus: string | null;
  expiresAt: string | null;
  autoRenew: boolean;
  nameservers: string[];
  transferLock: boolean;
  whoisPrivacy: boolean;
  lastRegistrarSyncAt: string | null;
  createdAt: string;
  uNas: boolean;
  klient: { id: string; email: string; firstName: string | null; lastName: string | null; role: string; walletBalance: string };
  usluga: { id: string; stanKonta: string } | null;
  zamowienia: Array<{
    id: string;
    type: string;
    status: string;
    years: number;
    priceAmount: string | null;
    currency: string;
    walletTxId: string | null;
    lastError: string | null;
    createdAt: string;
    completedAt: string | null;
    moznaPonowic: boolean;
  }>;
  historia: Array<{ id: string; action: string; details: Record<string, unknown> | null; aktor: string | null; createdAt: string }>;
}

export interface FiltryDomen {
  stan?: string;
  rejestr?: string;
  wygasa?: string;
  q?: string;
}

export function parametryDomen(f: FiltryDomen, page = 1): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of ["stan", "rejestr", "wygasa", "q"] as const) {
    const v = f[k]?.trim();
    if (v) p.set(k, v);
  }
  if (page > 1) p.set("page", String(page));
  return p;
}

export async function listaDomen(f: FiltryDomen, page = 1): Promise<ListaDomen> {
  const qs = parametryDomen(f, page).toString();
  return adminApi<ListaDomen>(`/admin/domains${qs ? `?${qs}` : ""}`);
}

export const TYP_ZAMOWIENIA: Record<string, string> = { REGISTER: "Rejestracja", TRANSFER: "Transfer", RENEW: "Odnowienie", WHOIS_PRIVACY: "Ukrycie WHOIS" };
export const STAN_ZAMOWIENIA: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  PENDING_PAYMENT: { t: "brak środków", ton: "warn" },
  QUEUED: { t: "w kolejce", ton: "warn" },
  SUBMITTED: { t: "u rejestratora", ton: "warn" },
  COMPLETED: { t: "zakończone", ton: "ok" },
  FAILED: { t: "nieudane", ton: "crit" },
  CANCELED: { t: "anulowane", ton: "muted" },
};
/** Stan domeny w Verris i u rejestratora (domain-registrar.service.ts: REGISTERED, TRANSFERRED, odejście). */
export function stanDomeny(d: { status: string; registrarStatus: string | null; uNas: boolean; expiresAt: string | null }): { t: string; ton: "ok" | "warn" | "crit" | "muted" } {
  if (d.registrarStatus === "TRANSFERRED_OUT") return { t: "przeniesiona do innego rejestratora", ton: "muted" };
  if (d.registrarStatus === "DELETED" || d.registrarStatus === "REGISTRAR_DEL") return { t: "usunięta u rejestratora", ton: "crit" };
  if (d.uNas && d.expiresAt && new Date(d.expiresAt).getTime() < Date.now()) return { t: "wygasła", ton: "crit" };
  if (d.uNas && d.expiresAt && new Date(d.expiresAt).getTime() < Date.now() + 30 * 86_400_000) return { t: "wygasa", ton: "warn" };
  if (d.uNas) return { t: "u Verris", ton: "ok" };
  if (d.status === "PENDING") return { t: "niezweryfikowana", ton: "warn" };
  return { t: "poza Verris", ton: "muted" };
}

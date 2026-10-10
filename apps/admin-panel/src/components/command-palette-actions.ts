"use server";

import { AdminApiError, adminApi } from "@/lib/api";

export type TypWyniku = "user" | "service" | "domain" | "invoice" | "node" | "ticket" | "migration";

export interface GlobalSearchResult {
  type: TypWyniku;
  id: string;
  title: string;
  subtitle: string;
  href: string;
  /** Węzeł: ServerStatus; usługa: SubscriptionStatus; faktura: InvoiceStatus (działania dostępne w tym stanie). */
  status?: string;
  /** Faktura: KsefStatus (ponowienie tylko odrzuconej). */
  ksefStatus?: string;
  /** Usługa: zakładanie konta padło — tylko wtedy „Ponów albo odrzuć zakładanie”. */
  zakladanieNieudane?: boolean;
  /** Właściciel (usługa, faktura) — działanie „Karta klienta”. */
  userId?: string | null;
}

export interface WynikWyszukiwania {
  results: GlobalSearchResult[];
  /** Typy pominięte z braku uprawnień (paleta mówi o tym zamiast pustej listy). */
  pominiete: TypWyniku[];
  /** API nie odpowiedziało — paleta mówi „Nie udało się wczytać” zamiast „Brak wyników” (fala 1B). */
  blad?: boolean;
}

export async function globalSearchAction(q: string): Promise<WynikWyszukiwania> {
  if (!q || q.trim().length < 2) return { results: [], pominiete: [] };
  try {
    const res = await adminApi<Partial<WynikWyszukiwania>>(`/admin/search?q=${encodeURIComponent(q.trim())}`);
    return { results: res.results ?? [], pominiete: res.pominiete ?? [] };
  } catch (e) {
    // 403 — rola nie ma żadnego z uprawnień wyszukiwarki (apps/api/src/search/search.service.ts).
    if (e instanceof AdminApiError && e.status === 403) {
      return { results: [], pominiete: ["user", "service", "domain", "invoice", "node", "ticket", "migration"] };
    }
    return { results: [], pominiete: [], blad: true };
  }
}

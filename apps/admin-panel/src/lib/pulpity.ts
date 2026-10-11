import type { DostepDoAkcji } from "./akcje/wezel";

/**
 * F3.9 (OP-07) — pulpity per rola: który pulpit pokazać operatorowi i między którymi może się przełączać.
 * Zakładka jest tylko tam, gdzie pulpit ma sens dla pracy roli (pisze do klientów, utrzymuje flotę, rozlicza) —
 * API pozwala czytać szerzej (uprawnienia odczytu), ale panel nie zaśmieca pulpitu konsultanta finansami.
 */
export type Pulpit = "obsluga" | "noc" | "finanse" | "admin";

export const NAZWY_PULPITOW: Record<Pulpit, string> = {
  obsluga: "Moje zgłoszenia",
  noc: "Flota i alerty",
  finanse: "Finanse",
  admin: "Stan platformy",
};

const ma = (d: DostepDoAkcji, p: string) => d.permissions.includes(p);

/** Pulpity dostępne dla operatora, w kolejności zakładek. */
export function dostepnePulpity(d: DostepDoAkcji): Pulpit[] {
  if (d.isAdmin) return ["admin", "obsluga", "noc", "finanse"];
  const out: Pulpit[] = [];
  if (ma(d, "TICKETS_MANAGE")) out.push("obsluga");
  if (ma(d, "NODES_VIEW") && (ma(d, "NODES_MANAGE") || ma(d, "NODE_SERVICES"))) out.push("noc");
  if (ma(d, "BILLING_MANAGE")) out.push("finanse");
  if (ma(d, "DASHBOARD_VIEW")) out.push("admin");
  return out;
}

/**
 * Pulpit domyślny wg roli: administrator — „Stan platformy”; NOC (usługi węzła albo zarządzanie węzłami bez finansów) —
 * flota; Finanse (rozliczenia bez węzłów) — finanse; kto odpowiada klientom — zgłoszenia; reszta — pierwszy dostępny.
 * `wybrany` z adresu (?pulpit=) wygrywa, jeśli jest dostępny.
 */
export function pulpitOperatora(d: DostepDoAkcji, wybrany?: string | null): Pulpit | null {
  const dostepne = dostepnePulpity(d);
  if (wybrany && (dostepne as string[]).includes(wybrany)) return wybrany as Pulpit;
  if (d.isAdmin) return "admin";
  if (dostepne.includes("noc") && (ma(d, "NODE_SERVICES") || !ma(d, "BILLING_MANAGE"))) return "noc";
  if (dostepne.includes("finanse") && !ma(d, "NODES_MANAGE")) return "finanse";
  if (dostepne.includes("obsluga")) return "obsluga";
  return dostepne[0] ?? null;
}

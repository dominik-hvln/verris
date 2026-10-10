/** D1 (10.10) — jeden panel operatora: wchodzi ADMIN i STAFF; co STAFF widzi, decydują uprawnienia (RBAC w API). */
export function rolaPaneluOperatora(role: string | null | undefined): role is "ADMIN" | "STAFF" {
  return role === "ADMIN" || role === "STAFF";
}

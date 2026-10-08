/**
 * PB-43 — usługa, której dotyczy zgłoszenie: nazwa dla klienta i opcje wyboru w formularzu.
 * Czysta logika (bez fetch), żeby dało się ją sprawdzić testem.
 */

export interface UslugaDoZgloszenia {
  id: string;
  nazwa: string;
}

/** Kształt usługi z API (lista `/services` albo `ticket.subscription`) — tylko pola, z których składamy nazwę. */
export interface UslugaZApi {
  id: string;
  serviceTag?: string | null;
  planName?: string | null;
  plan?: { name: string | null } | null;
  account?: { domain: string | null } | null;
}

/** Domena, a bez niej plan; tag usługi w nawiasie, żeby odróżnić dwa pakiety bez domeny. */
export function nazwaUslugi(u: UslugaZApi): string {
  const plan = u.planName ?? u.plan?.name ?? null;
  const glowna = u.account?.domain || plan || "Usługa";
  return u.serviceTag ? `${glowna} (${u.serviceTag})` : glowna;
}

export const BEZ_USLUGI = { value: "", label: "Nie dotyczy konkretnej usługi" };

/** Opcje wyboru i wartość domyślna: jedyna usługa jest wybrana od razu, przy kilku klient wskazuje sam. */
export function opcjeUslug(uslugi: UslugaDoZgloszenia[]): { opcje: { value: string; label: string }[]; domyslna: string } {
  return {
    opcje: [...uslugi.map((u) => ({ value: u.id, label: u.nazwa })), BEZ_USLUGI],
    domyslna: uslugi.length === 1 ? uslugi[0].id : "",
  };
}

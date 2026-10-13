import { adminApi } from "@/lib/api";

/** M-06 — faktura, do której wystawiamy korektę. */
export interface FakturaDoKorekty {
  id: string;
  number: string;
  status: string;
  kind?: string;
  amount: string;
  netAmount: string | null;
  vatAmount: string | null;
  currency: string;
  issuedAt: string | null;
  lineItems:
    | Array<{ name: string; quantity: number; totalGross: string }>
    | null;
  buyerSnapshot: Record<string, unknown> | null;
}

export interface KorektaRow {
  id: string;
  number: string;
  correctionKind: "WARTOSCIOWA" | "FORMALNA";
  correctionReason: string | null;
  roznicaBrutto: string;
  bruttoPrzed: string | null;
  currency: string;
  issuedAt: string | null;
  storageKey: string | null;
}

type FakturaZApi = FakturaDoKorekty & {
  stanPoKorektach?: Pick<FakturaDoKorekty, "amount" | "netAmount" | "vatAmount" | "lineItems" | "buyerSnapshot"> | null;
};

/**
 * Faktura do korekty. Gdy ma już korekty — pozycje, kwoty i nabywca po ostatniej z nich: od tego stanu API liczy
 * kolejną korektę (przegląd 13.10: formularz startował od faktury pierwotnej i K2 przywracała pozycje zdjęte w K1).
 */
export function doKorekty(f: FakturaZApi): FakturaDoKorekty {
  const { stanPoKorektach: stan, ...faktura } = f;
  return stan ? { ...faktura, ...stan } : faktura;
}

export async function getFaktura(id: string): Promise<FakturaDoKorekty> {
  return doKorekty(await adminApi<FakturaZApi>(`/admin/invoices/${id}`));
}

export async function getKorekty(id: string): Promise<KorektaRow[]> {
  return adminApi<KorektaRow[]>(`/admin/invoices/${id}/korekty`);
}

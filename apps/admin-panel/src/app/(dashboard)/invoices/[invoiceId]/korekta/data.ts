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

export async function getFaktura(id: string): Promise<FakturaDoKorekty> {
  return adminApi<FakturaDoKorekty>(`/admin/invoices/${id}`);
}

export async function getKorekty(id: string): Promise<KorektaRow[]> {
  return adminApi<KorektaRow[]>(`/admin/invoices/${id}/korekty`);
}

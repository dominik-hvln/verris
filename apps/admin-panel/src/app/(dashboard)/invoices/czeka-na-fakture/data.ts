import { adminApi } from "@/lib/api";

/** FAK-01 — dokument rozliczeniowy czekający na fakturę z programu księgowego. */
export interface DokumentCzekajacy {
  id: string;
  number: string;
  kind: string;
  userId: string;
  amount: string;
  netAmount: string | null;
  vatAmount: string | null;
  currency: string;
  issuedAt: string | null;
  paidAt: string | null;
}

export async function getCzekajace(): Promise<DokumentCzekajacy[]> {
  return adminApi<DokumentCzekajacy[]>("/admin/invoices/czeka-na-fakture?limit=200");
}

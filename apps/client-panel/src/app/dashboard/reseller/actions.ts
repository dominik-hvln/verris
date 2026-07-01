'use server';

import { apiFetch, ApiError } from '@/lib/api';

export type ResellerOverview = {
  status: 'PENDING' | 'ACTIVE' | 'SUSPENDED';
  brandName: string | null;
  markupPct: number;
  code: string;
  inviteLink: string;
  clientsCount: number;
  monthlyRetail: number;
  monthlyWholesale: number;
};
export type ResellerClient = {
  id: string;
  email: string;
  name: string | null;
  createdAt: string;
  services: { id: string; plan: string | null; status: string; wholesale: number; retail: number; currency: string }[];
};

export async function fetchResellerOverview(): Promise<
  { ok: true; data: ResellerOverview } | { ok: false; notReseller: boolean }
> {
  try {
    const data = await apiFetch<ResellerOverview>('/reseller/me/overview');
    return { ok: true, data };
  } catch (e) {
    const notReseller = e instanceof ApiError && (e.status === 403 || e.status === 404);
    return { ok: false, notReseller: !!notReseller };
  }
}

export async function fetchResellerClients(): Promise<ResellerClient[]> {
  try {
    return await apiFetch<ResellerClient[]>('/reseller/me/clients');
  } catch {
    return [];
  }
}

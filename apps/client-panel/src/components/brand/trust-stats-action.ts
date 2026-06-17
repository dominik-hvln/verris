'use server';

const API_URL = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export interface PublicStats {
  hostedAccounts: number;
  domains: number;
  activeNodes: number;
}

/** O-5 — public trust-signal counts (no auth). */
export async function fetchPublicStats(): Promise<PublicStats | null> {
  try {
    const res = await fetch(`${API_URL}/public/stats`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    return (await res.json()) as PublicStats;
  } catch {
    return null;
  }
}

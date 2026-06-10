"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface VpnPeerDto {
  id: string;
  name: string;
  ownerEmail: string | null;
  publicKey: string;
  assignedIp: string;
  enabled: boolean;
  revokedAt: string | null;
  createdAt: string;
}

export interface VpnOverviewDto {
  configured: boolean;
  endpoint: string | null;
  serverPublicKey: string | null;
  subnet: string;
  clientAllowedIps: string;
  peers: VpnPeerDto[];
}

export async function fetchVpnOverview() {
  try {
    return { data: await adminApi<VpnOverviewDto>("/admin/vpn/overview") };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function createVpnPeer(input: { name: string; ownerEmail?: string }) {
  try {
    const data = await adminApi<{ peer: VpnPeerDto; clientConfig: string }>(
      "/admin/vpn/peers",
      { method: "POST", body: input },
    );
    revalidatePath("/vpn");
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

export async function revokeVpnPeer(id: string) {
  try {
    const data = await adminApi<VpnPeerDto>(`/admin/vpn/peers/${id}/revoke`, {
      method: "POST",
    });
    revalidatePath("/vpn");
    return { data };
  } catch (err) {
    return { error: extractError(err) };
  }
}

function extractError(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return err instanceof Error ? err.message : "Nieznany błąd";
}

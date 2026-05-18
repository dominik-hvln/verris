"use server";

import { redirect } from "next/navigation";
import { StaffApiError, staffApi } from "@/lib/staff-api";
import { staffRunDnsTlsDiagnostic, type StaffDnsTlsResult } from "@/lib/crm-profile-data";

const CLIENT_PANEL_URL =
  process.env.CLIENT_PANEL_URL ?? "http://localhost:3001";

interface ImpersonateResponse {
  access_token: string;
  expiresIn: string;
  target: { id: string; email: string };
  actor: { id: string; role: string };
}

export async function staffImpersonateUserAction(
  userId: string,
  reason?: string,
): Promise<{ ok: false; error: string } | never> {
  let res: ImpersonateResponse;
  try {
    res = await staffApi<ImpersonateResponse>(`/admin/users/${userId}/impersonate`, {
      method: "POST",
      body: { reason: reason?.trim() || undefined },
    });
  } catch (err) {
    if (err instanceof StaffApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zainicjować impersonacji." };
  }

  const url = new URL(`${CLIENT_PANEL_URL}/impersonate`);
  url.searchParams.set("token", res.access_token);
  url.searchParams.set("returnTo", "/dashboard");
  url.searchParams.set("operator", "staff");
  redirect(url.toString());
}

export async function staffRunDnsTlsDiagnosticAction(
  userId: string,
  payload: { subscriptionId?: string; domain?: string },
): Promise<{ ok: true; data: StaffDnsTlsResult } | { ok: false; error: string }> {
  try {
    const data = await staffRunDnsTlsDiagnostic(userId, payload);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof StaffApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Diagnostyka DNS/TLS nie powiodła się." };
  }
}

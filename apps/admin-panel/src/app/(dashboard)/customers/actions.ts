"use server";

import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/api";

const CLIENT_PANEL_URL =
  process.env.CLIENT_PANEL_URL ?? "http://localhost:3001";

interface ImpersonateResponse {
  access_token: string;
  expiresIn: string;
  target: { id: string; email: string };
  actor: { id: string; role: string };
}

/**
 * Mints an impersonation JWT against the API and redirects the browser to the
 * client panel's `/impersonate` handoff route. The handoff route stores the
 * token in `auth_token` (httpOnly) and redirects into the dashboard.
 *
 * We never carry the admin's regular `auth_token` through the redirect — only
 * the freshly-minted, short-lived impersonation token.
 */
export async function impersonateUserAction(
  userId: string,
  reason?: string,
): Promise<{ ok: false; error: string } | never> {
  let res: ImpersonateResponse;
  try {
    res = await adminApi<ImpersonateResponse>(
      `/admin/users/${userId}/impersonate`,
      {
        method: "POST",
        body: { reason: reason?.trim() || undefined },
      },
    );
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zainicjować impersonacji" };
  }

  const url = new URL(`${CLIENT_PANEL_URL}/impersonate`);
  url.searchParams.set("token", res.access_token);
  url.searchParams.set("returnTo", "/dashboard");
  url.searchParams.set("operator", "admin");
  redirect(url.toString());
}

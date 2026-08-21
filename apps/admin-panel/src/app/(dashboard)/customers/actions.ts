"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { adminApi, AdminApiError } from "@/lib/api";

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

  const url = new URL("/impersonate", panelUrl("CLIENT_PANEL_URL", 3001));
  url.searchParams.set("token", res.access_token);
  url.searchParams.set("returnTo", "/dashboard");
  url.searchParams.set("operator", "admin");
  redirect(url.toString());
}

function panelUrl(envName: string, devPort: number): string {
  const value = process.env[envName]?.trim();
  if (value) return value.replace(/\/$/, "");
  if (process.env.NODE_ENV !== "production") return `http://${"localhost"}:${devPort}`;
  throw new Error(`${envName} is required for production redirects.`);
}

interface AdminCreditWalletInput {
  userId: string;
  amount: string;
  description?: string;
}

export interface AdminCreditWalletResult {
  ok: boolean;
  error?: string;
  amount?: string;
}

/**
 * Manualne uznanie portfela klienta przez admina. Backend (`POST
 * /admin/billing/wallet/credit`) waliduje kwotę 0..100000, tworzy wpis w
 * `WalletTransaction` typu `ADJUSTMENT` z `paymentProvider=MANUAL`,
 * audyt `WALLET_ADMIN_CREDIT` i wysyła klientowi maila z naszym shellem.
 *
 * Klient w panelu zobaczy operację jako "Uznanie od Verris" wraz z reason'em
 * podanym przez admina.
 */
export async function forceAnonymizeCustomerAction(
  userId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const trimmed = reason.trim();
  if (trimmed.length < 5) {
    return { ok: false, error: "Podaj powód anonimizacji (min. 5 znaków)." };
  }
  try {
    await adminApi(`/admin/compliance/deletion-requests/${userId}/force-anonymize`, {
      method: "POST",
      body: { reason: trimmed },
    });
    revalidatePath("/customers");
    revalidatePath(`/customers/${userId}`);
    revalidatePath("/compliance");
    return { ok: true };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zanonimizować konta." };
  }
}

export async function adminCreditWalletAction(
  input: AdminCreditWalletInput,
): Promise<AdminCreditWalletResult> {
  const amount = Number.parseFloat(input.amount.replace(",", "."));
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Podaj prawidłową kwotę większą od 0." };
  }
  if (amount > 100000) {
    return { ok: false, error: "Maksymalna kwota uznania to 100 000 K." };
  }

  try {
    await adminApi(`/admin/billing/wallet/credit`, {
      method: "POST",
      body: {
        userId: input.userId,
        amount,
        description: input.description?.trim() || undefined,
        idempotencyKey: `admin-credit:${input.userId}:${Date.now()}`,
      },
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return {
      ok: false,
      error: "Nie udało się przyznać kredytów — sprawdź logi API.",
    };
  }

  revalidatePath("/customers");
  return { ok: true, amount: amount.toFixed(2) };
}

export interface ActionResultOk {
  ok: true;
}

export interface ActionResultErr {
  ok: false;
  error: string;
}

export async function patchCustomerOperationalAction(
  userId: string,
  input: {
    loginBlocked?: boolean;
    loginBlockedReason?: string | null;
    adminInternalNote?: string | null;
  },
): Promise<ActionResultOk | ActionResultErr> {
  try {
    await adminApi(`/admin/users/${userId}/operational`, {
      method: "PATCH",
      body: input,
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zapisać ustawień." };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${userId}`);
  return { ok: true };
}

export async function changeCustomerEmailAction(
  userId: string,
  newEmail: string,
  reason?: string,
): Promise<ActionResultOk | ActionResultErr> {
  try {
    await adminApi(`/admin/users/${userId}/email`, {
      method: "POST",
      body: { newEmail: newEmail.trim(), reason: reason?.trim() || undefined },
    });
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zmienić adresu e-mail." };
  }
  revalidatePath("/customers");
  revalidatePath(`/customers/${userId}`);
  return { ok: true };
}

export async function resetCustomerPasswordAction(
  userId: string,
  notifyUser: boolean,
  reason?: string,
): Promise<
  | { ok: true; temporaryPassword: string }
  | ActionResultErr
> {
  try {
    const res = await adminApi<{ temporaryPassword: string }>(`/admin/users/${userId}/reset-password`, {
      method: "POST",
      body: { notifyUser, reason: reason?.trim() || undefined },
    });
    revalidatePath("/customers");
    revalidatePath(`/customers/${userId}`);
    return { ok: true, temporaryPassword: res.temporaryPassword };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zresetować hasła." };
  }
}

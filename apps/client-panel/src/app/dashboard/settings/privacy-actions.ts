"use server";

import { apiFetch, ApiError } from "@/lib/api";
import { revalidatePath } from "next/cache";

// ---------------------------------------------------------------------------
// Marketing preferences
// ---------------------------------------------------------------------------

export interface MarketingPreferences {
  marketingEmail: boolean;
  productUpdatesEmail: boolean;
  partnerOffersEmail: boolean;
  loginAlertsEmail: boolean;
  unsubscribeToken?: string;
  updatedAt: string;
  createdAt: string;
}

export async function fetchMarketingPreferences(): Promise<MarketingPreferences | null> {
  try {
    return await apiFetch<MarketingPreferences>("/me/marketing-preferences");
  } catch {
    return null;
  }
}

export async function updateMarketingPreferences(
  partial: Partial<MarketingPreferences>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await apiFetch<MarketingPreferences>("/me/marketing-preferences", {
      method: "PATCH",
      body: JSON.stringify(partial),
    });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Nie udało się zaktualizować preferencji";
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// Consent history
// ---------------------------------------------------------------------------

export interface UserConsentRow {
  id: string;
  documentKind: "TERMS" | "PRIVACY" | "COOKIES" | "DPA";
  documentVersion: string;
  locale: string;
  grantedAt: string;
  withdrawnAt: string | null;
  source: "REGISTRATION" | "RE_CONSENT" | "SETTINGS" | "ADMIN_MANUAL";
}

export async function fetchConsentHistory(): Promise<UserConsentRow[]> {
  try {
    return await apiFetch<UserConsentRow[]>("/me/consent/history");
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Data export
// ---------------------------------------------------------------------------

export interface DataExportSummary {
  id: string;
  status: "PENDING" | "GENERATING" | "READY" | "EXPIRED" | "FAILED";
  requestedAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  sizeBytes: number | null;
  downloadUrl: string | null;
  errorMessage: string | null;
}

export async function fetchDataExports(): Promise<DataExportSummary[]> {
  try {
    return await apiFetch<DataExportSummary[]>("/me/data-export");
  } catch {
    return [];
  }
}

export async function requestDataExport(): Promise<
  { ok: true; export: DataExportSummary } | { ok: false; error: string }
> {
  try {
    const result = await apiFetch<DataExportSummary>("/me/data-export", { method: "POST" });
    revalidatePath("/dashboard/settings");
    return { ok: true, export: result };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zażądać eksportu danych" };
  }
}

// ---------------------------------------------------------------------------
// Account deletion
// ---------------------------------------------------------------------------

export interface DeletionStatus {
  active: boolean;
  requestedAt?: string;
  scheduledFor?: string;
  cancelledAt?: string | null;
  anonymizedAt?: string | null;
  reason?: string | null;
}

export async function fetchDeletionStatus(): Promise<DeletionStatus> {
  try {
    return await apiFetch<DeletionStatus>("/me/account-deletion");
  } catch {
    return { active: false };
  }
}

export async function requestAccountDeletion(
  password: string,
  reason?: string,
): Promise<{ ok: true; scheduledFor: string } | { ok: false; error: string }> {
  try {
    const result = await apiFetch<{ scheduledFor: string; gracePeriodDays: number }>(
      "/me/account-deletion",
      {
        method: "POST",
        body: JSON.stringify({ password, reason }),
      },
    );
    revalidatePath("/dashboard/settings");
    return { ok: true, scheduledFor: result.scheduledFor };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Nie udało się zażądać usunięcia konta";
    return { ok: false, error };
  }
}

export async function cancelAccountDeletion(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  try {
    await apiFetch("/me/account-deletion", { method: "DELETE" });
    revalidatePath("/dashboard/settings");
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Nie udało się anulować wniosku";
    return { ok: false, error };
  }
}

// ---------------------------------------------------------------------------
// DPA (Data Processing Agreement) for B2B clients
// ---------------------------------------------------------------------------

export async function acceptDpa(): Promise<{ ok: true; version: string } | { ok: false; error: string }> {
  try {
    const result = await apiFetch<{ version: string }>("/me/consent/accept-dpa", {
      method: "POST",
    });
    revalidatePath("/dashboard/settings");
    return { ok: true, version: result.version };
  } catch (err) {
    if (err instanceof ApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nie udało się zarejestrować akceptacji DPA" };
  }
}

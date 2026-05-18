"use server";

import { apiFetch, ApiError } from "@/lib/api";
import { revalidatePath } from "next/cache";

export interface ReConsentRequiredDoc {
  kind: "TERMS" | "PRIVACY";
  currentVersion: string;
  userVersion: string | null;
  title: string;
  publishedAt: string;
  changelogMarkdown: string | null;
}

export interface ReConsentStatus {
  required: boolean;
  docs?: ReConsentRequiredDoc[];
}

export async function fetchReConsentStatus(): Promise<ReConsentStatus> {
  try {
    return await apiFetch<ReConsentStatus>("/me/consent/status");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) {
      return { required: false };
    }
    return { required: false };
  }
}

export async function acceptCurrentConsents(): Promise<{ ok: boolean; error?: string }> {
  try {
    await apiFetch("/me/consent/accept-current", { method: "POST" });
    revalidatePath("/dashboard");
    return { ok: true };
  } catch (err) {
    const message =
      err instanceof Error && err.message ? err.message : "Nie udało się zapisać akceptacji";
    return { ok: false, error: message };
  }
}

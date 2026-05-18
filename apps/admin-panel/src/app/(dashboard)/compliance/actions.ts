"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

export interface PublishLegalDocInput {
  kind: "TERMS" | "PRIVACY" | "COOKIES" | "DPA";
  version: string;
  title: string;
  contentMarkdown: string;
  changelogMarkdown?: string;
  locale?: string;
}

export type PublishResult =
  | { ok: true; published: { kind: string; version: string } }
  | { ok: false; error: string };

export async function publishLegalDocAction(input: PublishLegalDocInput): Promise<PublishResult> {
  try {
    const result = await adminApi<{ kind: string; version: string }>(
      "/admin/compliance/documents/publish",
      {
        method: "POST",
        body: input,
      },
    );
    revalidatePath("/compliance");
    return { ok: true, published: { kind: result.kind, version: result.version } };
  } catch (err) {
    if (err instanceof AdminApiError) {
      return { ok: false, error: err.message };
    }
    return { ok: false, error: "Nieznany błąd publikacji dokumentu." };
  }
}

export async function retryDataExportAction(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi(`/admin/compliance/data-exports/${id}/retry`, { method: "POST" });
    revalidatePath("/compliance");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Błąd retry." };
  }
}

export async function forceAnonymizeAction(
  userId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    await adminApi(`/admin/compliance/deletion-requests/${userId}/force-anonymize`, {
      method: "POST",
      body: { reason },
    });
    revalidatePath("/compliance");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Błąd anonimizacji." };
  }
}

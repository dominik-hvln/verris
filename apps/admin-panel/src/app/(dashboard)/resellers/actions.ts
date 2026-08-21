"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

type Result = { ok: true } | { ok: false; error: string };
function msg(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export async function enableResellerAction(input: {
  userId: string;
  markupPct: number;
  brandName?: string;
}): Promise<Result> {
  const userId = input.userId.trim();
  if (userId.length < 10) return { ok: false, error: "Podaj prawidłowe ID użytkownika (UUID)." };
  try {
    await adminApi(`/admin/reseller/${userId}/enable`, {
      method: "POST",
      body: JSON.stringify({ markupPct: input.markupPct, brandName: input.brandName || undefined }),
    });
    revalidatePath("/resellers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

export async function updateResellerAction(
  userId: string,
  input: { markupPct?: number; brandName?: string; status?: "ACTIVE" | "SUSPENDED" | "PENDING" },
): Promise<Result> {
  try {
    await adminApi(`/admin/reseller/${userId}`, { method: "PUT", body: JSON.stringify(input) });
    revalidatePath("/resellers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

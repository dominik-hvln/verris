"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";
import { listAdminUsers } from "../customers/data";

type Result = { ok: true } | { ok: false; error: string };
function msg(e: unknown): string {
  return e instanceof AdminApiError ? e.message : e instanceof Error ? e.message : "Błąd";
}

export async function enableResellerAction(input: {
  userId: string;
  markupPct: number;
  brandName?: string;
}): Promise<Result> {
  const wpis = input.userId.trim();
  if (wpis.length < 3) return { ok: false, error: "Podaj e-mail albo ID klienta." };
  try {
    // E-mail zamiast UUID — ID trzeba było kopiować z karty klienta.
    let userId = wpis;
    if (wpis.includes("@")) {
      const { rows } = await listAdminUsers({ search: wpis, limit: 5 });
      const klient = rows.find((r) => r.email.toLowerCase() === wpis.toLowerCase() && r.role === "USER");
      if (!klient) return { ok: false, error: `Nie ma klienta z adresem ${wpis}.` };
      userId = klient.id;
    }
    await adminApi(`/admin/reseller/${userId}/enable`, {
      method: "POST",
      body: { markupPct: input.markupPct, brandName: input.brandName || undefined },
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
    await adminApi(`/admin/reseller/${userId}`, { method: "PUT", body: input });
    revalidatePath("/resellers");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: msg(e) };
  }
}

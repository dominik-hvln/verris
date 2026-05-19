"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";
export async function reviewReferralEnrollment(
  userId: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await adminApi(`/admin/users/referral-enrollments/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: { status, reviewNote: reviewNote?.trim() || undefined },
    });
    revalidatePath("/referral-enrollments");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof AdminApiError ? err.message : "Nie udało się zapisać decyzji.",
    };
  }
}

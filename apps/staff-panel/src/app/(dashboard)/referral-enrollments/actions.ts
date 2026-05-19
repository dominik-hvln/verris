"use server";

import { revalidatePath } from "next/cache";
import { staffApi, StaffApiError } from "@/lib/staff-api";

export async function reviewReferralEnrollment(
  userId: string,
  status: "APPROVED" | "REJECTED",
  reviewNote?: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await staffApi(`/admin/users/referral-enrollments/${encodeURIComponent(userId)}`, {
      method: "PATCH",
      body: { status, reviewNote: reviewNote?.trim() || undefined },
    });
    revalidatePath("/referral-enrollments");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof StaffApiError ? err.message : "Nie udało się zapisać decyzji.",
    };
  }
}

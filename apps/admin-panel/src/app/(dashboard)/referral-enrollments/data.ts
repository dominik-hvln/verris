import { adminApi } from "@/lib/api";

export type ReferralEnrollmentStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface ReferralEnrollmentRow {
  id: string;
  userId: string;
  status: ReferralEnrollmentStatus;
  appliedAt: string;
  reviewedAt: string | null;
  reviewedByUserId: string | null;
  reviewNote: string | null;
  termsVersion: string | null;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    referralCode: string | null;
    ecoPoints: number;
  };
}

export async function listReferralEnrollments(
  status?: ReferralEnrollmentStatus,
): Promise<ReferralEnrollmentRow[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return adminApi<ReferralEnrollmentRow[]>(`/admin/users/referral-enrollments${qs}`);
}

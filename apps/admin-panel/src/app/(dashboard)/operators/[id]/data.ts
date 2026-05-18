import { adminApi } from "@/lib/api";

export interface LoginHistoryRow {
  id: string;
  kind: "success" | "failure";
  occurredAt: string;
  ip: string | null;
  userAgent: string | null;
  isNewDevice: boolean;
  method: string | null;
  countryCode: string | null;
  reason: string | null;
}

export interface LoginHistoryResponse {
  user: {
    id: string;
    email: string;
    role: "STAFF" | "ADMIN" | "USER";
    loginBlocked: boolean;
    loginBlockedReason: string | null;
  };
  lockout: {
    windowMinutes: number;
    threshold: number;
    recentFailures: number;
    currentlyLockedOut: boolean;
  };
  suspiciousAlerts: {
    id: string;
    action: string;
    details: Record<string, unknown> | null;
    createdAt: string;
  }[];
  rows: LoginHistoryRow[];
}

export async function getOperatorLoginHistory(userId: string): Promise<LoginHistoryResponse> {
  return adminApi<LoginHistoryResponse>(`/admin/users/${userId}/login-history`);
}

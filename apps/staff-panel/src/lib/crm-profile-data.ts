import { staffApi } from "./staff-api";

export interface StaffDnsTlsResult {
  hostname: string;
  serverLabel: string | null;
  expectedServerIpv4: string | null;
  ipv4MatchesDnsA: boolean | null;
  durationMs: number;
  dns: {
    a: string[];
    aaaa: string[];
    mx: Array<{ priority: number; exchange: string }>;
    ns: string[];
    errors: Partial<Record<"a" | "aaaa" | "mx" | "ns", string>>;
  };
  tls: {
    ok: boolean;
    error?: string;
    subjectCN?: string;
    issuer?: string;
    validFrom?: string;
    validTo?: string;
    authorized?: boolean;
    authorizationError?: string;
  };
}

export interface StaffCustomerProfile {
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    companyName: string | null;
    nip: string | null;
    role: string;
    walletBalance: string;
    walletCurrency: string;
    createdAt: string;
    isTwoFactorEnabled: boolean;
    stripeCustomerId: string | null;
    deletionRequestedAt: string | null;
    loginBlocked?: boolean;
    loginBlockedReason?: string | null;
    /** Tylko dla ADMIN w API; dla STAFF zwykle `null`. */
    adminInternalNote?: string | null;
  };
  subscriptions: Array<{
    id: string;
    status: string;
    serviceTag: string | null;
    interval: string;
    paymentSource: string;
    priceAmount: string;
    currency: string;
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAt: string | null;
    autoscalingEnabled: boolean;
    plan: { id: string; name: string; slug: string };
    account: null | {
      id: string;
      domain: string;
      daUsername: string;
      status: string;
      server: null | {
        id: string;
        name: string | null;
        ipAddress: string;
        hostname: string | null;
      };
    };
  }>;
  recentTickets: Array<{
    id: string;
    subject: string;
    status: string;
    priority: string;
    department: string;
    createdAt: string;
    replyCount: number;
  }>;
  domains: Array<{ id: string; name: string; status: string }>;
  walletLedger: Array<{
    id: string;
    type: string;
    status: string;
    amount: string;
    currency: string;
    balanceAfter: string;
    description: string | null;
    paymentProvider: string | null;
    createdAt: string;
  }>;
  recentInvoices: Array<{
    id: string;
    number: string;
    status: string;
    amount: string;
    currency: string;
    paidAt: string | null;
    createdAt: string;
  }>;
  paymentMethods: Array<{
    id: string;
    provider: string;
    brand: string | null;
    last4: string | null;
    expMonth: number | null;
    expYear: number | null;
    isDefault: boolean;
  }>;
  auditTrail: Array<{
    id: string;
    action: string;
    details: unknown;
    actorUserId: string | null;
    ipAddress: string | null;
    createdAt: string;
  }>;
  statusPageOpenIncidents: Array<{
    id: string;
    serverId: string;
    serverName: string;
    probeKind: string;
    probeTarget: string;
    severity: string;
    title: string;
    publicMessage: string | null;
    startedAt: string;
  }>;
  customerTimeline: Array<{
    id: string;
    kind: string;
    title: string;
    meta: string;
    createdAt: string;
  }>;
  supportInsights: {
    riskScore: number;
    riskLevel: "low" | "medium" | "high";
    reasons: string[];
    suggestions: string[];
  };
}

export async function staffGetCustomerProfile(userId: string): Promise<StaffCustomerProfile> {
  return staffApi<StaffCustomerProfile>(`/admin/users/${userId}/customer-profile`);
}

export async function staffRunDnsTlsDiagnostic(
  userId: string,
  body: { subscriptionId?: string; domain?: string },
): Promise<StaffDnsTlsResult> {
  return staffApi<StaffDnsTlsResult>(`/admin/users/${userId}/diagnostics/dns-tls`, {
    method: "POST",
    body: {
      subscriptionId: body.subscriptionId?.trim() || undefined,
      domain: body.domain?.trim() || undefined,
    },
  });
}

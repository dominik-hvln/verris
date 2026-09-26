import { staffApi } from "./staff-api";

export async function staffGetTickets(userId?: string) {
  const q = userId?.trim()
    ? `?userId=${encodeURIComponent(userId.trim())}`
    : "";
  const rows = await staffApi<StaffTicketRow[]>(`/tickets/admin/all${q}`);
  if (!Array.isArray(rows)) {
    throw new Error("API zwróciło nieoczekiwany format listy zgłoszeń.");
  }
  return rows;
}

export async function staffGetTicket(id: string) {
  return staffApi<StaffTicketDetail>(`/tickets/admin/${id}`);
}

/** PB-18 — podgląd klienta, klasyfikacja i szkic odpowiedzi. */
export interface TicketContext {
  client: { name: string | null; email: string; company: string | null; walletBalance: string | null; since: string };
  healthScore: number | null;
  services: {
    id: string;
    plan: string | null;
    status: string;
    domain: string | null;
    healthScore: number | null;
    siteStatus: string | null;
    sslExpiresAt: string | null;
    currentPeriodEnd: string | null;
  }[];
  invoices: { id: string; number: string; status: string; amount: string; currency: string; createdAt: string }[];
  events: { type: string; createdAt: string; domain: string | null }[];
  tickets: { id: string; subject: string; status: string; createdAt: string }[];
  category: string;
  categoryLabel: string;
  draft: string;
  kb: { title: string; url: string }[];
}

export async function staffGetTicketContext(id: string): Promise<TicketContext | null> {
  try {
    return await staffApi<TicketContext>(`/tickets/admin/${id}/context`);
  } catch {
    return null;
  }
}

export async function staffGetCannedResponses() {
  return staffApi<CannedResponse[]>("/tickets/admin/canned-responses");
}

export interface StaffTicketRow {
  id: string;
  subject: string;
  status: string;
  priority: string;
  department: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string;
    companyName: string | null;
  };
  updatedAt?: string;
  resolvedAt?: string | null;
  assignedToId?: string | null;
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
  slaResponseDueAt?: string | null;
  slaResolveDueAt?: string | null;
  firstResponseAt?: string | null;
  lastReplyIsStaff?: boolean | null;
  lastReplyAt?: string | null;
  staffReadAt?: string | null;
  escalatedAt?: string | null;
  riskFlag?: string | null;
  runbookKey?: string | null;
  topic?: string | null;
  _count: { replies: number };
}

export interface TicketAttachmentRow {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  replyId: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface TicketEventRow {
  id: string;
  type: string;
  actorId: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
}

export interface StaffTicketDetail extends StaffTicketRow {
  message: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  escalationReason?: string | null;
  riskReason?: string | null;
  // SUP-V2 — cykl braku odpowiedzi / auto-zamykania.
  waitingSince?: string | null;
  customerReminderSentAt?: string | null;
  autoClosedAt?: string | null;
  lastReplyAt?: string | null;
  lastReplyIsStaff?: boolean | null;
  slaResponseBreachAlertedAt?: string | null;
  events?: TicketEventRow[];
  attachments?: TicketAttachmentRow[];
  // PB-37 — opieka nad zgłoszeniem
  progressNoticeAt?: string | null;
  aiDraft?: string | null;
  aiDraftAt?: string | null;
  csatRating?: number | null;
  agentRating?: number | null;
  csatResolved?: boolean | null;
  csatComment?: string | null;
  csatAt?: string | null;
  runbookKey?: string | null;
  replies: Array<{
    id: string;
    message: string;
    createdAt: string;
    isStaff: boolean;
    /** PB-37 — automatyczna wiadomość (POTWIERDZENIE, ZAJMUJE_SIE, WCIAZ_PRACUJEMY, PODZIEKOWANIE) */
    automatic?: string | null;
    authorId?: string | null;
    attachments?: TicketAttachmentRow[];
  }>;
}

export interface AgentOption {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export async function staffListSupportAgents(): Promise<AgentOption[]> {
  const [staff, admin] = await Promise.all([
    staffApi<{ rows: AgentOption[] }>("/admin/users?role=STAFF&limit=100"),
    staffApi<{ rows: AgentOption[] }>("/admin/users?role=ADMIN&limit=50"),
  ]);
  const map = new Map<string, AgentOption>();
  for (const r of [...staff.rows, ...admin.rows]) {
    map.set(r.id, r);
  }
  return [...map.values()];
}

export interface CannedResponse {
  id: string;
  title: string;
  body: string;
}

/** PB-37 — oceny opiekuna (API: obsługa widzi swoje, admin wszystkich). */
export interface OcenaAgenta {
  agentId: string;
  nazwa: string;
  ocen: number;
  opiekun: number | null;
  support: number | null;
  rozwiazanePct: number | null;
}

export async function staffMojeOceny(meId: string, dni = 30): Promise<OcenaAgenta | null> {
  try {
    const rows = await staffApi<OcenaAgenta[]>(`/admin/support/ratings?days=${dni}`);
    return rows.find((r) => r.agentId === meId) ?? null;
  } catch {
    return null;
  }
}

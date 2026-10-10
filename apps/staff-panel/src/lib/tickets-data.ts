import { staffApi } from "./staff-api";

/** F2.5 — odpowiedź skrzynki z API (filtry i stronicowanie po stronie API). */
export interface ListaZgloszen {
  rows: StaffTicketRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  liczby: { otwarte: number; moje: number; czeka: number; poTerminie: number; zamkniete: number };
}

/** F2.5 — skrzynka: `parametry` to filtry API (lista-zgloszen.ts): stan, priorytet, przypisany, temat, tag, sla, userId, q, sort, page, limit. */
export async function staffListaZgloszen(parametry: Record<string, string | undefined> = {}): Promise<ListaZgloszen> {
  const qs = new URLSearchParams(Object.entries(parametry).filter((e): e is [string, string] => !!e[1]?.trim())).toString();
  const r = await staffApi<ListaZgloszen>(`/tickets/admin/all${qs ? `?${qs}` : ""}`);
  if (!r || !Array.isArray(r.rows)) {
    throw new Error("API zwróciło nieoczekiwany format listy zgłoszeń.");
  }
  return r;
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
  /** F2.5 — tagi obsługi (klient ich nie widzi). */
  tags?: string[];
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
  /** F2.5 — operator, który założył zgłoszenie w imieniu klienta (null = klient). */
  openedByStaffId?: string | null;
  /** PB-43 — usługa, której dotyczy zgłoszenie */
  subscriptionId?: string | null;
  subscription?: {
    id: string;
    serviceTag: string | null;
    status: string;
    plan: { name: string } | null;
    account: { domain: string } | null;
  } | null;
  replies: Array<{
    id: string;
    message: string;
    createdAt: string;
    isStaff: boolean;
    /** PB-37 — automatyczna wiadomość (POTWIERDZENIE, ZAJMUJE_SIE, WCIAZ_PRACUJEMY, PODZIEKOWANIE) */
    automatic?: string | null;
    /** F2.5 — notatka wewnętrzna (widzi tylko zespół). */
    internal?: boolean;
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

import { staffApi } from "./staff-api";

export async function staffGetTickets() {
  const rows = await staffApi<StaffTicketRow[]>("/tickets/admin/all");
  if (!Array.isArray(rows)) {
    throw new Error("API zwróciło nieoczekiwany format listy zgłoszeń.");
  }
  return rows;
}

export async function staffGetTicket(id: string) {
  return staffApi<StaffTicketDetail>(`/tickets/admin/${id}`);
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
  user: { firstName: string | null; lastName: string | null; email: string; companyName: string | null };
  assignedToId?: string | null;
  assignedTo: { id: string; firstName: string | null; lastName: string | null } | null;
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

export interface StaffTicketDetail extends StaffTicketRow {
  message: string;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  attachments?: TicketAttachmentRow[];
  replies: Array<{
    id: string;
    message: string;
    createdAt: string;
    isStaff: boolean;
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

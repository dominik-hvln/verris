"use server";

import { getAuthToken } from "@/lib/auth";

const API_URL = process.env.API_URL || "http://localhost:3000";

export interface TicketSummary {
  id: string;
  subject: string;
  status: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  _count: { replies: number };
}

export interface TicketAttachment {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
  replyId: string | null;
  uploadedById: string;
  createdAt: string;
}

export interface TicketReply {
  id: string;
  message: string;
  isStaff: boolean;
  authorId: string;
  createdAt: string;
  attachments?: TicketAttachment[];
}

export interface TicketDetail {
  id: string;
  subject: string;
  status: string;
  message: string;
  createdAt: string;
  updatedAt: string;
  attachments?: TicketAttachment[];
  replies: TicketReply[];
  // SUP-4 / SUP-5
  csatRating?: number | null;
  csatAt?: string | null;
  firstResponseAt?: string | null;
  slaResponseDueAt?: string | null;
  supportSlaHours?: number;
}

/**
 * Pobiera listę zgłoszeń klienta.
 */
export async function fetchTickets(): Promise<TicketSummary[]> {
  const token = await getAuthToken();
  if (!token) return [];

  try {
    const res = await fetch(`${API_URL}/tickets`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/**
 * Pobiera szczegóły zgłoszenia z odpowiedziami.
 */
export async function fetchTicketDetail(ticketId: string): Promise<TicketDetail | null> {
  const token = await getAuthToken();
  if (!token) return null;

  try {
    const res = await fetch(`${API_URL}/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Tworzy nowe zgłoszenie (JSON — bez załączników).
 */
export async function createTicket(subject: string, message: string) {
  const token = await getAuthToken();
  if (!token) {
    return { error: "Brak autoryzacji" };
  }

  try {
    const res = await fetch(`${API_URL}/tickets`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ subject, message }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMessage = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      return { error: errMessage || "Nie udało się utworzyć zgłoszenia" };
    }

    const data = await res.json();
    return { success: true, data };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

export interface KbSuggestion {
  docId: string;
  title: string;
  snippet: string;
}

/** SUP-1 — podpowiedzi z bazy wiedzy do formularza zgłoszenia (deflekcja). */
export async function fetchKbSuggestions(query: string, topic?: string): Promise<KbSuggestion[]> {
  const token = await getAuthToken();
  if (!token || query.trim().length < 3) return [];
  try {
    const res = await fetch(`${API_URL}/ai/kb-suggest`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query, topic }),
      cache: "no-store",
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

/** Multipart (`/tickets/with-attachments`): subject, message, opcjonalnie pliki pole `files`. */
export async function createTicketWithFiles(formData: FormData) {
  const subject = formData.get("subject")?.toString() ?? "";
  const message = formData.get("message")?.toString() ?? "";
  const rawFiles = formData.getAll("files");

  const token = await getAuthToken();
  if (!token) {
    return { error: "Brak autoryzacji" };
  }

  const outbound = new FormData();
  outbound.append("subject", subject);
  outbound.append("message", message);
  const topic = formData.get("topic")?.toString();
  if (topic) outbound.append("topic", topic);
  for (const entry of rawFiles) {
    if (entry instanceof File && entry.size > 0) {
      outbound.append("files", entry);
    }
  }

  try {
    const res = await fetch(`${API_URL}/tickets/with-attachments`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
      },
      body: outbound,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMessage = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      return { error: errMessage || "Nie udało się utworzyć zgłoszenia" };
    }

    return { success: true, data: await res.json() };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

/**
 * Dodaje odpowiedź do zgłoszenia (JSON).
 */
export async function addTicketReply(ticketId: string, message: string) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };

  try {
    const res = await fetch(`${API_URL}/tickets/${ticketId}/replies`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.message || "Nie udało się wysłać odpowiedzi" };
    }

    return { success: true, data: await res.json() };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

/** SUP-4 — ocena wsparcia (1-5) po zamknięciu zgłoszenia. */
export async function submitCsatAction(ticketId: string, rating: number, comment?: string) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };
  try {
    const res = await fetch(`${API_URL}/tickets/${ticketId}/csat`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comment }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { error: body.message || "Nie udało się zapisać oceny" };
    }
    return { success: true };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

/** Multipart: `message` + opcjonalnie `files` (wiele). */
export async function addTicketReplyWithFiles(ticketId: string, formData: FormData) {
  const token = await getAuthToken();
  if (!token) return { error: "Brak autoryzacji" };

  let message = formData.get("message")?.toString() ?? "";
  const rawFiles = formData.getAll("files");

  let hasFile = false;
  for (const entry of rawFiles) {
    if (entry instanceof File && entry.size > 0) {
      hasFile = true;
      break;
    }
  }

  if (!hasFile && message.trim().length < 2) {
    return { error: "Odpowiedź musi mieć co najmniej 2 znaki albo dodaj załącznik." };
  }
  if (hasFile && message.trim().length === 0) {
    message = "(Załączniki)";
  }

  const outbound = new FormData();
  outbound.append("message", message);
  for (const entry of rawFiles) {
    if (entry instanceof File && entry.size > 0) {
      outbound.append("files", entry);
    }
  }

  try {
    const res = await fetch(`${API_URL}/tickets/${ticketId}/replies/with-files`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: outbound,
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      const errMessage = Array.isArray(body.message) ? body.message.join(", ") : body.message;
      return { error: errMessage || "Nie udało się wysłać odpowiedzi" };
    }

    return { success: true, data: await res.json() };
  } catch {
    return { error: "Błąd połączenia z serwerem" };
  }
}

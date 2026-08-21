"use server";

import { adminApi, AdminApiError } from "@/lib/api";

export interface CannedResponseRow {
  id: string;
  title: string;
  content: string;
  topic: string | null;
  isActive: boolean;
}

export interface CannedInput {
  title: string;
  content: string;
  topic?: string;
  isActive?: boolean;
}

type Result = { ok: true } | { ok: false; error: string };
const err = (e: unknown) => (e instanceof AdminApiError ? e.message : "Błąd");

export async function fetchCanned(): Promise<CannedResponseRow[]> {
  try {
    return await adminApi<CannedResponseRow[]>("/tickets/canned/all");
  } catch {
    return [];
  }
}

export async function createCanned(input: CannedInput): Promise<Result> {
  try {
    await adminApi("/tickets/canned", { method: "POST", body: input });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function updateCanned(id: string, input: Partial<CannedInput>): Promise<Result> {
  try {
    await adminApi(`/tickets/canned/${id}`, { method: "PATCH", body: input });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

export async function deleteCanned(id: string): Promise<Result> {
  try {
    await adminApi(`/tickets/canned/${id}`, { method: "DELETE" });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: err(e) };
  }
}

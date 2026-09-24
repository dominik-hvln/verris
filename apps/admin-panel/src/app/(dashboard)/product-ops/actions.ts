"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";

type Wynik = { ok: true } | { ok: false; error: string };

async function wyslij(path: string, method: "POST" | "PATCH", body: object): Promise<Wynik> {
  try {
    await adminApi(path, { method, body });
    revalidatePath("/product-ops");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof AdminApiError ? err.message : "Nie udało się zapisać." };
  }
}

/** N-11 — ogłoszenie dla klientów (widoczne w panelu 30 dni od publikacji). */
export async function createAnnouncementAction(input: {
  kind: string;
  title: string;
  bodyMarkdown: string;
  publishNow: boolean;
}): Promise<Wynik> {
  return wyslij("/admin/product-ops/announcements", "POST", {
    kind: input.kind,
    title: input.title.trim(),
    bodyMarkdown: input.bodyMarkdown.trim(),
    audienceRole: "USER",
    publishedAt: input.publishNow ? new Date().toISOString() : undefined,
  });
}

export async function setAnnouncementStatusAction(id: string, status: "PUBLISHED" | "ARCHIVED"): Promise<Wynik> {
  return wyslij(`/admin/product-ops/announcements/${id}`, "PATCH", { status });
}

/** N-11 — okno serwisowe: widoczne w panelu klienta i na status.verris.pl od 14 dni przed startem. */
export async function createMaintenanceAction(input: {
  title: string;
  publicMessage: string;
  scheduledStart: string;
  scheduledEnd: string;
  serverId: string;
}): Promise<Wynik> {
  return wyslij("/admin/product-ops/maintenance-windows", "POST", {
    title: input.title.trim(),
    publicMessage: input.publicMessage.trim() || undefined,
    scheduledStart: new Date(input.scheduledStart).toISOString(),
    scheduledEnd: new Date(input.scheduledEnd).toISOString(),
    serverId: input.serverId || undefined,
  });
}

export async function setMaintenanceStatusAction(
  id: string,
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELED",
): Promise<Wynik> {
  return wyslij(`/admin/product-ops/maintenance-windows/${id}`, "PATCH", { status });
}

/** N-12 — flaga modułu panelu klienta (klucz z FLAGI_MODULOW). */
export async function createFeatureFlagAction(key: string, name: string): Promise<Wynik> {
  return wyslij("/admin/product-ops/feature-flags", "POST", { key, name, enabledDefault: true, rolloutPercent: 100 });
}

export async function updateFeatureFlagAction(
  id: string,
  input: { enabledDefault?: boolean; rolloutPercent?: number },
): Promise<Wynik> {
  return wyslij(`/admin/product-ops/feature-flags/${id}`, "PATCH", input);
}

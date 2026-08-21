"use server";

import { revalidatePath } from "next/cache";
import { adminApi, AdminApiError } from "@/lib/api";
import type { MarketingSegment } from "./data";

export interface CreateCampaignInput {
  name: string;
  subject: string;
  bodyMarkdown: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  segment: MarketingSegment;
}

type Result = { ok: true; id?: string } | { ok: false; error: string };

function errMsg(err: unknown): string {
  return err instanceof AdminApiError ? err.message : err instanceof Error ? err.message : "Błąd";
}

export async function createCampaignAction(input: CreateCampaignInput): Promise<Result> {
  const name = input.name.trim();
  const subject = input.subject.trim();
  const body = input.bodyMarkdown.trim();
  if (name.length < 3) return { ok: false, error: "Nazwa kampanii: min. 3 znaki." };
  if (subject.length < 3) return { ok: false, error: "Temat: min. 3 znaki." };
  if (body.length < 10) return { ok: false, error: "Treść: min. 10 znaków." };
  if (input.ctaUrl && !/^https?:\/\//i.test(input.ctaUrl)) {
    return { ok: false, error: "Link CTA musi zaczynać się od http(s)://" };
  }
  try {
    const res = await adminApi<{ id: string }>(`/admin/marketing/campaigns`, {
      method: "POST",
      body: JSON.stringify({
        name,
        subject,
        bodyMarkdown: body,
        description: input.description?.trim() || null,
        ctaLabel: input.ctaLabel?.trim() || null,
        ctaUrl: input.ctaUrl?.trim() || null,
        segment: input.segment,
        scheduledAt: null,
      }),
    });
    revalidatePath("/marketing");
    return { ok: true, id: res.id };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

/** scheduledAt: null = wyślij teraz; ISO = zaplanuj na termin. */
export async function scheduleCampaignAction(id: string, scheduledAt: string | null): Promise<Result> {
  try {
    await adminApi(`/admin/marketing/campaigns/${id}/schedule`, {
      method: "PATCH",
      body: JSON.stringify({ scheduledAt }),
    });
    revalidatePath("/marketing");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

export async function cancelCampaignAction(id: string): Promise<Result> {
  try {
    await adminApi(`/admin/marketing/campaigns/${id}/cancel`, { method: "PATCH" });
    revalidatePath("/marketing");
    return { ok: true };
  } catch (err) {
    return { ok: false, error: errMsg(err) };
  }
}

import { bramkaStrony } from "@/lib/bramka-strony";
import Link from "next/link";
import { adminApi } from "@/lib/api";
import { MigrationDetailClient, type MigrationDetail } from "./migration-detail-client";
import { ObslugaMigracjiPanel } from "./obsluga-migracji";
import type { ObslugaMigracji } from "../tablica-typy";

export const dynamic = "force-dynamic";

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const bramka = await bramkaStrony("/migrations/[id]");
  if (bramka) return bramka;
  const { id } = await params;
  let detail: MigrationDetail | null = null;
  let error: string | null = null;
  let obsluga: ObslugaMigracji | null = null;
  try {
    // D11 — panel obsługi (etap, terminy, checklisty, raport, kontakty) obok szczegółów automatu.
    [detail, obsluga] = await Promise.all([
      adminApi<MigrationDetail>(`/staff/migrations/${id}/detail`),
      adminApi<ObslugaMigracji>(`/admin/migrations/${encodeURIComponent(id)}/obsluga`).catch(() => null),
    ]);
  } catch {
    error = "Nie udało się pobrać szczegółów migracji.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/migrations/tablica" className="text-xs text-indigo-400 hover:underline">
            ← Tablica migracji
          </Link>
          <h1 className="mt-1 text-[28px] lg:text-[34px]">Migracja #{id.slice(0, 8)}</h1>
        </div>
      </div>

      {error || !detail ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error ?? "Brak danych."}
        </p>
      ) : (
        <>
          {obsluga ? (
            <ObslugaMigracjiPanel initial={obsluga} subscriptionId={detail.subscriptionId} />
          ) : (
            <p className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              Nie udało się wczytać obsługi migracji (etap, terminy, checklista). Odśwież stronę.
            </p>
          )}
          <MigrationDetailClient initial={detail} />
        </>
      )}
    </div>
  );
}

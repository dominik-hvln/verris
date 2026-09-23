import Link from "next/link";
import { staffApi as adminApi, StaffApiError } from "@/lib/staff-api";
import { MigrationDetailClient, type MigrationDetail } from "./migration-detail-client";

export const dynamic = "force-dynamic";

export default async function MigrationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let detail: MigrationDetail | null = null;
  let error: string | null = null;
  try {
    detail = await adminApi<MigrationDetail>(`/staff/migrations/${id}/detail`);
  } catch (e) {
    // 403 to brak uprawnienia, nie awaria — mówimy wprost, co zrobić.
    error = e instanceof StaffApiError && e.status === 403
      ? "Twoje konto nie ma uprawnienia „Migracje” (MIGRATIONS_MANAGE). Nada je administrator: panel admina → Role i uprawnienia."
      : "Nie udało się pobrać szczegółów migracji.";
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/migrations" className="text-xs text-indigo-400 hover:underline">
            ← Kolejka migracji
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-white">Migracja #{id.slice(0, 8)}</h1>
        </div>
      </div>

      {error || !detail ? (
        <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          {error ?? "Brak danych."}
        </p>
      ) : (
        <MigrationDetailClient initial={detail} />
      )}
    </div>
  );
}

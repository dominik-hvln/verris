import Link from "next/link";
import { UserPlus } from "lucide-react";
import { listReferralEnrollments, type ReferralEnrollmentStatus } from "./data";
import { ReferralReviewActions } from "./review-actions";

export const dynamic = "force-dynamic";

const FILTERS: { value: "" | ReferralEnrollmentStatus; label: string }[] = [
  { value: "", label: "Wszystkie" },
  { value: "PENDING", label: "Oczekujące" },
  { value: "APPROVED", label: "Zaakceptowane" },
  { value: "REJECTED", label: "Odrzucone" },
];

function statusLabel(status: ReferralEnrollmentStatus): string {
  switch (status) {
    case "PENDING":
      return "Oczekuje";
    case "APPROVED":
      return "Zaakceptowane";
    case "REJECTED":
      return "Odrzucone";
    default:
      return status;
  }
}

function statusClass(status: ReferralEnrollmentStatus): string {
  switch (status) {
    case "PENDING":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "APPROVED":
      return "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";
    case "REJECTED":
      return "border-rose-500/30 bg-rose-500/10 text-rose-200";
    default:
      return "border-white/10 bg-white/5 text-neutral-300";
  }
}

function displayName(row: { firstName: string | null; lastName: string | null; email: string }) {
  const name = [row.firstName, row.lastName].filter(Boolean).join(" ").trim();
  return name || row.email;
}

export default async function ReferralEnrollmentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusParam = sp.status ?? "";
  const status =
    statusParam === "PENDING" || statusParam === "APPROVED" || statusParam === "REJECTED"
      ? statusParam
      : undefined;

  const rows = await listReferralEnrollments(status);
  const pendingCount = status === "PENDING" ? rows.length : rows.filter((r) => r.status === "PENDING").length;

  return (
    <div className="space-y-6">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-white">
          <UserPlus className="h-7 w-7 text-emerald-400" aria-hidden />
          Program partnerski
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zgłoszenia klientów do programu poleceń — akceptacja lub odrzucenie z notatką.
        </p>
      </header>

      <nav className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = (sp.status ?? "") === f.value;
          const href = f.value ? `/referral-enrollments?status=${f.value}` : "/referral-enrollments";
          return (
            <a
              key={f.value || "all"}
              href={href}
              className={`rounded-md border px-3 py-1 text-xs ${
                active
                  ? "border-cyan-500/40 bg-cyan-500/20 text-cyan-100"
                  : "border-white/10 bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {f.label}
              {f.value === "PENDING" && pendingCount > 0 ? ` (${pendingCount})` : null}
            </a>
          );
        })}
      </nav>

      <section className="overflow-hidden rounded-lg border border-white/10 bg-black/30">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Klient</th>
              <th className="px-4 py-3">Zgłoszono</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Kod / punkty</th>
              <th className="px-4 py-3 text-right">Akcja</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                  Brak zgłoszeń w tym filtrze.
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr key={row.id} className="border-b border-white/5 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      href={`/crm/${row.userId}`}
                      className="font-medium text-white hover:text-cyan-300"
                    >
                      {displayName(row.user)}
                    </Link>
                    <p className="text-xs text-muted-foreground">{row.user.email}</p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground">
                    {new Date(row.appliedAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${statusClass(row.status)}`}
                    >
                      {statusLabel(row.status)}
                    </span>
                    {row.reviewNote ? (
                      <p className="mt-1 max-w-xs text-xs text-neutral-400">{row.reviewNote}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-300">
                    {row.user.referralCode ? (
                      <span className="text-emerald-300">{row.user.referralCode}</span>
                    ) : (
                      <span className="text-neutral-500">—</span>
                    )}
                    <p className="mt-1 font-sans text-neutral-500">{row.user.ecoPoints} pkt EKO</p>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {row.status === "PENDING" ? (
                      <ReferralReviewActions userId={row.userId} />
                    ) : (
                      <span className="text-xs text-neutral-500">Rozpatrzone</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}

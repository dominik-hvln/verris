import Link from "next/link";
import { ArrowLeft, ShieldAlert, ShieldCheck, AlertTriangle } from "lucide-react";
import { getOperatorLoginHistory } from "./data";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

const REASON_LABELS: Record<string, string> = {
  unknown_user: "Nieznany e-mail",
  bad_password: "Błędne hasło",
  "2fa_failed": "Błędny kod 2FA",
  too_many_attempts: "Zablokowane (limit prób)",
  session_expired: "Sesja wygasła",
};

export default async function OperatorDetailPage({ params }: PageProps) {
  const { id } = await params;
  let data: Awaited<ReturnType<typeof getOperatorLoginHistory>> | null = null;
  let error: string | null = null;
  try {
    data = await getOperatorLoginHistory(id);
  } catch (err) {
    error = err instanceof Error ? err.message : "Nie udało się pobrać historii logowań.";
  }

  if (error) {
    return (
      <div className="p-6">
        <Link
          href="/operators"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-4 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Powrót do operatorów
        </Link>
        <div className="rounded-md border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6 p-6">
      <div>
        <Link
          href="/operators"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Powrót do operatorów
        </Link>
        <h1 className="text-2xl font-bold tracking-tight mt-3">{data.user.email}</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Rola: <span className="font-mono">{data.user.role}</span>
        </p>
      </div>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card
          icon={data.user.loginBlocked ? ShieldAlert : ShieldCheck}
          tone={data.user.loginBlocked ? "danger" : "ok"}
          title="Logowanie"
          value={data.user.loginBlocked ? "Zablokowane" : "Aktywne"}
          subtitle={data.user.loginBlockedReason ?? undefined}
        />
        <Card
          icon={data.lockout.currentlyLockedOut ? AlertTriangle : ShieldCheck}
          tone={data.lockout.currentlyLockedOut ? "warn" : "ok"}
          title="Lockout (15 min)"
          value={`${data.lockout.recentFailures}/${data.lockout.threshold}`}
          subtitle={
            data.lockout.currentlyLockedOut
              ? "Konto chwilowo zablokowane przez throttling"
              : undefined
          }
        />
        <Card
          icon={ShieldCheck}
          tone={data.suspiciousAlerts.length > 0 ? "warn" : "ok"}
          title="Alerty security"
          value={`${data.suspiciousAlerts.length}`}
          subtitle={
            data.suspiciousAlerts[0]
              ? `${data.suspiciousAlerts[0].action} · ${new Date(
                  data.suspiciousAlerts[0].createdAt,
                ).toLocaleString("pl-PL")}`
              : "Brak alertów suspicious activity w 30 dni"
          }
        />
      </section>

      {data.suspiciousAlerts.length > 0 && (
        <section className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm text-amber-100">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-4 w-4" />
            Suspicious activity wymaga weryfikacji operatora
          </div>
          <p className="mt-1 text-xs text-amber-100/80">
            Ostatni alert: {data.suspiciousAlerts[0].action}. Sprawdź IP, user-agent i w razie
            potrzeby zablokuj logowanie lub wymuś ponowną konfigurację 2FA.
          </p>
        </section>
      )}

      <section className="rounded-lg border border-white/10 bg-black/30">
        <table className="w-full text-sm">
          <thead className="border-b border-white/10 text-left text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Wynik</th>
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">IP</th>
              <th className="px-4 py-3">User-Agent</th>
              <th className="px-4 py-3">Powód / metoda</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-xs text-muted-foreground">
                  Brak zdarzeń logowania w ostatnich 30 dniach.
                </td>
              </tr>
            )}
            {data.rows.map((row) => (
              <tr key={row.id} className="border-b border-white/5">
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-widest font-bold ${
                      row.kind === "success"
                        ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                        : "border-rose-400/40 bg-rose-400/10 text-rose-200"
                    }`}
                  >
                    {row.kind === "success" ? "Sukces" : "Porażka"}
                  </span>
                  {row.isNewDevice && (
                    <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-300">
                      Nowe urządzenie
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {new Date(row.occurredAt).toLocaleString("pl-PL")}
                </td>
                <td className="px-4 py-3 text-xs font-mono">{row.ip ?? "—"}</td>
                <td className="px-4 py-3 text-xs max-w-[300px] truncate">
                  {row.userAgent ?? "—"}
                </td>
                <td className="px-4 py-3 text-xs">
                  {row.kind === "failure"
                    ? (REASON_LABELS[row.reason ?? ""] ?? row.reason ?? "?")
                    : (row.method ?? "—")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  tone = "ok",
  title,
  value,
  subtitle,
}: {
  icon: React.ComponentType<{ className?: string }>;
  tone?: "ok" | "warn" | "danger";
  title: string;
  value: string;
  subtitle?: string;
}) {
  const styles =
    tone === "danger"
      ? "border-rose-500/30 bg-rose-500/5 text-rose-100"
      : tone === "warn"
        ? "border-amber-500/30 bg-amber-500/5 text-amber-100"
        : "border-white/10 bg-white/5";
  return (
    <div className={`rounded-lg border p-4 ${styles}`}>
      <div className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{title}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value}</div>
      {subtitle && <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p>}
    </div>
  );
}

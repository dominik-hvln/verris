import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import { StaffApiError } from "@/lib/staff-api";
import { staffGetCustomerProfile } from "@/lib/crm-profile-data";
import { StaffImpersonateButton } from "../impersonate-button";
import { StaffDnsTlsPanel } from "../dns-tls-panel";
import { formatPlnAndCredits } from "@/lib/credits";

export const dynamic = "force-dynamic";

const SUB_STATUS_PL: Record<string, string> = {
  PENDING_PAYMENT: "Oczekuje płatności",
  PROVISIONING: "Provisioning",
  ACTIVE: "Aktywna",
  SUSPENDED: "Zawieszona",
  CANCELED: "Anulowana",
  EXPIRED: "Wygasła",
  PAST_DUE: "Zaległa",
};

const TICKET_STATUS_PL: Record<string, string> = {
  OPEN: "Otwarte",
  IN_PROGRESS: "W realizacji",
  CLOSED: "Zamknięte",
};

function formatAuditSnippet(details: unknown): string {
  if (details === null || details === undefined) return "—";
  if (typeof details === "string") return details.length > 120 ? `${details.slice(0, 117)}…` : details;
  try {
    const s = JSON.stringify(details);
    return s.length > 140 ? `${s.slice(0, 137)}…` : s;
  } catch {
    return "—";
  }
}

export default async function StaffCustomerProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  let profile: Awaited<ReturnType<typeof staffGetCustomerProfile>>;
  try {
    profile = await staffGetCustomerProfile(userId);
  } catch (e) {
    if (e instanceof StaffApiError && e.status === 401) redirect("/login");
    if (e instanceof StaffApiError && (e.status === 404 || e.status === 403)) notFound();
    throw e;
  }

  const {
    user,
    subscriptions,
    recentTickets,
    domains,
    walletLedger,
    recentInvoices,
    paymentMethods,
    auditTrail,
    statusPageOpenIncidents,
    customerTimeline,
    supportInsights,
  } = profile;

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/crm"
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-cyan-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Klienci
        </Link>
        <Link
          href={`/?userId=${encodeURIComponent(user.id)}`}
          className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-cyan-400/80 hover:text-cyan-300"
        >
          Skrzynka: tylko ten klient
          <ExternalLink className="h-3 w-3 opacity-70" />
        </Link>
      </div>

      {statusPageOpenIncidents.length > 0 ? (
        <div className="rounded-2xl border border-amber-500/35 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <p className="font-bold uppercase tracking-wide text-amber-200/90">
            Otwarte incydenty na status page (węzły tego klienta)
          </p>
          <ul className="mt-2 space-y-1 text-xs">
            {statusPageOpenIncidents.map((i) => (
              <li key={i.id}>
                <span className="font-mono text-amber-100/80">{i.severity}</span> · {i.title} ·{" "}
                {i.serverName} — {i.probeTarget} (
                {new Date(i.startedAt).toLocaleString("pl-PL")})
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {user.loginBlocked ? (
        <div className="rounded-2xl border border-rose-500/35 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
          <p className="font-bold uppercase tracking-wide text-rose-200/90">
            Logowanie do panelu klienta zablokowane
          </p>
          {user.loginBlockedReason ? (
            <p className="mt-2 text-xs text-rose-100/85">{user.loginBlockedReason}</p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Klient nie zaloguje się hasłem / 2FA — możesz nadal użyć widoku przez impersonację lub
              admin odblokuje konto.
            </p>
          )}
        </div>
      ) : null}

      <header className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{displayName}</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 shrink-0 opacity-70" />
              <a href={`mailto:${user.email}`} className="font-mono text-cyan-300 hover:underline">
                {user.email}
              </a>
              {user.companyName ? (
                <span className="text-neutral-400">· {user.companyName}</span>
              ) : null}
              {user.nip ? <span className="text-neutral-400">· NIP {user.nip}</span> : null}
            </p>
            <p className="mt-1 text-xs font-mono text-neutral-500">ID {user.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <StaffImpersonateButton userId={user.id} email={user.email} />
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Portfel
            </dt>
            <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
              {formatPlnAndCredits(user.walletBalance, user.walletCurrency)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              2FA
            </dt>
            <dd className="mt-1 text-sm text-white">{user.isTwoFactorEnabled ? "Tak" : "Nie"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Rejestracja
            </dt>
            <dd className="mt-1 text-sm text-white">
              {new Date(user.createdAt).toLocaleString("pl-PL")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Stripe
            </dt>
            <dd className="mt-1 break-all font-mono text-xs text-neutral-300">
              {user.stripeCustomerId ?? "—"}
            </dd>
          </div>
        </dl>

        {user.deletionRequestedAt ? (
          <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Klient złożył wniosek o usunięcie konta (
            {new Date(user.deletionRequestedAt).toLocaleString("pl-PL")}).
          </div>
        ) : null}
      </header>

      <section className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Customer risk</h2>
          <p
            className={`mt-3 text-3xl font-bold ${
              supportInsights.riskLevel === "high"
                ? "text-rose-300"
                : supportInsights.riskLevel === "medium"
                  ? "text-amber-300"
                  : "text-emerald-300"
            }`}
          >
            {supportInsights.riskScore}/100
          </p>
          {supportInsights.reasons.length > 0 ? (
            <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-300">
              {supportInsights.reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-xs text-neutral-400">Brak aktywnych sygnałów ryzyka.</p>
          )}
        </div>
        <div className="rounded-2xl border border-white/10 bg-black/30 p-5">
          <h2 className="text-sm font-bold uppercase tracking-wide text-white">Sugestie odpowiedzi / działań</h2>
          <ul className="mt-3 space-y-2 text-sm text-neutral-300">
            {supportInsights.suggestions.map((suggestion) => (
              <li key={suggestion} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                {suggestion}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Timeline klienta
        </h2>
        <ul className="divide-y divide-white/5">
          {customerTimeline.map((item) => (
            <li key={item.id} className="px-4 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-medium text-white">{item.title}</p>
                <span className="text-xs text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString("pl-PL")}
                </span>
              </div>
              <p className="mt-1 text-xs uppercase tracking-wide text-neutral-500">
                {item.kind} · {item.meta}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Subskrypcje ({subscriptions.length})
        </h2>
        {subscriptions.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Brak subskrypcji.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Plan</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Hosting</th>
                  <th className="px-4 py-2">Węzeł</th>
                  <th className="px-4 py-2">Okres</th>
                  <th className="px-4 py-2 text-right">BOK</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td className="px-4 py-3">
                      <span className="font-medium">{s.plan.name}</span>
                      {s.serviceTag ? (
                        <p className="font-mono text-[11px] text-cyan-300/80">{s.serviceTag}</p>
                      ) : null}
                      <p className="text-xs text-muted-foreground">{s.interval}</p>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs">
                        {SUB_STATUS_PL[s.status] ?? s.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {s.account ? (
                        <>
                          <div>{s.account.domain}</div>
                          <div className="text-muted-foreground">DA: {s.account.daUsername}</div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.account?.server ? (
                        <>
                          {s.account.server.name ?? s.account.server.hostname ?? "—"}
                          <div className="font-mono">{s.account.server.ipAddress}</div>
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {s.currentPeriodEnd
                        ? new Date(s.currentPeriodEnd).toLocaleDateString("pl-PL")
                        : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/crm/${user.id}/subscriptions/${s.id}`}
                        className="text-[10px] font-bold uppercase tracking-wide text-cyan-300 hover:underline"
                      >
                        Szczegóły
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-black/30">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
            Ostatnie zgłoszenia
          </h2>
          <ul className="divide-y divide-white/5">
            {recentTickets.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tickets/${t.id}`}
                  className="block px-4 py-3 text-sm hover:bg-white/[0.04]"
                >
                  <span className="font-mono text-xs text-muted-foreground">#{t.id.slice(0, 8)}</span>
                  <p className="font-medium text-white">{t.subject}</p>
                  <p className="text-xs text-muted-foreground">
                    {TICKET_STATUS_PL[t.status] ?? t.status} · {t.replyCount} odp.
                  </p>
                </Link>
              </li>
            ))}
          </ul>
          {recentTickets.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Brak ticketów.</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/30">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
            Domeny ({domains.length})
          </h2>
          <ul className="divide-y divide-white/5">
            {domains.map((d) => (
              <li key={d.id} className="px-4 py-2.5 text-sm">
                <span className="font-mono text-cyan-100/90">{d.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{d.status}</span>
              </li>
            ))}
          </ul>
          {domains.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Brak domen w panelu.</p>
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Historia portfela (ostatnie {walletLedger.length})
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Data</th>
                <th className="px-4 py-2">Typ</th>
                <th className="px-4 py-2">Kwota</th>
                <th className="px-4 py-2">Saldo po</th>
                <th className="px-4 py-2">Opis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {walletLedger.map((w) => (
                <tr key={w.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {new Date(w.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">
                    {w.type} <span className="text-neutral-500">({w.status})</span>
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums">
                    {formatPlnAndCredits(w.amount, w.currency)}
                  </td>
                  <td className="px-4 py-2 text-xs tabular-nums text-neutral-300">
                    {formatPlnAndCredits(w.balanceAfter, w.currency)}
                  </td>
                  <td className="max-w-xs truncate px-4 py-2 text-xs text-neutral-400">
                    {w.description ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {walletLedger.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Brak wpisów.</p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-white/10 bg-black/30">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
            Faktury ({recentInvoices.length})
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-white">
              <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Numer</th>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Kwota</th>
                  <th className="px-4 py-2">Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {recentInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="px-4 py-2 font-mono text-xs">{inv.number}</td>
                    <td className="px-4 py-2 text-xs">{inv.status}</td>
                    <td className="px-4 py-2 text-xs tabular-nums">
                      {formatPlnAndCredits(inv.amount, inv.currency)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                      {new Date(inv.createdAt).toLocaleDateString("pl-PL")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {recentInvoices.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Brak faktur.</p>
          ) : null}
        </section>

        <section className="rounded-2xl border border-white/10 bg-black/30">
          <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
            Metody płatności
          </h2>
          <ul className="divide-y divide-white/5 p-2">
            {paymentMethods.map((pm) => (
              <li key={pm.id} className="px-2 py-2 text-sm">
                <span className="text-white">
                  {(pm.brand ?? pm.provider ?? "").toUpperCase()} ·••• {pm.last4 ?? "—"}
                </span>
                {pm.expMonth != null && pm.expYear != null ? (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ważna do {pm.expMonth}/{pm.expYear}
                  </span>
                ) : null}
                {pm.isDefault ? (
                  <span className="ml-2 rounded border border-cyan-500/25 px-1.5 text-[10px] text-cyan-200">
                    domyślna
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
          {paymentMethods.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">Brak zapisanych metod.</p>
          ) : null}
        </section>
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30">
        <h2 className="border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white">
          Ostatnie wpisy audytu (powiązane z kontem)
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-white">
            <thead className="border-b border-white/10 bg-white/5 text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Czas</th>
                <th className="px-4 py-2">Akcja</th>
                <th className="px-4 py-2">Aktor</th>
                <th className="px-4 py-2">Szczegóły</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {auditTrail.map((a) => (
                <tr key={a.id}>
                  <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                    {new Date(a.createdAt).toLocaleString("pl-PL")}
                  </td>
                  <td className="px-4 py-2 font-mono text-xs">{a.action}</td>
                  <td className="px-4 py-2 font-mono text-[11px] text-neutral-400">
                    {a.actorUserId ?? "—"}
                  </td>
                  <td className="max-w-md px-4 py-2 font-mono text-[11px] text-neutral-300">
                    {formatAuditSnippet(a.details)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {auditTrail.length === 0 ? (
          <p className="p-6 text-sm text-muted-foreground">Brak wpisów.</p>
        ) : null}
      </section>

      <StaffDnsTlsPanel userId={user.id} subscriptions={subscriptions} />
    </div>
  );
}

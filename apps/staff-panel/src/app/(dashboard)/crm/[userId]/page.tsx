import Link from "next/link";
import { BladStrony } from "@/components/blad-strony";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, ExternalLink, Mail } from "lucide-react";
import { StaffApiError, staffApi } from "@/lib/staff-api";
import { WarunkiIndywidualne, type PodgladWarunkow } from "./warunki-indywidualne";
import { rozliczeniePoza, ustawWarunki, zalozUsluge } from "./warunki-actions";
import { staffGetCustomerProfile } from "@/lib/crm-profile-data";
import { StaffImpersonateButton } from "../impersonate-button";
import { StaffDnsTlsPanel } from "../dns-tls-panel";
import { OperacjeZWnioskiem } from "./operacje-z-wnioskiem";
import { formatPlnAndCredits } from "@/lib/credits";
import { plForm, services } from "@/lib/pl";
import { maUprawnienie, mozeWejscNaKonto, pobierzDostepOperatora } from "@/lib/staff-access";
import { sekcjaKarty, zakladkiKartyKlienta } from "@/lib/sekcje-karty-klienta";
import { NotatkaWewnetrzna } from "./notatka-wewnetrzna";
import { BlokadaLogowania } from "./blokada-logowania";
import {
  BILLING_INTERVAL_PL,
  DOMAIN_STATUS_PL,
  INVOICE_STATUS_PL,
  SUBSCRIPTION_STATUS_PL as SUB_STATUS_PL,
  TICKET_STATUS_PL,
  WALLET_TX_STATUS_PL,
  WALLET_TX_TYPE_PL,
  etykietaWpisuPortfela,
  etykieta,
} from "@verris/contracts";

export const dynamic = "force-dynamic";

const RODZAJ_PL: Record<string, string> = { ticket: "Zgłoszenie", invoice: "Faktura", wallet: "Portfel", audit: "Audyt" };
const ZRODLO: Record<string, string> = { WALLET: "portfel Verris", STRIPE_CARD: "karta (Stripe)", MANUAL: "przelew / poza Verris" };
const KARTA = "rounded-2xl border border-white/10 bg-black/30";
const NAGLOWEK = "border-b border-white/10 px-4 py-3 text-sm font-bold uppercase tracking-wide text-white";

/** Wpis osi czasu po polsku. Akcja audytu zostaje kodem (mono) — to identyfikator do szukania w dzienniku. */
function wpisOsi(item: { kind: string; title: string; code: string; meta: string }) {
  if (item.kind === "wallet") return { tytul: `Portfel: ${etykieta(WALLET_TX_TYPE_PL, item.code)}`, opis: item.meta, kod: false };
  if (item.kind === "invoice") return { tytul: item.title, opis: [etykieta(INVOICE_STATUS_PL, item.code), item.meta].join(" · "), kod: false };
  if (item.kind === "ticket") return { tytul: item.title, opis: etykieta(TICKET_STATUS_PL, item.code), kod: false };
  return { tytul: item.title, opis: item.meta, kod: item.kind === "audit" };
}

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

/**
 * Karta klienta w panelu obsługi. PB-46 (decyzja 08.10): te same zakładki i karty w tej samej kolejności co
 * w panelu admina (`@/lib/sekcje-karty-klienta`, atrybut `data-karta`), różnią się tylko uprawnieniami —
 * zapis notatki i blokada logowania z CUSTOMERS_MANAGE; reset hasła, zmiana e-maila i RODO tylko w panelu admina.
 */
export default async function StaffCustomerProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ userId: string }>;
  searchParams: Promise<{ sekcja?: string }>;
}) {
  const { userId } = await params;
  const sekcja = sekcjaKarty((await searchParams).sekcja);

  let profile: Awaited<ReturnType<typeof staffGetCustomerProfile>>;
  try {
    profile = await staffGetCustomerProfile(userId, sekcja);
  } catch (e) {
    if (e instanceof StaffApiError && e.status === 401) redirect("/login");
    if (e instanceof StaffApiError && e.status === 404) notFound();
    return <BladStrony blad={e} tytul="Karta klienta" powrot={{ href: "/crm", label: "Klienci" }} />;
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

  // PB-27 / PB-28 — tylko z uprawnieniem CUSTOM_TERMS_MANAGE (403 = bez sekcji).
  const [warunki, dostep] = await Promise.all([
    staffApi<PodgladWarunkow>(`/admin/custom-terms/user/${encodeURIComponent(userId)}`).catch(() => null),
    pobierzDostepOperatora(),
  ]);
  const mozeZarzadzac = maUprawnienie(dostep, "CUSTOMERS_MANAGE");

  const displayName =
    [user.firstName, user.lastName].filter(Boolean).join(" ").trim() || user.email;
  const baza = `/crm/${user.id}`;
  const zywe = subscriptions.filter((s) => !["CANCELED", "EXPIRED"].includes(s.status));
  const aktywne = subscriptions.filter((s) => s.status === "ACTIVE" || s.status === "PAST_DUE");
  const otwarteZgl = recentTickets.filter((t) => t.status !== "CLOSED");
  const indywidualne = subscriptions.filter((s) => s.individualPrice != null || (s.autoscalingDiscountPct ?? 0) > 0);
  const zrodla = [...new Set(zywe.map((s) => ZRODLO[s.paymentSource] ?? s.paymentSource))];
  const domyslna = paymentMethods.find((m) => m.isDefault);
  const ryzykoKolor =
    supportInsights.riskLevel === "high" ? "text-rose-300" : supportInsights.riskLevel === "medium" ? "text-amber-300" : "text-emerald-300";

  return (
    <div className="space-y-6">
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
            Otwarte incydenty na węzłach klienta
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
              Zablokowany klient nie zaloguje się, a wejście na jego konto z panelu też nie zadziała, dopóki blokada trwa.
            </p>
          )}
        </div>
      ) : null}

      <header className="rounded-2xl border border-white/10 bg-black/35 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Klient od {new Date(user.createdAt).toLocaleDateString("pl-PL")}
            </p>
            <h1 className="mt-1 text-2xl font-bold text-white">{displayName}</h1>
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
            {mozeWejscNaKonto(dostep) ? <StaffImpersonateButton userId={user.id} email={user.email} /> : null}
          </div>
        </div>

        <dl className="mt-6 grid gap-4 border-t border-white/10 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Saldo portfela</dt>
            <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
              {formatPlnAndCredits(user.walletBalance, user.walletCurrency)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Usługi</dt>
            <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
              {aktywne.length} <span className="text-sm font-normal text-neutral-400">{plForm(aktywne.length, "aktywna", "aktywne", "aktywnych")}</span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Kondycja</dt>
            <dd className={`mt-1 text-lg font-semibold tabular-nums ${ryzykoKolor}`}>
              {Math.max(0, 100 - supportInsights.riskScore)} <span className="text-sm font-normal text-neutral-400">/ 100</span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">Zgłoszenia</dt>
            <dd className="mt-1 text-lg font-semibold text-white tabular-nums">
              {otwarteZgl.length} <span className="text-sm font-normal text-neutral-400">{plForm(otwarteZgl.length, "otwarte", "otwarte", "otwartych")}</span>
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

      <nav aria-label="Sekcje klienta" className="flex gap-1 overflow-x-auto border-b border-white/10">
        {zakladkiKartyKlienta(baza, sekcja, { uslugi: zywe.length, zgloszenia: otwarteZgl.length, warunki: !!warunki }).map((z) => (
          <Link
            key={z.klucz}
            href={z.href}
            aria-current={z.on ? "page" : undefined}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm ${z.on ? "border-cyan-400 font-semibold text-white" : "border-transparent text-muted-foreground hover:text-white"}`}
          >
            {z.nazwa}
          </Link>
        ))}
      </nav>

      {sekcja === "przeglad" ? (
        <div className="grid gap-6 xl:grid-cols-[1.3fr_1fr]">
          <div className="space-y-6">
            <section className={KARTA} data-karta="uslugi">
              <h2 className={NAGLOWEK}>Usługi</h2>
              {zywe.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Klient nie ma aktywnych usług.</p> : null}
              <ul className="divide-y divide-white/5">
                {zywe.map((s) => (
                  <li key={s.id}>
                    <Link href={`${baza}/subscriptions/${s.id}`} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm hover:bg-white/[0.04]">
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-white">{s.account?.domain ?? s.serviceTag ?? s.plan.name}</span>
                        <span className="block text-xs text-muted-foreground">
                          {[s.plan.name, s.account?.server ? s.account.server.name ?? s.account.server.hostname : null].filter(Boolean).join(" · ")}
                        </span>
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {s.cancelAt || s.currentPeriodEnd ? new Date((s.cancelAt ?? s.currentPeriodEnd)!).toLocaleDateString("pl-PL") : "—"}
                      </span>
                      <span className="rounded border border-white/10 bg-white/5 px-2 py-0.5 text-xs">{SUB_STATUS_PL[s.status] ?? s.status}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>

            <section className={KARTA} data-karta="os-czasu">
              <div className="flex items-center border-b border-white/10 px-4 py-3">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white">Oś czasu</h2>
                <Link href={`${baza}?sekcja=dziennik`} className="ml-auto text-xs font-semibold text-cyan-300 hover:underline">
                  Pełny dziennik →
                </Link>
              </div>
              {customerTimeline.length === 0 ? <p className="p-6 text-sm text-muted-foreground">Brak zdarzeń.</p> : null}
              <ul className="divide-y divide-white/5">
                {customerTimeline.slice(0, 6).map((item) => {
                  const w = wpisOsi(item);
                  return (
                    <li key={item.id} className="px-4 py-3 text-sm">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className={w.kod ? "font-mono text-xs text-white" : "font-medium text-white"}>{w.tytul}</p>
                        <span className="text-xs text-muted-foreground">
                          {new Date(item.createdAt).toLocaleString("pl-PL")}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-neutral-500">
                        {[RODZAJ_PL[item.kind] ?? item.kind, w.opis].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>

          <div className="space-y-6">
            <section className={`${KARTA} p-5`} data-karta="ryzyko">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">Ryzyko i sugestie</h2>
              <p className={`mt-3 text-3xl font-bold ${ryzykoKolor}`}>{supportInsights.riskScore}/100</p>
              {supportInsights.reasons.length > 0 ? (
                <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-neutral-300">
                  {supportInsights.reasons.map((reason) => (
                    <li key={reason}>{reason}</li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-neutral-400">Brak aktywnych sygnałów ryzyka.</p>
              )}
              {supportInsights.suggestions.length > 0 ? (
                <>
                  <p className="mt-4 text-[10px] font-bold uppercase tracking-wider text-neutral-500">Sugestie odpowiedzi / działań</p>
                  <ul className="mt-2 space-y-2 text-sm text-neutral-300">
                    {supportInsights.suggestions.map((suggestion) => (
                      <li key={suggestion} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                        {suggestion}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </section>

            <section className={`${KARTA} space-y-2 p-5`} data-karta="rozliczenie">
              <div className="flex items-center">
                <h2 className="text-sm font-bold uppercase tracking-wide text-white">Rozliczenie</h2>
                <Link href={`${baza}?sekcja=rozliczenia`} className="ml-auto text-xs font-semibold text-cyan-300 hover:underline">
                  Szczegóły
                </Link>
              </div>
              <Para k="Sposób" v={zrodla.join(", ") || "—"} />
              <Para k="Warunki indywidualne" v={indywidualne.length ? services(indywidualne.length) : "brak"} />
              <Para k="Dane do faktury" v={user.companyName && user.nip ? `komplet · NIP ${user.nip}` : user.nip ? `NIP ${user.nip} · bez nazwy firmy` : "osoba prywatna / brak NIP"} />
              <Para k="Metoda płatności" v={domyslna ? `${domyslna.brand ?? "karta"} •••• ${domyslna.last4 ?? ""}` : "brak zapisanej"} />
            </section>

            <section className={`${KARTA} space-y-3 p-5`} data-karta="notatka">
              <h2 className="text-sm font-bold uppercase tracking-wide text-white">Notatka wewnętrzna</h2>
              <NotatkaWewnetrzna userId={user.id} poczatkowa={user.adminInternalNote ?? ""} mozeEdytowac={mozeZarzadzac} />
            </section>

            {mozeZarzadzac ? (
              <section className={KARTA} data-karta="operacje">
                <div className="border-b border-white/10 px-4 py-3">
                  <h2 className="text-sm font-bold uppercase tracking-wide text-white">Operacje wrażliwe</h2>
                  <p className="text-xs text-muted-foreground">każda trafia do dziennika</p>
                </div>
                <div className="flex items-center gap-3 px-4 py-3 text-sm">
                  <span className="flex-1 text-white">{user.loginBlocked ? "Odblokowanie logowania" : "Blokada logowania"}</span>
                  <Link
                    href={`${baza}?sekcja=dostepy#blokada`}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:border-cyan-400"
                  >
                    {user.loginBlocked ? "Odblokuj…" : "Zablokuj…"}
                  </Link>
                </div>
              </section>
            ) : null}
          </div>
        </div>
      ) : null}

      {sekcja === "uslugi" ? (
        <>
          <section className={KARTA} data-karta="uslugi">
            <h2 className={NAGLOWEK}>Usługi ({subscriptions.length})</h2>
            {subscriptions.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Brak usług.</p>
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
                          <p className="text-xs text-muted-foreground">{etykieta(BILLING_INTERVAL_PL, s.interval)}</p>
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
                            href={`${baza}/subscriptions/${s.id}`}
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

          <section className={KARTA} data-karta="domeny">
            <h2 className={NAGLOWEK}>Domeny ({domains.length})</h2>
            <ul className="divide-y divide-white/5">
              {domains.map((d) => (
                <li key={d.id} className="px-4 py-2.5 text-sm">
                  <span className="font-mono text-cyan-100/90">{d.name}</span>
                  <span className="ml-2 text-xs text-muted-foreground">{etykieta(DOMAIN_STATUS_PL, d.status)}</span>
                </li>
              ))}
            </ul>
            {domains.length === 0 ? (
              <p className="p-6 text-sm text-muted-foreground">Brak domen w panelu.</p>
            ) : null}
          </section>

          <StaffDnsTlsPanel userId={user.id} subscriptions={subscriptions} />
        </>
      ) : null}

      {sekcja === "rozliczenia" ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className={KARTA} data-karta="portfel">
            <h2 className={NAGLOWEK}>
              Portfel · {formatPlnAndCredits(user.walletBalance, user.walletCurrency)}
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
                      <td className="px-4 py-2 text-xs">
                        {etykietaWpisuPortfela(w.type, w.amount)} <span className="text-neutral-500">({etykieta(WALLET_TX_STATUS_PL, w.status)})</span>
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
              <p className="p-6 text-sm text-muted-foreground">Brak operacji.</p>
            ) : null}
          </section>

          <div className="space-y-6">
            <section className={KARTA} data-karta="faktury">
              <h2 className={NAGLOWEK}>Faktury ({recentInvoices.length})</h2>
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
                        <td className="px-4 py-2 text-xs">{etykieta(INVOICE_STATUS_PL, inv.status)}</td>
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

            <section className={KARTA} data-karta="metody">
              <h2 className={NAGLOWEK}>Metody płatności</h2>
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
        </div>
      ) : null}

      {sekcja === "warunki" && warunki ? (
        <div data-karta="warunki">
          <WarunkiIndywidualne
            userId={user.id}
            dane={warunki}
            akcje={{ zaloz: zalozUsluge, ustaw: ustawWarunki, poza: rozliczeniePoza }}
          />
        </div>
      ) : null}

      {sekcja === "zgloszenia" ? (
        <section className={KARTA} data-karta="zgloszenia">
          <h2 className={NAGLOWEK}>Zgłoszenia</h2>
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
            <p className="p-6 text-sm text-muted-foreground">Klient nie pisał jeszcze do obsługi.</p>
          ) : null}
        </section>
      ) : null}

      {sekcja === "dostepy" ? (
        <>
          <section className={`${KARTA} space-y-2 p-5`} data-karta="dostep">
            <h2 className="text-sm font-bold uppercase tracking-wide text-white">Dostęp do konta</h2>
            <Para k="Logowanie dwuetapowe (2FA)" v={user.isTwoFactorEnabled ? "włączone" : "wyłączone"} />
            <Para k="Logowanie" v={user.loginBlocked ? `zablokowane${user.loginBlockedReason ? ` — ${user.loginBlockedReason}` : ""}` : "dozwolone"} />
            <Para k="Rejestracja" v={new Date(user.createdAt).toLocaleString("pl-PL")} />
            <Para k="Klient Stripe" v={user.stripeCustomerId ?? "—"} mono />
            <Para k="ID konta" v={user.id} mono />
            <p className="pt-2 text-xs text-muted-foreground">
              Reset hasła, zmianę adresu e-mail i usunięcie konta (RODO) wykonuje administrator.
            </p>
          </section>
          {mozeZarzadzac ? (
            <BlokadaLogowania userId={user.id} zablokowane={!!user.loginBlocked} powod={user.loginBlockedReason ?? null} />
          ) : null}
          <OperacjeZWnioskiem userId={user.id} faktury={recentInvoices} />
        </>
      ) : null}

      {sekcja === "dziennik" ? (
        <section className={KARTA} data-karta="dziennik">
          <h2 className={NAGLOWEK}>Dziennik (wpisy powiązane z kontem)</h2>
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
      ) : null}
    </div>
  );
}

function Para({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span className={`min-w-0 break-all text-right text-white ${mono ? "font-mono text-xs" : ""}`}>{v}</span>
    </div>
  );
}

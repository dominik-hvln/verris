import Link from "next/link";
import { formatPlnAndCredits } from "@/lib/credits";
import { notFound } from "next/navigation";
import { ArrowLeft, UserCog } from "lucide-react";
import { AdminApiError } from "@/lib/api";
import { getCustomerOperationalDetail } from "../data";
import { CustomerOperationalForms } from "./operational-forms";
import { CreditWalletButton } from "../credit-wallet-button";
import { ImpersonateButton } from "../impersonate-button";

export const dynamic = "force-dynamic";

export default async function AdminCustomerOperationalPage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;

  let detail: Awaited<ReturnType<typeof getCustomerOperationalDetail>>;
  try {
    detail = await getCustomerOperationalDetail(userId);
  } catch (e) {
    if (e instanceof AdminApiError && (e.status === 404 || e.status === 400)) {
      notFound();
    }
    throw e;
  }

  const title =
    [detail.firstName, detail.lastName].filter(Boolean).join(" ").trim() || detail.email;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap items-center gap-4">
        <Link
          href="/customers"
          className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-indigo-400"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Baza klientów
        </Link>
      </div>

      <header className="rounded-2xl border border-white/10 bg-black/40 p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            <p className="mt-1 font-mono text-sm text-cyan-300/90">{detail.email}</p>
            <p className="mt-1 text-xs text-muted-foreground">ID {detail.id}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <CreditWalletButton
              userId={detail.id}
              email={detail.email}
              currentBalance={detail.walletBalance}
            />
            <ImpersonateButton userId={detail.id} email={detail.email} role="USER" />
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm border-t border-white/10 pt-4">
          <div>
            <dt className="text-[10px] font-bold uppercase text-neutral-500">Portfel</dt>
            <dd className="text-white tabular-nums">
              {formatPlnAndCredits(detail.walletBalance, detail.walletCurrency)}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-neutral-500">Subskrypcje</dt>
            <dd className="text-white">{detail.subscriptionsCount}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-neutral-500">2FA</dt>
            <dd className="text-white">{detail.isTwoFactorEnabled ? "Tak" : "Nie"}</dd>
          </div>
          <div>
            <dt className="text-[10px] font-bold uppercase text-neutral-500">Stripe</dt>
            <dd className="text-white font-mono text-xs break-all">
              {detail.stripeCustomerId ?? "—"}
            </dd>
          </div>
        </dl>
        {detail.loginBlocked ? (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            <strong>Logowanie zablokowane.</strong>
            {detail.loginBlockedReason ? ` ${detail.loginBlockedReason}` : null}
          </div>
        ) : null}
        {detail.deletionRequestedAt ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
            Klient złożył wniosek o usunięcie konta (
            {new Date(detail.deletionRequestedAt).toLocaleString("pl-PL")}).
          </div>
        ) : null}
      </header>

      <CustomerOperationalForms detail={detail} />

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <UserCog className="h-3.5 w-3.5" />
        Każda operacja jest zapisywana w audycie (kody ADMIN_CUSTOMER_*).
      </p>
    </div>
  );
}

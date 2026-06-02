"use client";

import Link from "next/link";
import { Eye, Wallet } from "lucide-react";
import { CREDIT_SHORT, formatCredits } from "@/lib/credits";

interface Props {
  balance: string | null;
  loading?: boolean;
  /** Sesja impersonacji staff/admin — wyraźny marker przy portfelu klienta. */
  impersonating?: boolean;
  /**
   * Próg "niskie saldo" — poniżej tej wartości kolor zmienia się na amber.
   * Domyślnie 20 K, żeby klient widział zawczasu, że trzeba doładować przed
   * kolejnym cyklem opłat za usługi albo skalowaniem.
   */
  lowThreshold?: number;
}

/**
 * Wskaźnik salda w topbar panelu klienta. Klikalny — prowadzi prosto do
 * strony portfela. Używa wirtualnej waluty (1 PLN = 1 kredyt). Renderuje
 * graceful fallback ("— K") gdy backend nie zwrócił salda, żeby układ
 * topbaru nie skakał.
 */
export function WalletBadge({
  balance,
  lowThreshold = 20,
  loading = false,
  impersonating = false,
}: Props) {
  if (loading) {
    return (
      <div
        className="inline-flex h-10 min-w-[7rem] animate-pulse items-center gap-2 rounded-full border border-white/10 bg-white/[0.06] px-4"
        aria-hidden
      >
        <span className="h-4 w-4 rounded-full bg-white/10" />
        <span className="h-3 w-14 rounded bg-white/10" />
      </div>
    );
  }

  const numeric = balance !== null ? Number.parseFloat(balance) : NaN;
  const hasBalance = Number.isFinite(numeric);
  const isEmpty = hasBalance && numeric <= 0;
  const isLow = hasBalance && numeric > 0 && numeric < lowThreshold;

  const tone = impersonating
    ? "border-amber-400/50 bg-amber-500/15 text-amber-50 hover:bg-amber-500/20 ring-1 ring-amber-400/30"
    : isEmpty
      ? "border-rose-400/40 bg-rose-400/10 text-rose-100 hover:bg-rose-400/15"
      : isLow
        ? "border-amber-400/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15"
        : hasBalance
          ? "border-emerald-400/30 bg-emerald-400/[0.06] text-emerald-100 hover:bg-emerald-400/10"
          : "border-white/10 bg-white/[0.03] text-neutral-300 hover:bg-white/[0.06]";

  const iconTone = isEmpty
    ? "text-rose-300"
    : isLow
      ? "text-amber-300"
      : hasBalance
        ? "text-emerald-300"
        : "text-neutral-400";

  const tooltip = impersonating
    ? "Saldo konta klienta (sesja impersonacji — uważaj przy operacjach finansowych)."
    : isEmpty
    ? "Saldo jest zerowe — doładuj portfel, aby utrzymać usługi i odnowienia."
    : isLow
      ? `Saldo poniżej ${lowThreshold} ${CREDIT_SHORT}. Rozważ doładowanie.`
      : hasBalance
        ? `Twoje saldo w kredytach Verris (1 zł = 1 ${CREDIT_SHORT}).`
        : "Nie udało się pobrać salda portfela.";

  return (
    <Link
      href="/dashboard/billing"
      title={tooltip}
      className={`inline-flex max-w-[42vw] items-center gap-1.5 rounded-full border px-2.5 py-1.5 text-xs font-semibold transition-colors sm:max-w-none sm:gap-2.5 sm:px-4 sm:py-2 sm:text-sm ${tone}`}
    >
      {impersonating ? (
        <Eye className="h-4 w-4 shrink-0 text-amber-200" aria-hidden />
      ) : (
        <Wallet className={`h-4 w-4 shrink-0 ${iconTone}`} aria-hidden />
      )}
      <span className="truncate tabular-nums tracking-tight">
        {formatCredits(balance)}
      </span>
    </Link>
  );
}

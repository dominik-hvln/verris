"use client";

import Link from "next/link";
import { Eye } from "lucide-react";
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
        className="inline-flex h-[34px] min-w-[7rem] animate-pulse items-center gap-2 rounded-md border border-line bg-card px-3"
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

  // PB-15 — chip jak we wzorcu: „Portfel" + saldo; stan niski/zerowy kropką i kolorem liczby.
  const tone = impersonating
    ? "border-amber-400/50 bg-amber-500/15 ring-1 ring-amber-400/30"
    : "border-line bg-card hover:border-line-strong";
  const amountTone = isEmpty ? "text-crit" : isLow ? "text-warn" : hasBalance ? "text-foreground" : "text-muted-foreground";

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
      data-tip={tooltip}
      className={`inline-flex max-w-[46vw] items-center gap-2 whitespace-nowrap rounded-md border px-2.5 py-1.5 text-[13px] text-muted-foreground transition-colors ${tone}`}
    >
      {impersonating ? <Eye className="h-4 w-4 shrink-0 text-amber-200" aria-hidden /> : null}
      <span className="max-sm:hidden">Portfel</span>
      {isEmpty || isLow ? <span className={`v2-breathe v2-breathe-warn h-1.5 w-1.5 rounded-full ${isEmpty ? "bg-crit" : "bg-warn"}`} /> : null}
      <b className={`truncate font-display text-[13.5px] font-bold tabular-nums ${amountTone}`}>{formatCredits(balance)}</b>
    </Link>
  );
}

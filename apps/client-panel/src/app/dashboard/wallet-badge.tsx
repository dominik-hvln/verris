"use client";

import Link from "next/link";
import { Wallet } from "lucide-react";
import { CREDIT_SHORT, formatCredits } from "@/lib/credits";

interface Props {
  balance: string | null;
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
export function WalletBadge({ balance, lowThreshold = 20 }: Props) {
  const numeric = balance !== null ? Number.parseFloat(balance) : NaN;
  const hasBalance = Number.isFinite(numeric);
  const isEmpty = hasBalance && numeric <= 0;
  const isLow = hasBalance && numeric > 0 && numeric < lowThreshold;

  const tone = isEmpty
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

  const tooltip = isEmpty
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
      className={`inline-flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${tone}`}
    >
      <Wallet className={`h-4 w-4 shrink-0 ${iconTone}`} aria-hidden />
      <span className="tabular-nums tracking-tight">
        {formatCredits(balance)}
      </span>
    </Link>
  );
}

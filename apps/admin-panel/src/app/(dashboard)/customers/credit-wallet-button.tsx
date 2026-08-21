"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Coins, Loader2 } from "lucide-react";
import { ModalPortal } from "@/components/modal-portal";
import { adminCreditWalletAction } from "./actions";

interface Props {
  userId: string;
  email: string;
  currentBalance: string;
}

const PRESETS = ["10", "25", "50", "100"];
const REASON_PRESETS = [
  "Rekompensata za awarię",
  "Bonus powitalny",
  "Bonus polecenia (referral)",
  "Doładowanie testowe",
];

export function CreditWalletButton({ userId, email, currentBalance }: Props) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("50");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const numericAmount = Number.parseFloat(amount.replace(",", ".")) || 0;
  const projectedBalance = (Number.parseFloat(currentBalance) + numericAmount).toFixed(2);

  const reset = () => {
    setAmount("50");
    setReason("");
    setError(null);
    setSuccess(null);
  };

  const submit = () => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      const res = await adminCreditWalletAction({
        userId,
        amount,
        description: reason || undefined,
      });
      if (!res.ok) {
        setError(res.error ?? "Nieznany błąd.");
        return;
      }
      setSuccess(`Przyznano ${res.amount} K. Klient otrzymał potwierdzenie e-mailem.`);
    });
  };

  const close = () => {
    setOpen(false);
    setTimeout(reset, 200);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 hover:bg-emerald-400/20"
      >
        <Coins className="h-3.5 w-3.5" /> Dodaj K
      </button>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur p-4"
            role="presentation"
            onClick={close}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              aria-labelledby="credit-wallet-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-start gap-3 mb-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10 border border-emerald-400/30 text-emerald-200">
                  <Coins className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <h3 id="credit-wallet-title" className="text-base font-bold text-white">
                    Dodaj kredyty na portfel
                  </h3>
                  <p className="text-xs text-muted-foreground mt-0.5 break-all">{email}</p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 mb-4 grid grid-cols-2 gap-3 text-xs">
                <div>
                  <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Aktualne saldo
                  </div>
                  <div className="text-white font-mono mt-1 text-sm">
                    {Number.parseFloat(currentBalance).toFixed(2)} K
                  </div>
                </div>
                <div>
                  <div className="text-neutral-500 uppercase tracking-wider text-[10px]">
                    Po doładowaniu
                  </div>
                  <div className="text-emerald-300 font-mono mt-1 text-sm">{projectedBalance} K</div>
                </div>
              </div>

              <label className="block mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  Kwota (K) — 1 zł = 1 kredyt
                </span>
                <div className="grid grid-cols-4 gap-2 mt-2 mb-2">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAmount(preset)}
                      className={`rounded-lg border px-2 py-1.5 text-xs font-bold transition-all ${
                        amount === preset
                          ? "border-emerald-400 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.03] text-neutral-300 hover:border-white/30"
                      }`}
                    >
                      +{preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="50.00"
                  className="w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600"
                />
              </label>

              <label className="block mb-3">
                <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                  Powód (klient widzi w mailu i historii)
                </span>
                <div className="flex flex-wrap gap-1.5 mt-2 mb-2">
                  {REASON_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setReason(preset)}
                      className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                        reason === preset
                          ? "border-emerald-400/40 bg-emerald-400/10 text-emerald-200"
                          : "border-white/10 bg-white/[0.03] text-neutral-400 hover:border-white/30 hover:text-white"
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  placeholder="np. Rekompensata za awarię 12.05 (ticket #4321)"
                  className="w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600 resize-none"
                />
                <p className="mt-1.5 text-[10px] text-neutral-500">
                  Jeśli zostawisz puste, klient zobaczy „Uznanie od Zespołu Verris".
                </p>
              </label>

              {error && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  {error}
                </div>
              )}

              {success && (
                <div className="mb-3 flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-500/10 p-3 text-xs text-emerald-200">
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                  {success}
                </div>
              )}

              <div className="flex justify-end gap-2 mt-2">
                <button
                  type="button"
                  onClick={close}
                  disabled={pending}
                  className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                >
                  {success ? "Zamknij" : "Anuluj"}
                </button>
                {!success && (
                  <button
                    type="button"
                    onClick={submit}
                    disabled={pending || numericAmount <= 0}
                    className="rounded-lg bg-emerald-400/20 border border-emerald-400/40 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/30 disabled:opacity-50 inline-flex items-center gap-2"
                  >
                    {pending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Coins className="h-4 w-4" />
                    )}
                    Przyznaj kredyty
                  </button>
                )}
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

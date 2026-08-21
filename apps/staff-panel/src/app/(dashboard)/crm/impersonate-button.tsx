"use client";

import { useState, useTransition } from "react";
import { Loader2, UserCog, AlertCircle } from "lucide-react";
import { staffImpersonateUserAction } from "./actions";

interface Props {
  userId: string;
  email: string;
}

export function StaffImpersonateButton({ userId, email }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const start = () => {
    setError(null);
    if (reason.trim().length < 10) {
      setError("Powód jest wymagany — min. 10 znaków (zostanie zarchiwizowany).");
      return;
    }
    startTransition(async () => {
      const res = await staffImpersonateUserAction(userId, reason);
      if (res && "ok" in res && res.ok === false) {
        setError(res.error);
      }
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
      >
        <UserCog className="h-3.5 w-3.5" />
        Panel klienta
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl">
            <div className="mb-4 flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-400/10 text-amber-200">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Wejście w panel klienta</h3>
                <p className="mt-0.5 break-all text-xs text-muted-foreground">{email}</p>
              </div>
            </div>

            <p className="mb-4 text-sm leading-relaxed text-neutral-300">
              Zobaczysz usługi, domeny i ustawienia konta tak jak klient. Sesja trwa{" "}
              <strong>30 minut</strong> i jest zapisywana w audycie.
            </p>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Powód <span className="text-rose-400">*</span> (min. 10 znaków, archiwizowany)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="np. Ticket #1234 — błąd DNS"
                className="mt-1.5 w-full resize-none rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-amber-400 focus:outline-none"
                aria-invalid={reason.length > 0 && reason.trim().length < 10}
              />
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Znaków: {reason.trim().length} / 10
              </span>
            </label>

            {error ? (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            ) : null}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
              >
                Anuluj
              </button>
              <button
                type="button"
                onClick={start}
                disabled={pending}
                className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/20 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-400/30 disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCog className="h-4 w-4" />}
                Otwórz panel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

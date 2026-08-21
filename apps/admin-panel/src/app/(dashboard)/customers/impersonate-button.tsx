"use client";

import { useState, useTransition } from "react";
import { Loader2, UserCog, AlertCircle } from "lucide-react";
import { ModalPortal } from "@/components/modal-portal";
import { impersonateUserAction } from "./actions";

interface Props {
  userId: string;
  email: string;
  role: "USER" | "STAFF" | "ADMIN";
}

export function ImpersonateButton({ userId, email, role }: Props) {
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
      const res = await impersonateUserAction(userId, reason);
      if (res && "ok" in res && res.ok === false) {
        setError(res.error);
      }
      // success path triggers a server-side redirect, so this code path won't run.
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-200 hover:bg-amber-400/20"
      >
        <UserCog className="h-3.5 w-3.5" /> Impersonate
      </button>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur p-4"
            role="presentation"
            onClick={() => setOpen(false)}
          >
            <div
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl"
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="flex items-start gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10 border border-amber-400/30 text-amber-200">
                <UserCog className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">
                  Wcielenie się w konto
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5 break-all">
                  {email} · rola {role}
                </p>
              </div>
            </div>

            <p className="text-sm text-neutral-300 leading-relaxed mb-4">
              Po potwierdzeniu zostaniesz przeniesiony do panelu klienta z aktywną
              sesją tego użytkownika. Sesja wygasa po <strong>30 minutach</strong>{" "}
              i jest w pełni rejestrowana w Logach Bezpieczeństwa.
            </p>

            <label className="block">
              <span className="text-xs font-bold uppercase tracking-widest text-neutral-500">
                Powód <span className="text-rose-400">*</span> (min. 10 znaków, zostanie
                zarchiwizowany)
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                placeholder="np. Ticket #4321 — pomoc z konfiguracją DNS"
                className="mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-amber-400 focus:outline-none placeholder:text-neutral-600 resize-none"
                aria-invalid={reason.length > 0 && reason.trim().length < 10}
              />
              <span className="mt-1 block text-[10px] text-muted-foreground">
                Znaków: {reason.trim().length} / 10
              </span>
            </label>

            {error && (
              <div className="mt-3 flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {error}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-5">
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
                className="rounded-lg bg-amber-400/20 border border-amber-400/40 px-4 py-2 text-sm font-bold text-amber-100 hover:bg-amber-400/30 disabled:opacity-50 inline-flex items-center gap-2"
              >
                {pending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <UserCog className="h-4 w-4" />
                )}
                Rozpocznij sesję
              </button>
            </div>
          </div>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

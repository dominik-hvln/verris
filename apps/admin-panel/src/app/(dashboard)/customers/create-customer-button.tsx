"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { ModalPortal } from "@/components/modal-portal";
import { createCustomerAction } from "./actions";

const INPUT =
  "mt-1.5 w-full rounded-lg bg-black/60 border border-white/10 px-3 py-2 text-white text-sm focus:border-emerald-400 focus:outline-none placeholder:text-neutral-600";
const LABEL = "block text-xs font-bold uppercase tracking-widest text-neutral-500";

/** A-24 — konto zakłada operator; hasło ustawia klient z linku (72 h), regulamin akceptuje przy 1. logowaniu. */
export function CreateCustomerButton() {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ email: "", firstName: "", lastName: "", reason: "" });
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ id: string; mailSent: boolean } | null>(null);
  const [pending, startTransition] = useTransition();

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const close = () => {
    setOpen(false);
    setTimeout(() => {
      setForm({ email: "", firstName: "", lastName: "", reason: "" });
      setError(null);
      setDone(null);
    }, 200);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createCustomerAction(form);
      if (!res.ok) return setError(res.error);
      setDone({ id: res.id, mailSent: res.mailSent });
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-4 py-2 text-sm font-medium text-emerald-200 hover:bg-emerald-400/20"
      >
        <UserPlus className="h-4 w-4" /> Nowy klient
      </button>

      {open && (
        <ModalPortal>
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur p-4"
            role="presentation"
            onClick={close}
          >
            <form
              onSubmit={submit}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-6 shadow-2xl space-y-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="create-customer-title"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h3 id="create-customer-title" className="text-base font-bold text-white">
                  Załóż konto klienta
                </h3>
                <p className="mt-1 text-xs text-muted-foreground">
                  Klient dostanie mail z linkiem do ustawienia hasła (ważny 72 h). Regulamin zaakceptuje sam przy
                  pierwszym logowaniu — nie składamy zgód w jego imieniu.
                </p>
              </div>

              {done ? (
                <div className="space-y-3">
                  <div
                    className={`flex items-start gap-2 rounded-lg border p-3 text-xs ${
                      done.mailSent
                        ? "border-emerald-400/30 bg-emerald-500/10 text-emerald-200"
                        : "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    }`}
                  >
                    {done.mailSent ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                    ) : (
                      <AlertCircle className="h-4 w-4 shrink-0" />
                    )}
                    {done.mailSent
                      ? `Konto założone. Link do ustawienia hasła poszedł na ${form.email.trim().toLowerCase()}.`
                      : "Konto założone, ale mail nie wyszedł. Poproś klienta o „Nie pamiętasz hasła?” na stronie logowania."}
                  </div>
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={close}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10"
                    >
                      Zamknij
                    </button>
                    <Link
                      href={`/customers/${done.id}`}
                      className="rounded-lg bg-emerald-400/20 border border-emerald-400/40 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/30"
                    >
                      Otwórz profil
                    </Link>
                  </div>
                </div>
              ) : (
                <>
                  <label className="block">
                    <span className={LABEL}>E-mail</span>
                    <input type="email" required maxLength={254} value={form.email} onChange={set("email")} className={INPUT} />
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className={LABEL}>Imię</span>
                      <input required maxLength={100} value={form.firstName} onChange={set("firstName")} className={INPUT} />
                    </label>
                    <label className="block">
                      <span className={LABEL}>Nazwisko</span>
                      <input required maxLength={100} value={form.lastName} onChange={set("lastName")} className={INPUT} />
                    </label>
                  </div>
                  <label className="block">
                    <span className={LABEL}>Powód (do audytu)</span>
                    <input
                      maxLength={500}
                      value={form.reason}
                      onChange={set("reason")}
                      placeholder="np. zamówienie telefoniczne"
                      className={INPUT}
                    />
                  </label>

                  {error && (
                    <div className="flex items-center gap-2 rounded-lg border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-200">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {error}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={close}
                      disabled={pending}
                      className="rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10 disabled:opacity-50"
                    >
                      Anuluj
                    </button>
                    <button
                      type="submit"
                      disabled={pending}
                      className="rounded-lg bg-emerald-400/20 border border-emerald-400/40 px-4 py-2 text-sm font-bold text-emerald-100 hover:bg-emerald-400/30 disabled:opacity-50 inline-flex items-center gap-2"
                    >
                      {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                      Załóż konto
                    </button>
                  </div>
                </>
              )}
            </form>
          </div>
        </ModalPortal>
      )}
    </>
  );
}

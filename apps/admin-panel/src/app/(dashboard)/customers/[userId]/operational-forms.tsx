"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Save, KeyRound, Mail, ShieldOff } from "lucide-react";
import type { AdminCustomerOperationalDetail } from "../data";
import {
  changeCustomerEmailAction,
  forceAnonymizeCustomerAction,
  patchCustomerOperationalAction,
  resetCustomerPasswordAction,
} from "../actions";

interface Props {
  detail: AdminCustomerOperationalDetail;
}

export function CustomerOperationalForms({ detail }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [loginBlocked, setLoginBlocked] = useState(detail.loginBlocked);
  const [blockReason, setBlockReason] = useState(detail.loginBlockedReason ?? "");
  const [internalNote, setInternalNote] = useState(detail.adminInternalNote ?? "");
  const [opErr, setOpErr] = useState<string | null>(null);
  const [opOk, setOpOk] = useState(false);

  const [newEmail, setNewEmail] = useState("");
  const [emailReason, setEmailReason] = useState("");
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [emailOk, setEmailOk] = useState(false);

  const [resetNotify, setResetNotify] = useState(true);
  const [resetReason, setResetReason] = useState("");
  const [resetErr, setResetErr] = useState<string | null>(null);
  const [tempPassword, setTempPassword] = useState<string | null>(null);

  const [deleteReason, setDeleteReason] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);
  const [deleteOk, setDeleteOk] = useState(false);

  useEffect(() => {
    setLoginBlocked(detail.loginBlocked);
    setBlockReason(detail.loginBlockedReason ?? "");
    setInternalNote(detail.adminInternalNote ?? "");
  }, [detail.id, detail.loginBlocked, detail.loginBlockedReason, detail.adminInternalNote]);

  const saveOperational = () => {
    setOpErr(null);
    setOpOk(false);
    start(async () => {
      const res = await patchCustomerOperationalAction(detail.id, {
        loginBlocked,
        loginBlockedReason: blockReason.trim() || null,
        adminInternalNote: internalNote.trim() || null,
      });
      if (!res.ok) {
        setOpErr(res.error);
        return;
      }
      setOpOk(true);
      router.refresh();
    });
  };

  const submitEmail = () => {
    setEmailErr(null);
    setEmailOk(false);
    const em = newEmail.trim();
    if (!em) {
      setEmailErr("Podaj nowy adres e-mail.");
      return;
    }
    start(async () => {
      const res = await changeCustomerEmailAction(detail.id, em, emailReason.trim() || undefined);
      if (!res.ok) {
        setEmailErr(res.error);
        return;
      }
      setEmailOk(true);
      setNewEmail("");
      setEmailReason("");
      router.refresh();
    });
  };

  const submitReset = () => {
    setResetErr(null);
    setTempPassword(null);
    start(async () => {
      const res = await resetCustomerPasswordAction(
        detail.id,
        resetNotify,
        resetReason.trim() || undefined,
      );
      if (!res.ok) {
        setResetErr(res.error);
        return;
      }
      setTempPassword(res.temporaryPassword);
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white">Blokada logowania i notatka</h2>
        <p className="text-xs text-muted-foreground leading-relaxed">
          Zablokowane konto USER nie zaloguje się ani hasłem, ani po 2FA. Impersonacja z panelu nadal działa.
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={loginBlocked}
            disabled={pending}
            onChange={(e) => setLoginBlocked(e.target.checked)}
            className="rounded border-white/20"
          />
          <span className="text-sm text-white">Login zablokowany</span>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód blokady (opcjonalnie)
          </span>
          <textarea
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            disabled={pending}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Notatka wewnętrzna (nie dla klienta)
          </span>
          <textarea
            value={internalNote}
            onChange={(e) => setInternalNote(e.target.value)}
            disabled={pending}
            rows={5}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-xs text-white font-mono"
          />
        </label>
        {opErr ? <p className="text-sm text-rose-300">{opErr}</p> : null}
        {opOk ? <p className="text-sm text-emerald-300">Zapisano.</p> : null}
        <button
          type="button"
          onClick={saveOperational}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/35 bg-indigo-500/15 px-4 py-2 text-sm font-semibold text-indigo-100 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/35 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-white flex items-center gap-2">
          <Mail className="h-4 w-4 text-cyan-400" />
          Zmiana adresu e-mail
        </h2>
        <p className="text-xs text-muted-foreground">
          Adres musi być unikalny. Przy aktywnym Stripe wykonamy próbę aktualizacji klienta (best-effort).
        </p>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Nowy e-mail
          </span>
          <input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            disabled={pending}
            placeholder={detail.email}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód (audyt)
          </span>
          <input
            value={emailReason}
            onChange={(e) => setEmailReason(e.target.value)}
            disabled={pending}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        {emailErr ? <p className="text-sm text-rose-300">{emailErr}</p> : null}
        {emailOk ? <p className="text-sm text-emerald-300">E-mail został zmieniony.</p> : null}
        <button
          type="button"
          onClick={submitEmail}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-4 py-2 text-sm font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Zmień e-mail
        </button>
      </section>

      <section className="rounded-2xl border border-amber-500/25 bg-amber-500/5 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-100 flex items-center gap-2">
          <KeyRound className="h-4 w-4" />
          Reset hasła
        </h2>
        <p className="text-xs text-amber-100/80 leading-relaxed flex gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Ustawiamy losowe hasło, <strong>wyłączamy 2FA</strong> (klient musi skonfigurować ponownie). Hasło pokazujemy tylko raz —
          skopiuj je lub wyślij powiadomienie e-mail (bez hasła w treści).
        </p>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={resetNotify}
            disabled={pending}
            onChange={(e) => setResetNotify(e.target.checked)}
            className="rounded border-white/20"
          />
          <span className="text-sm text-white">Wyślij klientowi e-mail o zmianie hasła</span>
        </label>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód (audyt)
          </span>
          <input
            value={resetReason}
            onChange={(e) => setResetReason(e.target.value)}
            disabled={pending}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        {resetErr ? <p className="text-sm text-rose-300">{resetErr}</p> : null}
        {tempPassword ? (
          <div className="rounded-lg border border-white/15 bg-black/50 p-3 space-y-2">
            <p className="text-xs text-amber-200 font-bold uppercase tracking-wide">Hasło jednorazowe</p>
            <code className="block break-all text-sm text-white font-mono">{tempPassword}</code>
            <p className="text-[10px] text-muted-foreground">Ten tekst zniknie po odświeżeniu — skopiuj teraz.</p>
          </div>
        ) : null}
        <button
          type="button"
          onClick={submitReset}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/15 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-amber-400/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Wygeneruj nowe hasło
        </button>
      </section>

      <section className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-rose-100 flex items-center gap-2">
          <ShieldOff className="h-4 w-4" />
          Usunięcie konta (RODO)
        </h2>
        <p className="text-xs text-rose-100/80 leading-relaxed">
          Natychmiastowa <strong>anonimizacja</strong> danych osobowych (art. 17 RODO). Konto klienta
          przestaje działać; subskrypcje i hosting są wstrzymywane zgodnie z procedurą compliance.
          Operacja jest nieodwracalna dla danych identyfikujących.
        </p>
        <label className="block">
          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
            Powód (audyt, min. 5 znaków)
          </span>
          <textarea
            value={deleteReason}
            onChange={(e) => setDeleteReason(e.target.value)}
            disabled={pending || deleteOk}
            rows={2}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white"
          />
        </label>
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={deleteConfirm}
            disabled={pending || deleteOk}
            onChange={(e) => setDeleteConfirm(e.target.checked)}
            className="rounded border-white/20"
          />
          <span className="text-sm text-white">
            Potwierdzam trwałe usunięcie (anonimizację) konta {detail.email}
          </span>
        </label>
        {deleteErr ? <p className="text-sm text-rose-300">{deleteErr}</p> : null}
        {deleteOk ? (
          <p className="text-sm text-emerald-300">
            Konto zanonimizowane. Odśwież listę klientów — profil nie będzie już dostępny.
          </p>
        ) : null}
        <button
          type="button"
          disabled={pending || deleteOk || !deleteConfirm}
          onClick={() => {
            setDeleteErr(null);
            start(async () => {
              const res = await forceAnonymizeCustomerAction(detail.id, deleteReason);
              if (!res.ok) {
                setDeleteErr(res.error ?? "Błąd anonimizacji.");
                return;
              }
              setDeleteOk(true);
              router.refresh();
            });
          }}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/50 bg-rose-600/20 px-4 py-2 text-sm font-semibold text-rose-50 hover:bg-rose-600/35 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldOff className="h-4 w-4" />}
          Usuń konto (anonimizuj)
        </button>
      </section>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { AlertCircle, CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { inviteTesterAction } from "./actions";

/** PB-26 — zaproszenie testera: kod 150 K (1 użycie, 14 dni) + mail z instrukcją. */
export function InviteForm() {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [wynik, setWynik] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const submit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setWynik(null);
    start(async () => {
      const r = await inviteTesterAction({ email, name });
      if (!r.ok) return setWynik({ ok: false, text: r.error });
      setWynik({
        ok: true,
        text: r.mailWyslany
          ? `Zaproszenie wysłane — kod ${r.code}.`
          : `Kod ${r.code} utworzony, ale mail nie wyszedł — przekaż kod osobiście.`,
      });
      setEmail("");
      setName("");
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4 rounded-2xl border border-emerald-400/20 bg-emerald-400/[0.04] p-6">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-400/30 bg-emerald-400/10 text-emerald-200">
          <UserPlus className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-base font-bold text-white">Zaproś testera</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Imienny kod na 150 K (ok. 3 miesiące hostingu), jednorazowy, ważny 14 dni. Mail z kodem, instrukcją i listą rzeczy do sprawdzenia wychodzi od razu.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-medium text-neutral-300">
          E-mail
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="jan@firma.pl"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
        <label className="block text-xs font-medium text-neutral-300">
          Imię (w powitaniu, opcjonalnie)
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="Jan"
            className="mt-1 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-sm text-white outline-none focus:border-white/30"
          />
        </label>
      </div>
      {wynik ? (
        <p className={`flex items-center gap-2 text-sm ${wynik.ok ? "text-emerald-200" : "text-rose-200"}`}>
          {wynik.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />} {wynik.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />} Wyślij zaproszenie
      </button>
    </form>
  );
}

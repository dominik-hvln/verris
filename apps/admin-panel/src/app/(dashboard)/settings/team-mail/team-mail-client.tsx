"use client";

import { useState, useTransition } from "react";
import { Loader2, RefreshCw, Plus } from "lucide-react";
import type { ControlPlaneMailboxRow } from "./actions";
import { createTeamMailboxAction, syncPostfixMapsAction } from "./actions";

export function TeamMailClient({ initial }: { initial: ControlPlaneMailboxRow[] }) {
  const [pending, start] = useTransition();
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const create = () => {
    setErr(null);
    setCreatedPassword(null);
    start(async () => {
      const res = await createTeamMailboxAction({
        localPart,
        kind: "STAFF",
        displayName: displayName || undefined,
      });
      if (!res.ok) {
        setErr(res.error ?? "Błąd");
        return;
      }
      if (res.imapPassword && res.email) {
        setCreatedPassword({ email: res.email, password: res.imapPassword });
      }
      setLocalPart("");
      setDisplayName("");
    });
  };

  const syncMaps = () => {
    setSyncMsg(null);
    start(async () => {
      const res = await syncPostfixMapsAction();
      setSyncMsg(res.ok ? "Mapy zapisane." : res.error ?? res.message ?? "Błąd sync");
    });
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={syncMaps}
          className="inline-flex items-center gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-4 py-2 text-sm font-semibold text-sky-100"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Synchronizuj mapy Postfix
        </button>
        {syncMsg ? <p className="text-sm text-emerald-300 self-center">{syncMsg}</p> : null}
      </div>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
        <h2 className="text-sm font-bold uppercase tracking-wide text-amber-200">Nowa skrzynka STAFF</h2>
        <p className="text-xs text-muted-foreground">
          Pracownik loguje się do SOGo i klienta pocztowego tym hasłem. Powiązanie z kontem User — w kolejnym kroku z listy CRM.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 max-w-xl">
          <label className="block text-xs text-neutral-400">
            Local-part (przed @verris.pl)
            <input
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
              placeholder="jan.kowalski"
            />
          </label>
          <label className="block text-xs text-neutral-400">
            Wyświetlana nazwa
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white"
            />
          </label>
        </div>
        {err ? <p className="text-sm text-rose-300">{err}</p> : null}
        {createdPassword ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-2">
            <p className="font-semibold text-amber-100">Hasło IMAP (skopiuj teraz — nie pokażemy ponownie)</p>
            <p>
              <span className="text-neutral-400">E-mail:</span>{" "}
              <code className="text-white">{createdPassword.email}</code>
            </p>
            <p>
              <span className="text-neutral-400">Hasło:</span>{" "}
              <code className="text-white break-all">{createdPassword.password}</code>
            </p>
          </div>
        ) : null}
        <button
          type="button"
          disabled={pending || !localPart.trim()}
          onClick={create}
          className="inline-flex items-center gap-2 rounded-lg bg-white text-black px-4 py-2 text-sm font-bold"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Utwórz skrzynkę
        </button>
      </section>

      <section className="rounded-2xl border border-white/10 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Rodzaj</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">User</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => (
              <tr key={row.id} className="border-t border-white/5">
                <td className="px-4 py-3 font-mono text-cyan-300/90">{row.email}</td>
                <td className="px-4 py-3">{row.kind}</td>
                <td className="px-4 py-3">{row.status}</td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {row.user?.email ?? "—"}
                </td>
              </tr>
            ))}
            {initial.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">
                  Brak skrzynek — utwórz pierwszą powyżej.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}

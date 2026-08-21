"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, RefreshCw, Plus, KeyRound, ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import type {
  ControlPlaneMailboxDetail,
  ControlPlaneMailboxRow,
  SystemAddressRow,
} from "./actions";
import {
  addTeamMailboxAliasAction,
  addTeamMailboxForwardAction,
  createTeamMailboxAction,
  getTeamMailboxAction,
  importTeamMailboxesCsvAction,
  removeTeamMailboxAliasAction,
  removeTeamMailboxForwardAction,
  resetTeamMailboxPasswordAction,
  syncPostfixMapsAction,
  updateSystemAddressesAction,
} from "./actions";

export function TeamMailClient({
  initial,
  systemAddresses,
}: {
  initial: ControlPlaneMailboxRow[];
  systemAddresses: SystemAddressRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [localPart, setLocalPart] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<{ email: string; password: string } | null>(null);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [aliasDetail, setAliasDetail] = useState<Record<string, ControlPlaneMailboxDetail>>({});
  const [newAlias, setNewAlias] = useState<Record<string, string>>({});
  const [newForward, setNewForward] = useState<Record<string, string>>({});
  const [aliasErr, setAliasErr] = useState<string | null>(null);
  const [importCsv, setImportCsv] = useState("");
  const [importResult, setImportResult] = useState<string | null>(null);
  const [systemEdits, setSystemEdits] = useState<Record<string, string>>(() =>
    Object.fromEntries(systemAddresses.map((a) => [a.role, a.email])),
  );
  const [systemErr, setSystemErr] = useState<string | null>(null);
  const [systemOk, setSystemOk] = useState<string | null>(null);

  const roleToField: Record<string, string> = {
    NOREPLY: "noreply",
    SUPPORT: "support",
    SECURITY: "security",
    RODO: "rodo",
    BILLING: "billing",
    DMARC_RUA: "dmarcRua",
    PANEL: "panel",
  };

  const toggleAliases = (id: string) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    setExpandedId(id);
    setAliasErr(null);
    if (!aliasDetail[id]) {
      start(async () => {
        const d = await getTeamMailboxAction(id);
        setAliasDetail((prev) => ({ ...prev, [id]: d }));
      });
    }
  };

  const addAlias = (mailboxId: string) => {
    const raw = newAlias[mailboxId]?.trim();
    if (!raw) return;
    setAliasErr(null);
    start(async () => {
      const res = await addTeamMailboxAliasAction(mailboxId, raw);
      if (!res.ok) {
        setAliasErr(res.error ?? "Błąd");
        return;
      }
      setNewAlias((prev) => ({ ...prev, [mailboxId]: "" }));
      const d = await getTeamMailboxAction(mailboxId);
      setAliasDetail((prev) => ({ ...prev, [mailboxId]: d }));
      router.refresh();
    });
  };

  const addForward = (mailboxId: string) => {
    const raw = newForward[mailboxId]?.trim();
    if (!raw) return;
    setAliasErr(null);
    start(async () => {
      const res = await addTeamMailboxForwardAction(mailboxId, raw, true);
      if (!res.ok) {
        setAliasErr(res.error ?? "Błąd");
        return;
      }
      setNewForward((prev) => ({ ...prev, [mailboxId]: "" }));
      const d = await getTeamMailboxAction(mailboxId);
      setAliasDetail((prev) => ({ ...prev, [mailboxId]: d }));
      setAliasErr(res.message ?? "Wysłano mail potwierdzający.");
      router.refresh();
    });
  };

  const removeForward = (mailboxId: string, forwardId: string) => {
    setAliasErr(null);
    start(async () => {
      const res = await removeTeamMailboxForwardAction(forwardId);
      if (!res.ok) {
        setAliasErr(res.error ?? "Błąd");
        return;
      }
      const d = await getTeamMailboxAction(mailboxId);
      setAliasDetail((prev) => ({ ...prev, [mailboxId]: d }));
      router.refresh();
    });
  };

  const runImport = (dryRun: boolean) => {
    setImportResult(null);
    setAliasErr(null);
    start(async () => {
      const res = await importTeamMailboxesCsvAction(importCsv, dryRun);
      if (!res.ok) {
        setAliasErr(res.error ?? "Błąd importu");
        return;
      }
      const r = res.result!;
      setImportResult(
        `${dryRun ? "Podgląd" : "Import"}: ${r.created} do utworzenia / utworzono, ${r.rows.length} wierszy.`,
      );
      if (!dryRun) {
        setImportCsv("");
        router.refresh();
      }
    });
  };

  const removeAlias = (mailboxId: string, aliasId: string) => {
    setAliasErr(null);
    start(async () => {
      const res = await removeTeamMailboxAliasAction(aliasId);
      if (!res.ok) {
        setAliasErr(res.error ?? "Błąd");
        return;
      }
      const d = await getTeamMailboxAction(mailboxId);
      setAliasDetail((prev) => ({ ...prev, [mailboxId]: d }));
      router.refresh();
    });
  };

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
      router.refresh();
    });
  };

  const resetPassword = (id: string) => {
    setErr(null);
    setCreatedPassword(null);
    start(async () => {
      const res = await resetTeamMailboxPasswordAction(id);
      if (!res.ok) {
        setErr(res.error ?? "Błąd");
        return;
      }
      if (res.imapPassword && res.email) {
        setCreatedPassword({ email: res.email, password: res.imapPassword });
      }
      router.refresh();
    });
  };

  const syncMaps = () => {
    setSyncMsg(null);
    start(async () => {
      const res = await syncPostfixMapsAction();
      setSyncMsg(res.ok ? res.message ?? "Mapy zapisane." : res.error ?? res.message ?? "Błąd sync");
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
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm space-y-2" role="status">
            <p className="font-semibold text-amber-100">
              Nowe hasło IMAP — skopiuj teraz (nie pokażemy ponownie)
            </p>
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

      <section className="rounded-2xl border border-white/10 overflow-hidden space-y-0">
        <p className="border-b border-white/5 bg-white/[0.02] px-4 py-2 text-xs text-muted-foreground">
          Dla skrzynek STAFF: <strong className="text-neutral-300">Generuj hasło IMAP</strong>,{" "}
          <strong className="text-neutral-300">aliasy</strong> tylko{" "}
          <code className="text-neutral-400">*@verris.pl</code>,{" "}
          <strong className="text-neutral-300">forwardy</strong> na Gmail/inne (link potwierdzający). Sync zapisuje
          pliki — na hoście potrzebny jeszcze <code className="text-neutral-400">postmap</code>.
        </p>
        {aliasErr ? (
          <p className="border-b border-white/5 px-4 py-2 text-sm text-rose-300">{aliasErr}</p>
        ) : null}
        <table className="w-full text-sm">
          <thead className="bg-white/5 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-3 w-8" />
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Rodzaj</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Aliasy</th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Akcje</th>
            </tr>
          </thead>
          <tbody>
            {initial.map((row) => {
              const open = expandedId === row.id;
              const detail = aliasDetail[row.id];
              return (
                <>
                  <tr key={row.id} className="border-t border-white/5">
                    <td className="px-2 py-3">
                      <button
                        type="button"
                        aria-expanded={open}
                        onClick={() => toggleAliases(row.id)}
                        className="rounded p-1 text-neutral-400 hover:bg-white/5"
                      >
                        {open ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </button>
                    </td>
                    <td className="px-4 py-3 font-mono text-cyan-300/90">{row.email}</td>
                    <td className="px-4 py-3">{row.kind}</td>
                    <td className="px-4 py-3">{row.status}</td>
                    <td className="px-4 py-3 text-muted-foreground">{row._count.aliases}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {row.user?.email ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      {row.kind === "STAFF" && row.status === "ACTIVE" ? (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => resetPassword(row.id)}
                          className="inline-flex items-center gap-1 rounded border border-white/15 px-2 py-1 text-xs text-neutral-200 hover:bg-white/5"
                        >
                          <KeyRound className="h-3 w-3" />
                          Generuj hasło IMAP
                        </button>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                  {open ? (
                    <tr key={`${row.id}-aliases`} className="border-t border-white/5 bg-white/[0.02]">
                      <td colSpan={7} className="px-6 py-4 space-y-3">
                        {!detail ? (
                          <p className="text-xs text-muted-foreground flex items-center gap-2">
                            <Loader2 className="h-3 w-3 animate-spin" /> Ładowanie aliasów…
                          </p>
                        ) : (
                          <>
                            <ul className="space-y-1">
                              {detail.aliases.length === 0 ? (
                                <li className="text-xs text-muted-foreground">Brak aliasów</li>
                              ) : (
                                detail.aliases.map((a) => (
                                  <li
                                    key={a.id}
                                    className="flex items-center justify-between gap-2 font-mono text-xs text-neutral-300"
                                  >
                                    {a.aliasEmail} → {row.email}
                                    <button
                                      type="button"
                                      disabled={pending}
                                      onClick={() => removeAlias(row.id, a.id)}
                                      className="text-rose-400 hover:text-rose-300"
                                      aria-label={`Usuń alias ${a.aliasEmail}`}
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </li>
                                ))
                              )}
                            </ul>
                            <div className="flex flex-wrap gap-2 max-w-lg">
                              <input
                                value={newAlias[row.id] ?? ""}
                                onChange={(e) =>
                                  setNewAlias((prev) => ({ ...prev, [row.id]: e.target.value }))
                                }
                                placeholder="help@verris.pl"
                                className="flex-1 min-w-[12rem] rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white"
                              />
                              <button
                                type="button"
                                disabled={pending || !(newAlias[row.id]?.trim())}
                                onClick={() => addAlias(row.id)}
                                className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/5"
                              >
                                Dodaj alias
                              </button>
                            </div>
                            <div className="border-t border-white/10 pt-3 space-y-2">
                              <p className="text-xs font-semibold text-neutral-400 uppercase">
                                Przekierowania (forward)
                              </p>
                              <ul className="space-y-1">
                                {detail.forwards.length === 0 ? (
                                  <li className="text-xs text-muted-foreground">Brak forwardów</li>
                                ) : (
                                  detail.forwards.map((f) => (
                                    <li
                                      key={f.id}
                                      className="flex items-center justify-between gap-2 font-mono text-xs text-neutral-300"
                                    >
                                      <span>
                                        → {f.forwardTo}
                                        {f.confirmedAt ? (
                                          <span className="text-emerald-400 ml-2">aktywny</span>
                                        ) : (
                                          <span className="text-amber-400 ml-2">oczekuje potwierdzenia</span>
                                        )}
                                      </span>
                                      <button
                                        type="button"
                                        disabled={pending}
                                        onClick={() => removeForward(row.id, f.id)}
                                        className="text-rose-400 hover:text-rose-300"
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </li>
                                  ))
                                )}
                              </ul>
                              <div className="flex flex-wrap gap-2 max-w-lg">
                                <input
                                  value={newForward[row.id] ?? ""}
                                  onChange={(e) =>
                                    setNewForward((prev) => ({ ...prev, [row.id]: e.target.value }))
                                  }
                                  placeholder="osoba@gmail.com"
                                  className="flex-1 min-w-[12rem] rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 text-xs text-white"
                                />
                                <button
                                  type="button"
                                  disabled={pending || !(newForward[row.id]?.trim())}
                                  onClick={() => addForward(row.id)}
                                  className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/5"
                                >
                                  Dodaj forward
                                </button>
                              </div>
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </>
              );
            })}
            {initial.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">
                  Brak skrzynek — utwórz pierwszą powyżej.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-violet-200">
          Import OVH (CSV)
        </h2>
        <p className="text-xs text-muted-foreground">
          Format: <code className="text-neutral-400">email@verris.pl</code> lub{" "}
          <code className="text-neutral-400">email@verris.pl;forward@gmail.com</code> — najpierw podgląd.
        </p>
        <textarea
          value={importCsv}
          onChange={(e) => setImportCsv(e.target.value)}
          rows={5}
          placeholder="jan.kowalski@verris.pl&#10;anna@verris.pl;anna.priv@gmail.com"
          className="w-full max-w-2xl rounded-lg border border-white/10 bg-black/50 px-3 py-2 font-mono text-xs text-white"
        />
        {importResult ? <p className="text-xs text-emerald-300">{importResult}</p> : null}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending || !importCsv.trim()}
            onClick={() => runImport(true)}
            className="rounded-lg border border-white/15 px-4 py-2 text-xs font-semibold text-white hover:bg-white/5"
          >
            Podgląd (dry-run)
          </button>
          <button
            type="button"
            disabled={pending || !importCsv.trim()}
            onClick={() => runImport(false)}
            className="rounded-lg bg-violet-600/90 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-600"
          >
            Importuj
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-3">
        <h2 className="text-sm font-bold uppercase tracking-wide text-emerald-200">
          Adresy systemowe (transakcyjne)
        </h2>
        <p className="text-xs text-muted-foreground">
          Nadawca w mailach API (`fromRole`: faktury → NOREPLY, bezpieczeństwo → SECURITY). Tylko adresy @verris.pl.
        </p>
        {systemErr ? <p className="text-xs text-red-400">{systemErr}</p> : null}
        {systemOk ? <p className="text-xs text-emerald-400">{systemOk}</p> : null}
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="pb-2 pr-4">Rola</th>
              <th className="pb-2">E-mail</th>
            </tr>
          </thead>
          <tbody>
            {systemAddresses.map((a) => (
              <tr key={a.role} className="border-t border-white/5">
                <td className="py-2 pr-4 font-mono text-xs text-neutral-400">{a.role}</td>
                <td className="py-2">
                  <input
                    type="email"
                    value={systemEdits[a.role] ?? a.email}
                    onChange={(e) =>
                      setSystemEdits((prev) => ({ ...prev, [a.role]: e.target.value }))
                    }
                    className="w-full max-w-md rounded-lg border border-white/10 bg-black/50 px-3 py-1.5 font-mono text-xs text-emerald-300/90"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setSystemErr(null);
            setSystemOk(null);
            const body: Record<string, string> = {};
            for (const a of systemAddresses) {
              const field = roleToField[a.role];
              if (!field) continue;
              const val = systemEdits[a.role]?.trim().toLowerCase();
              if (val && val !== a.email) body[field] = val;
            }
            if (Object.keys(body).length === 0) {
              setSystemOk("Brak zmian do zapisania.");
              return;
            }
            start(async () => {
              const res = await updateSystemAddressesAction(body);
              if (!res.ok) {
                setSystemErr(res.error ?? "Błąd");
                return;
              }
              setSystemOk("Zapisano adresy systemowe.");
              router.refresh();
            });
          }}
          className="rounded-lg bg-emerald-600/90 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          Zapisz adresy systemowe
        </button>
      </section>
    </div>
  );
}

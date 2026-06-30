"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, ShieldCheck, Loader2, X } from "lucide-react";
import {
  createRole,
  updateRole,
  deleteRole,
  assignOperatorRole,
  createOperator,
  setOperatorActive,
  type PermItem,
  type RoleRow,
  type OperatorRow,
  type ActivityRow,
} from "./actions";

type Editing = { id: string | null; name: string; description: string; permissions: Set<string> } | null;

export function RolesClient({
  catalog,
  initialRoles,
  initialOperators,
  initialActivity = [],
}: {
  catalog: PermItem[];
  initialRoles: RoleRow[];
  initialOperators: OperatorRow[];
  initialActivity?: ActivityRow[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState<string | null>(null);
  const [opEmail, setOpEmail] = useState("");
  const [opFirst, setOpFirst] = useState("");
  const [opLast, setOpLast] = useState("");
  const [opRoleId, setOpRoleId] = useState("");

  const areas = useMemo(() => {
    const map = new Map<string, PermItem[]>();
    for (const p of catalog) {
      if (!map.has(p.area)) map.set(p.area, []);
      map.get(p.area)!.push(p);
    }
    return Array.from(map.entries());
  }, [catalog]);

  const startNew = () => setEditing({ id: null, name: "", description: "", permissions: new Set() });
  const startEdit = (r: RoleRow) =>
    setEditing({ id: r.id, name: r.name, description: r.description ?? "", permissions: new Set(r.permissions) });

  const toggle = (key: string) =>
    setEditing((e) => {
      if (!e) return e;
      const next = new Set(e.permissions);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...e, permissions: next };
    });

  const save = () => {
    if (!editing) return;
    setErr(null);
    const payload = { name: editing.name.trim(), description: editing.description.trim(), permissions: Array.from(editing.permissions) };
    start(async () => {
      const res = editing.id ? await updateRole(editing.id, payload) : await createRole(payload);
      if (!res.ok) { setErr(res.error); return; }
      setEditing(null);
      router.refresh();
    });
  };

  const remove = (r: RoleRow) => {
    if (!window.confirm(`Usunąć rolę „${r.name}"?`)) return;
    setErr(null);
    start(async () => {
      const res = await deleteRole(r.id);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  };

  const assign = (userId: string, roleId: string) => {
    setErr(null);
    start(async () => {
      const res = await assignOperatorRole(userId, roleId || null);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  };

  const addOperator = () => {
    if (!opEmail.trim()) { setErr("Podaj e-mail operatora."); return; }
    setErr(null);
    start(async () => {
      const res = await createOperator({ email: opEmail.trim(), firstName: opFirst.trim() || undefined, lastName: opLast.trim() || undefined, roleId: opRoleId || null });
      if (!res.ok) { setErr(res.error); return; }
      setOpEmail(""); setOpFirst(""); setOpLast(""); setOpRoleId("");
      router.refresh();
    });
  };

  const toggleActive = (o: OperatorRow) => {
    setErr(null);
    start(async () => {
      const res = await setOperatorActive(o.id, Boolean(o.loginBlocked));
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  };

  return (
    <div className="space-y-8">
      {err && <p className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{err}</p>}

      <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        {/* Lista ról */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-widest text-neutral-400">Działy / role</h2>
            <button onClick={startNew} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500/20 border border-indigo-500/30 px-3 py-1.5 text-sm font-medium text-indigo-300 hover:bg-indigo-500/30">
              <Plus className="h-4 w-4" /> Nowa rola
            </button>
          </div>
          {initialRoles.length === 0 ? (
            <p className="text-sm text-neutral-500">Brak ról. Dodaj pierwszą.</p>
          ) : (
            initialRoles.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-semibold text-white">
                      <ShieldCheck className="h-4 w-4 text-indigo-400" /> {r.name}
                      {r.isSystem && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-neutral-400">systemowa</span>}
                    </p>
                    {r.description && <p className="mt-0.5 text-xs text-neutral-400">{r.description}</p>}
                    <p className="mt-1 text-[11px] text-neutral-500">{r.permissions.length} uprawnień · {r.memberCount} operator(ów)</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button onClick={() => startEdit(r)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:text-white">Edytuj</button>
                    {!r.isSystem && (
                      <button onClick={() => remove(r)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-rose-300 hover:bg-rose-500/10" title="Usuń">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </section>

        {/* Edytor */}
        <section>
          {editing ? (
            <div className="rounded-xl border border-indigo-500/25 bg-indigo-500/[0.04] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-sm font-bold text-white">{editing.id ? "Edycja roli" : "Nowa rola"}</h2>
                <button onClick={() => setEditing(null)} className="text-neutral-400 hover:text-white"><X className="h-4 w-4" /></button>
              </div>
              <div className="space-y-2">
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Nazwa roli (np. Wsparcie L2)" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} placeholder="Opis (opcjonalnie)" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
              <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto pr-1">
                {areas.map(([area, perms]) => (
                  <div key={area}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">{area}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {perms.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-neutral-200">
                          <input type="checkbox" checked={editing.permissions.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-4 w-4 accent-indigo-500" />
                          <span>{p.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex justify-end">
                <button onClick={save} disabled={pending || !editing.name.trim()} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">
                  {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz rolę
                </button>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[200px] items-center justify-center rounded-xl border border-dashed border-white/10 text-sm text-neutral-500">
              Wybierz rolę do edycji lub dodaj nową.
            </div>
          )}
        </section>
      </div>

      {/* Mój zespół — dodawanie operatora */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-neutral-400">Mój zespół — dodaj operatora</h2>
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <div className="grid gap-2 sm:grid-cols-[1.4fr_1fr_1fr_1fr_auto]">
            <input value={opEmail} onChange={(e) => setOpEmail(e.target.value)} placeholder="e-mail operatora" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
            <input value={opFirst} onChange={(e) => setOpFirst(e.target.value)} placeholder="imię" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
            <input value={opLast} onChange={(e) => setOpLast(e.target.value)} placeholder="nazwisko" className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
            <select value={opRoleId} onChange={(e) => setOpRoleId(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white">
              <option value="">— dział (rola) —</option>
              {initialRoles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
            <button onClick={addOperator} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-400 disabled:opacity-40">
              <Plus className="h-4 w-4" /> Dodaj
            </button>
          </div>
          <p className="mt-2 text-[11px] text-neutral-500">Tworzy konto operatora (STAFF) i wysyła e-mail z hasłem tymczasowym. Pierwsze logowanie wymusi ustawienie klucza dostępu (passkey).</p>
        </div>
      </section>

      {/* Przypisanie operatorów */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-neutral-400">Operatorzy i ich role</h2>
        <div className="overflow-hidden rounded-xl border border-white/10">
          {initialOperators.map((o) => (
            <div key={o.id} className="flex items-center justify-between gap-3 border-b border-white/5 px-4 py-2.5 last:border-0">
              <div className="min-w-0">
                <p className="truncate text-sm text-white">{[o.firstName, o.lastName].filter(Boolean).join(" ") || o.email}</p>
                <p className="truncate text-[11px] text-neutral-500">{o.email} · {o.role}</p>
              </div>
              {o.role === "ADMIN" ? (
                <span className="rounded bg-emerald-500/15 px-2 py-1 text-xs text-emerald-300">Pełny dostęp</span>
              ) : (
                <div className="flex items-center gap-2">
                  {o.loginBlocked ? (
                    <span className="rounded bg-rose-500/15 px-2 py-1 text-[11px] text-rose-300">Wyłączony</span>
                  ) : (
                    <span className="rounded bg-emerald-500/15 px-2 py-1 text-[11px] text-emerald-300">Aktywny</span>
                  )}
                  <select
                    value={o.staffRoleId ?? ""}
                    onChange={(e) => assign(o.id, e.target.value)}
                    disabled={pending || o.loginBlocked}
                    className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white disabled:opacity-50"
                  >
                    <option value="">— brak roli (brak dostępu) —</option>
                    {initialRoles.map((r) => (
                      <option key={r.id} value={r.id}>{r.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => toggleActive(o)}
                    disabled={pending}
                    className={`rounded-md border px-2 py-1.5 text-xs ${o.loginBlocked ? "border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/10" : "border-rose-500/30 text-rose-300 hover:bg-rose-500/10"}`}
                  >
                    {o.loginBlocked ? "Aktywuj" : "Wyłącz"}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Dziennik aktywności operatorów */}
      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-neutral-400">Dziennik aktywności operatorów</h2>
        {initialActivity.length === 0 ? (
          <p className="text-sm text-neutral-500">Brak zarejestrowanych działań.</p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <div className="grid grid-cols-[150px_1fr_1fr] gap-2 border-b border-white/10 bg-white/[0.03] px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
              <span>Kiedy</span><span>Operator → akcja</span><span>Cel / IP</span>
            </div>
            <div className="max-h-[420px] overflow-auto">
              {initialActivity.map((a) => (
                <div key={a.id} className="grid grid-cols-[150px_1fr_1fr] gap-2 border-b border-white/5 px-4 py-2 text-sm last:border-0">
                  <span className="text-neutral-400">{new Date(a.createdAt).toLocaleString("pl-PL")}</span>
                  <span className="min-w-0">
                    <span className="text-white">{a.actor ?? "—"}</span>
                    <span className="text-neutral-500"> · </span>
                    <span className="font-mono text-[12px] text-indigo-300">{a.action}</span>
                  </span>
                  <span className="min-w-0 truncate text-neutral-400">{a.target ?? ""}{a.ip ? ` · ${a.ip}` : ""}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        <p className="mt-2 text-[11px] text-neutral-500">Ostatnie działania wykonane przez operatorów (pełny audyt z filtrami i eksportem CSV jest w „Logi bezpieczeństwa").</p>
      </section>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Save, Trash2, ShieldCheck, Loader2, X } from "lucide-react";
import {
  createRole,
  updateRole,
  deleteRole,
  cloneRole,
  type PermItem,
  type RoleRow,
} from "./actions";
import { potwierdz } from "@/components/potwierdz";
import { Checkbox } from '@/components/checkbox';
import { plForm } from "@/lib/pl";

type Editing = { id: string | null; name: string; description: string; permissions: Set<string> } | null;

/** Definicja ról (uprawnienia). Operatorzy, ich role i blokada — na /operators i karcie operatora (10.10). */
export function RolesClient({ catalog, initialRoles }: { catalog: PermItem[]; initialRoles: RoleRow[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [editing, setEditing] = useState<Editing>(null);
  const [err, setErr] = useState<string | null>(null);

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

  const remove = async (r: RoleRow) => {
    if (!(await potwierdz(`Usunąć rolę „${r.name}"?`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    setErr(null);
    start(async () => {
      const res = await deleteRole(r.id);
      if (!res.ok) { setErr(res.error); return; }
      router.refresh();
    });
  };

  // PB-47 — rola systemowa jest stała: zmiany na kopii (rola własna).
  const clone = (r: RoleRow) => {
    setErr(null);
    start(async () => {
      const res = await cloneRole(r.id);
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
                    <p className="mt-1 text-[11px] text-neutral-500">{r.permissions.length} {plForm(r.permissions.length, "uprawnienie", "uprawnienia", "uprawnień")} · {r.memberCount}{" "}
                      {plForm(r.memberCount, "operator", "operatorzy", "operatorów")}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {r.isSystem ? (
                      <button onClick={() => clone(r)} disabled={pending} title="Rola systemowa jest stała — powstanie edytowalna kopia" className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50">Sklonuj</button>
                    ) : (
                      <button onClick={() => startEdit(r)} className="rounded-md border border-white/10 px-2 py-1 text-xs text-neutral-200 hover:text-white">Edytuj</button>
                    )}
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
                <input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} aria-label="Nazwa roli" placeholder="Nazwa roli (np. Wsparcie L2)" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
                <input value={editing.description} onChange={(e) => setEditing({ ...editing, description: e.target.value })} aria-label="Opis roli" placeholder="Opis (opcjonalnie)" className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-white" />
              </div>
              <div className="mt-4 space-y-4 max-h-[50vh] overflow-auto pr-1">
                {areas.map(([area, perms]) => (
                  <div key={area}>
                    <p className="mb-1.5 text-[11px] font-bold uppercase tracking-widest text-neutral-500">{area}</p>
                    <div className="grid gap-1.5 sm:grid-cols-2">
                      {perms.map((p) => (
                        <label key={p.key} className="flex items-start gap-2 rounded-lg border border-white/10 bg-black/30 px-2.5 py-1.5 text-sm text-neutral-200">
                          <Checkbox checked={editing.permissions.has(p.key)} onChange={() => toggle(p.key)} className="mt-0.5 h-4 w-4 accent-indigo-500" />
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

      <p className="text-sm text-muted-foreground">
        Operatorów, ich role i blokadę zmienisz w{" "}
        <Link href="/operators" className="font-semibold text-foreground underline-offset-2 hover:underline">
          Zespół → Operatorzy
        </Link>
        .
      </p>
    </div>
  );
}

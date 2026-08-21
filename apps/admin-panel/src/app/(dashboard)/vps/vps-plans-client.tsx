"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, EyeOff, Loader2, Pencil, Plus, Server, X } from "lucide-react";
import {
  createVpsPlan,
  disableVpsPlan,
  updateVpsPlan,
  type HetznerServerType,
  type VpsPlanInput,
  type VpsPlanRow,
} from "./actions";

const LOCATIONS = ["nbg1", "fsn1", "hel1", "ash", "hil"];
const IMAGES = ["ubuntu-24.04", "ubuntu-22.04", "debian-12", "rocky-9", "fedora-40"];

const EMPTY: VpsPlanInput = {
  slug: "",
  name: "",
  description: "",
  hetznerServerType: "cx22",
  hetznerImage: "ubuntu-24.04",
  location: "nbg1",
  vcpu: 2,
  ramGb: 4,
  diskGb: 40,
  trafficTb: 20,
  priceMonthly: 0,
  currency: "PLN",
  isPublic: true,
  isActive: true,
  sortOrder: 0,
};

export function VpsPlansClient({
  available,
  plans,
  serverTypes,
}: {
  available: boolean;
  plans: VpsPlanRow[];
  serverTypes: HetznerServerType[];
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<VpsPlanRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onDisable = (id: string) =>
    startTransition(async () => {
      const res = await disableVpsPlan(id);
      if (!res.ok) setError(res.error);
      else router.refresh();
    });

  const onSubmit = (input: VpsPlanInput, id?: string) =>
    startTransition(async () => {
      setError(null);
      const res = id ? await updateVpsPlan(id, input) : await createVpsPlan(input);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setCreating(false);
      setEditing(null);
      router.refresh();
    });

  return (
    <div className="space-y-5">
      {!available ? (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Brak <code className="font-mono">HETZNER_API_TOKEN</code> — plany można konfigurować, ale provisioning VPS jest nieczynny do czasu ustawienia tokena.
        </div>
      ) : null}

      <div className="flex items-center justify-between">
        <p className="text-sm text-neutral-400">{plans.length} plan(ów) VPS</p>
        {!creating && !editing ? (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-violet-600"
          >
            <Plus className="h-4 w-4" /> Nowy plan VPS
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>
      ) : null}

      {creating ? (
        <PlanForm serverTypes={serverTypes} pending={pending} onCancel={() => setCreating(false)} onSubmit={(i) => onSubmit(i)} />
      ) : null}

      <div className="space-y-2">
        {plans.map((p) =>
          editing?.id === p.id ? (
            <PlanForm
              key={p.id}
              serverTypes={serverTypes}
              initial={p}
              pending={pending}
              onCancel={() => setEditing(null)}
              onSubmit={(i) => onSubmit(i, p.id)}
            />
          ) : (
            <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4">
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-10 w-10 shrink-0 rounded-lg bg-violet-500/15 border border-violet-500/30 flex items-center justify-center text-violet-300">
                  <Server className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-white truncate">{p.name}</span>
                    {!p.isActive || !p.isPublic ? (
                      <span className="text-[10px] uppercase tracking-wider text-amber-300">ukryty</span>
                    ) : null}
                  </div>
                  <p className="text-xs text-neutral-400">
                    {p.hetznerServerType} · {p.vcpu} vCPU · {p.ramGb} GB · {p.diskGb} GB · {p.location} ·{" "}
                    <span className="text-neutral-200">{p.priceMonthly} {p.currency}/mies.</span>
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button type="button" onClick={() => { setEditing(p); setCreating(false); }} className="p-2 rounded-lg border border-white/10 hover:bg-white/5" title="Edytuj">
                  <Pencil className="h-3.5 w-3.5 text-neutral-300" />
                </button>
                <button type="button" onClick={() => onDisable(p.id)} disabled={pending} className="p-2 rounded-lg border border-white/10 hover:bg-amber-500/10 hover:border-amber-500/40 disabled:opacity-50" title="Wyłącz (ukryj)">
                  <EyeOff className="h-3.5 w-3.5 text-amber-300" />
                </button>
              </div>
            </div>
          ),
        )}
        {plans.length === 0 && !creating ? (
          <p className="text-sm text-neutral-400">Brak planów — dodaj pierwszy, aby klienci mogli zamawiać VPS.</p>
        ) : null}
      </div>
    </div>
  );
}

function PlanForm({
  initial,
  serverTypes,
  pending,
  onCancel,
  onSubmit,
}: {
  initial?: VpsPlanRow;
  serverTypes: HetznerServerType[];
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: VpsPlanInput) => void;
}) {
  const [f, setF] = useState<VpsPlanInput>(
    initial
      ? {
          slug: initial.slug,
          name: initial.name,
          description: initial.description ?? "",
          hetznerServerType: initial.hetznerServerType,
          hetznerImage: initial.hetznerImage,
          location: initial.location,
          vcpu: initial.vcpu,
          ramGb: initial.ramGb,
          diskGb: initial.diskGb,
          trafficTb: initial.trafficTb,
          priceMonthly: Number(initial.priceMonthly),
          currency: initial.currency,
          isPublic: initial.isPublic,
          isActive: initial.isActive,
          sortOrder: initial.sortOrder,
        }
      : EMPTY,
  );
  const set = <K extends keyof VpsPlanInput>(k: K, v: VpsPlanInput[K]) => setF((p) => ({ ...p, [k]: v }));

  // Auto-fill specs from the Hetzner catalogue when a type is picked.
  const applyType = (name: string) => {
    const t = serverTypes.find((s) => s.name === name);
    setF((p) => ({
      ...p,
      hetznerServerType: name,
      vcpu: t?.cores ?? p.vcpu,
      ramGb: t?.memory ? Math.round(t.memory) : p.ramGb,
      diskGb: t?.disk ?? p.diskGb,
    }));
  };

  return (
    <div className="rounded-xl border border-violet-400/25 bg-violet-400/[0.04] p-4 space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Field label="Slug"><input className="ip" value={f.slug} onChange={(e) => set("slug", e.target.value)} placeholder="vps-2" /></Field>
        <Field label="Nazwa"><input className="ip" value={f.name} onChange={(e) => set("name", e.target.value)} placeholder="VPS 2" /></Field>
        <Field label="Typ Hetzner">
          {serverTypes.length ? (
            <select className="ip" value={f.hetznerServerType} onChange={(e) => applyType(e.target.value)}>
              {serverTypes.map((t) => (
                <option key={t.name} value={t.name}>{t.name} ({t.cores}c/{Math.round(t.memory)}G/{t.disk}G)</option>
              ))}
            </select>
          ) : (
            <input className="ip" value={f.hetznerServerType} onChange={(e) => set("hetznerServerType", e.target.value)} placeholder="cx22" />
          )}
        </Field>
        <Field label="Lokalizacja">
          <select className="ip" value={f.location} onChange={(e) => set("location", e.target.value)}>
            {LOCATIONS.map((l) => <option key={l} value={l}>{l}</option>)}
          </select>
        </Field>
        <Field label="Obraz">
          <select className="ip" value={f.hetznerImage} onChange={(e) => set("hetznerImage", e.target.value)}>
            {IMAGES.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
        </Field>
        <Field label="vCPU"><input type="number" className="ip" value={f.vcpu} onChange={(e) => set("vcpu", Number(e.target.value))} /></Field>
        <Field label="RAM (GB)"><input type="number" className="ip" value={f.ramGb} onChange={(e) => set("ramGb", Number(e.target.value))} /></Field>
        <Field label="Dysk (GB)"><input type="number" className="ip" value={f.diskGb} onChange={(e) => set("diskGb", Number(e.target.value))} /></Field>
        <Field label="Transfer (TB)"><input type="number" className="ip" value={f.trafficTb} onChange={(e) => set("trafficTb", Number(e.target.value))} /></Field>
        <Field label="Cena/mies."><input type="number" step="0.01" className="ip" value={f.priceMonthly} onChange={(e) => set("priceMonthly", Number(e.target.value))} /></Field>
        <Field label="Sort"><input type="number" className="ip" value={f.sortOrder} onChange={(e) => set("sortOrder", Number(e.target.value))} /></Field>
        <Field label="Publiczny">
          <select className="ip" value={f.isPublic ? "1" : "0"} onChange={(e) => set("isPublic", e.target.value === "1")}>
            <option value="1">Tak</option>
            <option value="0">Nie</option>
          </select>
        </Field>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => onSubmit(f)} disabled={pending || !f.slug || !f.name} className="inline-flex items-center gap-1.5 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-600 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} {initial ? "Zapisz" : "Utwórz plan"}
        </button>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1.5 rounded-lg border border-white/15 px-3 py-2 text-sm text-neutral-300 hover:bg-white/5">
          <X className="h-4 w-4" /> Anuluj
        </button>
      </div>
      <style>{`.ip{width:100%;border-radius:.5rem;background:rgb(0 0 0/.4);border:1px solid rgb(255 255 255/.1);padding:.4rem .6rem;font-size:.8rem;color:#fff;outline:none}.ip:focus{border-color:rgb(139 92 246/.6)}`}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1 block">
      <span className="text-[10px] uppercase tracking-wider text-neutral-500">{label}</span>
      {children}
    </label>
  );
}

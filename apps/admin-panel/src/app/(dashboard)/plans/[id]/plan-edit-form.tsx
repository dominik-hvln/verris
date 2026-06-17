"use client";

import { useState, useTransition } from "react";
import {
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Trash2,
  Save,
  RefreshCw,
} from "lucide-react";
import {
  updatePlanAction,
  validateStripePriceAction,
  deactivatePlanAction,
  syncPlanStripeAction,
} from "../actions";
import type { AdminPlanRow } from "../data";

interface FormState {
  name: string;
  description: string;
  cpuLimit: string;
  ramLimitMb: string;
  diskLimitMb: string;
  ioLimitKbps: string;
  iopsLimit: string;
  entryProcesses: string;
  nprocLimit: string;
  includedTransferGb: string;
  priceMonthly: string;
  priceYearly: string;
  isPublic: boolean;
  isActive: boolean;
  sortOrder: string;
  trialDays: string;
  supportSlaHours: string;
  productKind: "HOSTING" | "EMAIL";
  stripePriceMonthlyId: string;
  stripePriceYearlyId: string;
  autoscalingMaxOverscaleCpu: string;
  autoscalingMaxOverscaleRam: string;
  autoscalingMaxOverscaleDisk: string;
}

function toFormState(plan: AdminPlanRow): FormState {
  return {
    name: plan.name,
    description: plan.description ?? "",
    cpuLimit: String(plan.cpuLimit),
    ramLimitMb: String(plan.ramLimitMb),
    diskLimitMb: String(plan.diskLimitMb),
    ioLimitKbps: String(plan.ioLimitKbps),
    iopsLimit: String(plan.iopsLimit),
    entryProcesses: String(plan.entryProcesses),
    nprocLimit: String(plan.nprocLimit),
    includedTransferGb: plan.includedTransferGb != null ? String(plan.includedTransferGb) : "",
    priceMonthly: plan.priceMonthly,
    priceYearly: plan.priceYearly,
    isPublic: plan.isPublic,
    isActive: plan.isActive,
    sortOrder: String(plan.sortOrder),
    trialDays: String(plan.trialDays ?? 0),
    supportSlaHours: String(plan.supportSlaHours ?? 0),
    productKind: (plan.productKind ?? "HOSTING") as "HOSTING" | "EMAIL",
    stripePriceMonthlyId: plan.stripePriceMonthlyId ?? "",
    stripePriceYearlyId: plan.stripePriceYearlyId ?? "",
    autoscalingMaxOverscaleCpu: String(plan.autoscalingMaxOverscaleCpu ?? 3),
    autoscalingMaxOverscaleRam: String(plan.autoscalingMaxOverscaleRam ?? 3),
    autoscalingMaxOverscaleDisk: String(plan.autoscalingMaxOverscaleDisk ?? 3),
  };
}

interface ValidationFeedback {
  status: "idle" | "validating" | "ok" | "error";
  message?: string;
}

export function PlanEditForm({ plan }: { plan: AdminPlanRow }) {
  const [state, setState] = useState<FormState>(() => toFormState(plan));
  const [stripeManual, setStripeManual] = useState(false);
  const stripeIds = {
    productId: plan.stripeProductId,
    monthlyId: plan.stripePriceMonthlyId,
    yearlyId: plan.stripePriceYearlyId,
  };
  const [pending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [globalOk, setGlobalOk] = useState<string | null>(null);
  const [monthlyValidation, setMonthlyValidation] = useState<ValidationFeedback>({ status: "idle" });
  const [yearlyValidation, setYearlyValidation] = useState<ValidationFeedback>({ status: "idle" });

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setState((s) => ({ ...s, [key]: value }));
    if (key === "stripePriceMonthlyId") setMonthlyValidation({ status: "idle" });
    if (key === "stripePriceYearlyId") setYearlyValidation({ status: "idle" });
    if (key === "priceMonthly") setMonthlyValidation({ status: "idle" });
    if (key === "priceYearly") setYearlyValidation({ status: "idle" });
  };

  const validateStripe = async (kind: "month" | "year") => {
    const priceId = kind === "month" ? state.stripePriceMonthlyId : state.stripePriceYearlyId;
    const expected = kind === "month" ? state.priceMonthly : state.priceYearly;
    const setter = kind === "month" ? setMonthlyValidation : setYearlyValidation;
    if (!priceId.trim()) {
      setter({ status: "error", message: "Najpierw wklej Price ID." });
      return;
    }
    const numeric = Number.parseFloat(expected);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setter({ status: "error", message: "Ustaw najpierw cenę planu." });
      return;
    }
    setter({ status: "validating" });
    const res = await validateStripePriceAction({
      priceId: priceId.trim(),
      interval: kind,
      expectedAmount: numeric,
      expectedCurrency: plan.currency,
    });
    if (!res.ok) {
      setter({ status: "error", message: res.error });
    } else {
      setter({ status: "ok", message: "Price zgodny ze Stripe (kwota, waluta, interval, active)." });
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setGlobalOk(null);
    startTransition(async () => {
      const payload = {
        name: state.name.trim(),
        description: state.description.trim() || undefined,
        cpuLimit: Number.parseInt(state.cpuLimit, 10),
        ramLimitMb: Number.parseInt(state.ramLimitMb, 10),
        diskLimitMb: Number.parseInt(state.diskLimitMb, 10),
        ioLimitKbps: Number.parseInt(state.ioLimitKbps, 10),
        iopsLimit: Number.parseInt(state.iopsLimit, 10),
        entryProcesses: Number.parseInt(state.entryProcesses, 10),
        nprocLimit: Number.parseInt(state.nprocLimit, 10),
        includedTransferGb: state.includedTransferGb ? Number.parseInt(state.includedTransferGb, 10) : undefined,
        priceMonthly: Number.parseFloat(state.priceMonthly),
        priceYearly: Number.parseFloat(state.priceYearly),
        isPublic: state.isPublic,
        isActive: state.isActive,
        sortOrder: Number.parseInt(state.sortOrder, 10) || 0,
        trialDays: Number.parseInt(state.trialDays, 10) || 0,
        supportSlaHours: Number.parseInt(state.supportSlaHours, 10) || 0,
        productKind: state.productKind,
        ...(stripeManual
          ? {
              stripePriceMonthlyId: state.stripePriceMonthlyId.trim(),
              stripePriceYearlyId: state.stripePriceYearlyId.trim(),
            }
          : {}),
        autoscalingMaxOverscaleCpu: Number.parseFloat(state.autoscalingMaxOverscaleCpu),
        autoscalingMaxOverscaleRam: Number.parseFloat(state.autoscalingMaxOverscaleRam),
        autoscalingMaxOverscaleDisk: Number.parseFloat(state.autoscalingMaxOverscaleDisk),
      };
      const res = await updatePlanAction(plan.id, payload);
      if (res.ok) {
        setGlobalOk(res.message ?? "Zapisano.");
        window.location.reload();
      } else {
        setGlobalError(res.error);
      }
    });
  };

  const handleSyncStripe = () => {
    setGlobalError(null);
    setGlobalOk(null);
    startTransition(async () => {
      const res = await syncPlanStripeAction(plan.id);
      if (res.ok) {
        setGlobalOk(res.message ?? "Zsynchronizowano ze Stripe.");
        window.location.reload();
      } else {
        setGlobalError(res.error);
      }
    });
  };

  const handleDeactivate = () => {
    if (!confirm("Wyłączyć ten plan ze sprzedaży? Istniejące subskrypcje pozostaną aktywne.")) return;
    startTransition(async () => {
      const res = await deactivatePlanAction(plan.id);
      if (res.ok) setGlobalOk(res.message ?? "Plan wyłączony.");
      else setGlobalError(res.error);
    });
  };

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {globalError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          <strong className="block text-rose-100 mb-1">Błąd zapisu</strong>
          {globalError}
        </div>
      ) : null}
      {globalOk ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-200">
          {globalOk}
        </div>
      ) : null}

      <Section title="Identyfikacja">
        <Field label="Nazwa">
          <input
            value={state.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="Slug (read-only)">
          <input value={plan.slug} disabled className="form-input opacity-50" />
        </Field>
        <Field label="Opis publiczny" wide>
          <textarea
            value={state.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={3}
            className="form-input"
          />
        </Field>
      </Section>

      <Section title="Limity LVE (CloudLinux)">
        <Field label="CPU SPEED %">
          <input
            type="number"
            min={50}
            max={2000}
            value={state.cpuLimit}
            onChange={(e) => setField("cpuLimit", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="RAM (MB)">
          <input
            type="number"
            min={256}
            max={65536}
            value={state.ramLimitMb}
            onChange={(e) => setField("ramLimitMb", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="Disk (MB)">
          <input
            type="number"
            min={1024}
            value={state.diskLimitMb}
            onChange={(e) => setField("diskLimitMb", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="I/O (kbps)">
          <input
            type="number"
            min={1024}
            value={state.ioLimitKbps}
            onChange={(e) => setField("ioLimitKbps", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="IOPS">
          <input
            type="number"
            min={64}
            value={state.iopsLimit}
            onChange={(e) => setField("iopsLimit", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="Entry Processes (EP)">
          <input
            type="number"
            min={1}
            max={2000}
            value={state.entryProcesses}
            onChange={(e) => setField("entryProcesses", e.target.value)}
            required
            className="form-input"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            CloudLinux: NPROC musi być &gt; EP + 15
          </p>
        </Field>
        <Field label="NPROC">
          <input
            type="number"
            min={16}
            max={4000}
            value={state.nprocLimit}
            onChange={(e) => setField("nprocLimit", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="Included transfer (GB)">
          <input
            type="number"
            min={0}
            value={state.includedTransferGb}
            onChange={(e) => setField("includedTransferGb", e.target.value)}
            placeholder="bez limitu"
            className="form-input"
          />
        </Field>
      </Section>

      <Section title="Autoskalowanie — max overscale">
        <p className="text-xs text-muted-foreground col-span-full -mt-2 mb-2">
          Mnożnik limitu planu (np. 3 = maks. 3× CPU/RAM/dysk w skali efektywnej). Silnik nie
          podniesie delty ponad tę wartość bez zmiany planu.
        </p>
        <Field label="CPU (× plan)">
          <input
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={state.autoscalingMaxOverscaleCpu}
            onChange={(e) => setField("autoscalingMaxOverscaleCpu", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="RAM (× plan)">
          <input
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={state.autoscalingMaxOverscaleRam}
            onChange={(e) => setField("autoscalingMaxOverscaleRam", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label="Dysk (× plan)">
          <input
            type="number"
            min={1}
            max={10}
            step={0.1}
            value={state.autoscalingMaxOverscaleDisk}
            onChange={(e) => setField("autoscalingMaxOverscaleDisk", e.target.value)}
            required
            className="form-input"
          />
        </Field>
      </Section>

      <Section title={`Ceny (${plan.currency})`}>
        <Field label={`Miesięcznie (${plan.currency})`}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={state.priceMonthly}
            onChange={(e) => setField("priceMonthly", e.target.value)}
            required
            className="form-input"
          />
        </Field>
        <Field label={`Rocznie (${plan.currency})`}>
          <input
            type="number"
            step="0.01"
            min="0.01"
            value={state.priceYearly}
            onChange={(e) => setField("priceYearly", e.target.value)}
            required
            className="form-input"
          />
          <p className="text-[10px] text-muted-foreground mt-1">
            Min. 6× ceny miesięcznej (sanity guard).
          </p>
        </Field>
      </Section>

      <Section title="Stripe (subskrypcje kartą)">
        <p className="md:col-span-2 text-xs text-muted-foreground -mt-2">
          Domyślnie przy zapisie tworzymy lub aktualizujemy Product i recurring
          Prices w Stripe (wymaga <code className="text-indigo-300">STRIPE_SECRET_KEY</code>
          ). Zmiana ceny archiwizuje stary Price i zakłada nowy.
        </p>
        <div className="md:col-span-2 space-y-2 rounded-lg border border-white/5 bg-white/[0.02] p-3 font-mono text-[11px] text-muted-foreground">
          <StripeIdRow label="Product" value={stripeIds.productId} />
          <StripeIdRow label="Price mies." value={stripeIds.monthlyId} />
          <StripeIdRow label="Price rok" value={stripeIds.yearlyId} />
        </div>
        <div className="md:col-span-2 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSyncStripe}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
          >
            {pending ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <RefreshCw className="h-3 w-3" />
            )}
            Synchronizuj ze Stripe
          </button>
        </div>
        <div className="md:col-span-2">
          <ToggleRow
            checked={stripeManual}
            onChange={setStripeManual}
            description="Ręczne Price ID z Dashboard (zaawansowane) — wyłącza auto-sync przy zapisie."
          />
        </div>
        {stripeManual ? (
          <>
            <PriceIdField
              label="Stripe Price ID — miesięcznie"
              value={state.stripePriceMonthlyId}
              onChange={(v) => setField("stripePriceMonthlyId", v)}
              onValidate={() => validateStripe("month")}
              feedback={monthlyValidation}
            />
            <PriceIdField
              label="Stripe Price ID — rocznie"
              value={state.stripePriceYearlyId}
              onChange={(v) => setField("stripePriceYearlyId", v)}
              onValidate={() => validateStripe("year")}
              feedback={yearlyValidation}
            />
          </>
        ) : null}
      </Section>

      <Section title="Sprzedaż i widoczność">
        <Field label="Aktywny (system)">
          <ToggleRow
            checked={state.isActive}
            onChange={(v) => setField("isActive", v)}
            description="Wyłączenie blokuje nowe subskrypcje, istniejące działają dalej."
          />
        </Field>
        <Field label="Publiczny (klient widzi)">
          <ToggleRow
            checked={state.isPublic}
            onChange={(v) => setField("isPublic", v)}
            description="Pokaż w cenniku panelu klienta."
          />
        </Field>
        <Field label="Sort order">
          <input
            type="number"
            value={state.sortOrder}
            onChange={(e) => setField("sortOrder", e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Okres próbny (dni, 0 = brak)">
          <input
            type="number"
            min={0}
            max={90}
            value={state.trialDays}
            onChange={(e) => setField("trialDays", e.target.value)}
            className="form-input"
          />
        </Field>
        <Field label="Rodzaj produktu">
          <select
            value={state.productKind}
            onChange={(e) => setField("productKind", e.target.value as "HOSTING" | "EMAIL")}
            className="form-input"
          >
            <option value="HOSTING">Hosting (web)</option>
            <option value="EMAIL">Poczta e-mail</option>
          </select>
        </Field>
        <Field label="SLA wsparcia (godz., 0 = brak)">
          <input
            type="number"
            min={0}
            max={720}
            value={state.supportSlaHours}
            onChange={(e) => setField("supportSlaHours", e.target.value)}
            className="form-input"
          />
        </Field>
      </Section>

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-white/5">
        <button
          type="button"
          onClick={handleDeactivate}
          disabled={pending || !plan.isActive}
          className="inline-flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm font-medium text-rose-200 hover:bg-rose-500/20 disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" />
          Wyłącz ze sprzedaży
        </button>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-5 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Zapisz zmiany
        </button>
      </div>

      <style jsx>{`
        .form-input {
          width: 100%;
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: white;
          font-size: 0.875rem;
        }
        .form-input:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">
        {title}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({
  label,
  children,
  wide,
}: {
  label: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function ToggleRow({
  checked,
  onChange,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
          checked ? "bg-emerald-500" : "bg-neutral-700"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
      <p className="text-[11px] text-muted-foreground leading-tight">{description}</p>
    </div>
  );
}

function StripeIdRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex gap-2">
      <span className="w-24 shrink-0 text-white/40">{label}</span>
      <span className="text-white/80 break-all">{value ?? "— (brak — zapisz lub synchronizuj)"}</span>
    </div>
  );
}

function PriceIdField({
  label,
  value,
  onChange,
  onValidate,
  feedback,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onValidate: () => Promise<void> | void;
  feedback: ValidationFeedback;
}) {
  return (
    <div>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      <div className="flex gap-2">
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="price_..."
          className="flex-1 form-input"
        />
        <button
          type="button"
          onClick={onValidate}
          disabled={feedback.status === "validating"}
          className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-500/20 disabled:opacity-50"
        >
          {feedback.status === "validating" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            "Sprawdź w Stripe"
          )}
        </button>
      </div>
      {feedback.status === "ok" ? (
        <p className="mt-1 text-[11px] text-emerald-300 flex items-center gap-1">
          <CheckCircle2 className="h-3 w-3" />
          {feedback.message}
        </p>
      ) : feedback.status === "error" ? (
        <p className="mt-1 text-[11px] text-rose-300 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" />
          {feedback.message}
        </p>
      ) : null}
      <style jsx>{`
        .form-input {
          background: rgba(255, 255, 255, 0.04);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 0.5rem;
          padding: 0.5rem 0.75rem;
          color: white;
          font-size: 0.875rem;
          font-family: ui-monospace, SFMono-Regular, monospace;
        }
        .form-input:focus {
          outline: none;
          border-color: rgba(99, 102, 241, 0.5);
        }
      `}</style>
    </div>
  );
}

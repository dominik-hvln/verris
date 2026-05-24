"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle, AlertTriangle, CheckCircle2 } from "lucide-react";
import { createPlanAction, validateStripePriceAction } from "../actions";

const DEFAULTS = {
  cpuLimit: 100,
  ramLimitMb: 1024,
  diskLimitMb: 10240,
  ioLimitKbps: 10240,
  iopsLimit: 1024,
  entryProcesses: 40,
  nprocLimit: 60,
};

export function NewPlanForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [stripeManual, setStripeManual] = useState(false);
  const [monthlyCheck, setMonthlyCheck] = useState<{ status: string; message?: string }>({ status: "idle" });
  const [yearlyCheck, setYearlyCheck] = useState<{ status: string; message?: string }>({ status: "idle" });

  const [form, setForm] = useState({
    slug: "",
    name: "",
    description: "",
    cpuLimit: String(DEFAULTS.cpuLimit),
    ramLimitMb: String(DEFAULTS.ramLimitMb),
    diskLimitMb: String(DEFAULTS.diskLimitMb),
    ioLimitKbps: String(DEFAULTS.ioLimitKbps),
    iopsLimit: String(DEFAULTS.iopsLimit),
    entryProcesses: String(DEFAULTS.entryProcesses),
    nprocLimit: String(DEFAULTS.nprocLimit),
    includedTransferGb: "",
    priceMonthly: "",
    priceYearly: "",
    currency: "PLN",
    sortOrder: "0",
    stripePriceMonthlyId: "",
    stripePriceYearlyId: "",
    isPublic: true,
    isActive: true,
  });

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const validateStripe = async (kind: "month" | "year") => {
    const priceId = (kind === "month" ? form.stripePriceMonthlyId : form.stripePriceYearlyId).trim();
    const expected = kind === "month" ? form.priceMonthly : form.priceYearly;
    const setter = kind === "month" ? setMonthlyCheck : setYearlyCheck;
    if (!priceId) {
      setter({ status: "error", message: "Najpierw wklej Price ID." });
      return;
    }
    const numeric = Number.parseFloat(expected);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setter({ status: "error", message: "Najpierw ustaw cenę." });
      return;
    }
    setter({ status: "validating" });
    const res = await validateStripePriceAction({
      priceId,
      interval: kind,
      expectedAmount: numeric,
      expectedCurrency: form.currency,
    });
    if (!res.ok) {
      setter({ status: "error", message: res.error });
    } else {
      setter({ status: "ok", message: "Price OK." });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    startTransition(async () => {
      const res = await createPlanAction({
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        cpuLimit: Number.parseInt(form.cpuLimit, 10),
        ramLimitMb: Number.parseInt(form.ramLimitMb, 10),
        diskLimitMb: Number.parseInt(form.diskLimitMb, 10),
        ioLimitKbps: Number.parseInt(form.ioLimitKbps, 10),
        iopsLimit: Number.parseInt(form.iopsLimit, 10),
        entryProcesses: Number.parseInt(form.entryProcesses, 10),
        nprocLimit: Number.parseInt(form.nprocLimit, 10),
        includedTransferGb: form.includedTransferGb ? Number.parseInt(form.includedTransferGb, 10) : undefined,
        priceMonthly: Number.parseFloat(form.priceMonthly),
        priceYearly: Number.parseFloat(form.priceYearly),
        currency: form.currency,
        isPublic: form.isPublic,
        isActive: form.isActive,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        ...(stripeManual
          ? {
              stripePriceMonthlyId: form.stripePriceMonthlyId.trim() || undefined,
              stripePriceYearlyId: form.stripePriceYearlyId.trim() || undefined,
            }
          : {}),
      });
      if (res.ok) {
        const id = (res.data as { id?: string } | undefined)?.id;
        router.push(id ? `/plans/${id}` : "/plans");
        router.refresh();
      } else {
        setGlobalError(res.error);
      }
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {globalError ? (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 px-4 py-3 text-sm text-rose-200">
          <strong className="block text-rose-100 mb-1">Błąd zapisu</strong>
          {globalError}
        </div>
      ) : null}

      <Card title="Identyfikacja">
        <Field label="Slug (a-z, 0-9, myślniki, unikalny)">
          <input
            value={form.slug}
            onChange={(e) => setField("slug", e.target.value)}
            required
            pattern="[a-z0-9-]+"
            placeholder="np. starter-pl-1"
            className="form-input font-mono"
          />
        </Field>
        <Field label="Nazwa publiczna">
          <input value={form.name} onChange={(e) => setField("name", e.target.value)} required className="form-input" />
        </Field>
        <Field label="Opis" wide>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
            className="form-input"
          />
        </Field>
      </Card>

      <Card title="Limity LVE (CloudLinux)">
        <NumField label="CPU SPEED %" value={form.cpuLimit} onChange={(v) => setField("cpuLimit", v)} min={50} max={2000} />
        <NumField label="RAM (MB)" value={form.ramLimitMb} onChange={(v) => setField("ramLimitMb", v)} min={256} max={65536} />
        <NumField label="Disk (MB)" value={form.diskLimitMb} onChange={(v) => setField("diskLimitMb", v)} min={1024} />
        <NumField label="I/O (kbps)" value={form.ioLimitKbps} onChange={(v) => setField("ioLimitKbps", v)} min={1024} />
        <NumField label="IOPS" value={form.iopsLimit} onChange={(v) => setField("iopsLimit", v)} min={64} />
        <NumField label="EP" value={form.entryProcesses} onChange={(v) => setField("entryProcesses", v)} min={1} max={2000} hint="NPROC > EP+15" />
        <NumField label="NPROC" value={form.nprocLimit} onChange={(v) => setField("nprocLimit", v)} min={16} max={4000} />
        <NumField label="Included transfer (GB)" value={form.includedTransferGb} onChange={(v) => setField("includedTransferGb", v)} min={0} optional />
      </Card>

      <Card title="Ceny">
        <Field label="Waluta">
          <select
            value={form.currency}
            onChange={(e) => setField("currency", e.target.value)}
            className="form-input"
          >
            <option value="PLN">PLN</option>
            <option value="EUR">EUR</option>
            <option value="USD">USD</option>
          </select>
        </Field>
        <NumField label={`Miesięcznie (${form.currency})`} value={form.priceMonthly} onChange={(v) => setField("priceMonthly", v)} step="0.01" min={0.01} />
        <NumField label={`Rocznie (${form.currency})`} value={form.priceYearly} onChange={(v) => setField("priceYearly", v)} step="0.01" min={0.01} hint="min. 6× ceny miesięcznej" />
      </Card>

      <Card title="Stripe (subskrypcje kartą)">
        <p className="md:col-span-2 text-xs text-muted-foreground -mt-2">
          Po utworzeniu planu API automatycznie zakłada Product i recurring Prices
          w Stripe, jeśli skonfigurowany jest klucz testowy/produkcyjny.
        </p>
        <div className="md:col-span-2">
          <ToggleRow
            checked={stripeManual}
            onChange={setStripeManual}
            description="Ręczne Price ID z Dashboard — wyłącza auto-sync przy tworzeniu."
          />
        </div>
        {stripeManual ? (
          <>
            <PriceIdField
              label="Stripe Price ID — miesięcznie"
              value={form.stripePriceMonthlyId}
              onChange={(v) => setField("stripePriceMonthlyId", v)}
              onValidate={() => validateStripe("month")}
              feedback={monthlyCheck}
            />
            <PriceIdField
              label="Stripe Price ID — rocznie"
              value={form.stripePriceYearlyId}
              onChange={(v) => setField("stripePriceYearlyId", v)}
              onValidate={() => validateStripe("year")}
              feedback={yearlyCheck}
            />
          </>
        ) : null}
      </Card>

      <Card title="Sprzedaż">
        <Field label="Aktywny w systemie">
          <ToggleRow checked={form.isActive} onChange={(v) => setField("isActive", v)} description="Możliwość zakładania nowych subskrypcji." />
        </Field>
        <Field label="Publiczny">
          <ToggleRow checked={form.isPublic} onChange={(v) => setField("isPublic", v)} description="Pokaż w cenniku panelu klienta." />
        </Field>
        <NumField label="Sort order" value={form.sortOrder} onChange={(v) => setField("sortOrder", v)} />
      </Card>

      <div className="pt-4 border-t border-white/5 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-5 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />}
          Utwórz plan
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

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-white/10 bg-black/20 p-5">
      <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-4">{title}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function Field({ label, children, wide }: { label: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={wide ? "md:col-span-2" : ""}>
      <label className="block text-xs text-muted-foreground mb-1">{label}</label>
      {children}
    </div>
  );
}

function NumField({
  label,
  value,
  onChange,
  min,
  max,
  step,
  hint,
  optional,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  step?: string;
  hint?: string;
  optional?: boolean;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        required={!optional}
        className="form-input"
      />
      {hint ? <p className="text-[10px] text-muted-foreground mt-1">{hint}</p> : null}
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
      `}</style>
    </Field>
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
  feedback: { status: string; message?: string };
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
          {feedback.status === "validating" ? <Loader2 className="h-3 w-3 animate-spin" /> : "Sprawdź"}
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
      `}</style>
    </div>
  );
}

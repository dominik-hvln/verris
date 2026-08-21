"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlusCircle, Mail } from "lucide-react";
import { createPlanAction } from "../actions";

/**
 * #P-1b/UX — dedykowany formularz planu POCZTY. Pokazuje tylko pola istotne dla
 * poczty (pojemność skrzynek, cena, trial, SLA, sprzedaż). Limity LVE (CPU/RAM/
 * IO/EP/NPROC), które nie mają sensu dla poczty, ustawiamy pod spodem na
 * minimalne, poprawne wartości — `Plan` w API wymaga ich technicznie.
 */
const HIDDEN_LVE_DEFAULTS = {
  cpuLimit: 50, // min DTO
  ramLimitMb: 256, // min DTO
};

export function NewEmailPlanForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [globalError, setGlobalError] = useState<string | null>(null);

  const [form, setForm] = useState({
    slug: "",
    name: "",
    description: "",
    storageGb: "5",
    currency: "PLN",
    priceMonthly: "",
    priceYearly: "",
    sortOrder: "0",
    trialDays: "0",
    supportSlaHours: "0",
    isPublic: true,
    isActive: true,
  });

  const setField = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setForm((s) => ({ ...s, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    const storageGb = Math.max(1, Number.parseInt(form.storageGb, 10) || 1);
    startTransition(async () => {
      const res = await createPlanAction({
        slug: form.slug.trim(),
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        // LVE — nieistotne dla poczty; minimalne poprawne wartości.
        cpuLimit: HIDDEN_LVE_DEFAULTS.cpuLimit,
        ramLimitMb: HIDDEN_LVE_DEFAULTS.ramLimitMb,
        diskLimitMb: storageGb * 1024, // pojemność skrzynek
        priceMonthly: Number.parseFloat(form.priceMonthly),
        priceYearly: Number.parseFloat(form.priceYearly),
        currency: form.currency,
        isPublic: form.isPublic,
        isActive: form.isActive,
        sortOrder: Number.parseInt(form.sortOrder, 10) || 0,
        trialDays: Number.parseInt(form.trialDays, 10) || 0,
        supportSlaHours: Number.parseInt(form.supportSlaHours, 10) || 0,
        productKind: "EMAIL",
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
            placeholder="np. poczta-standard"
            className="form-input font-mono"
          />
        </Field>
        <Field label="Nazwa publiczna">
          <input
            value={form.name}
            onChange={(e) => setField("name", e.target.value)}
            required
            placeholder="np. Poczta Standard"
            className="form-input"
          />
        </Field>
        <Field label="Opis" wide>
          <textarea
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
            rows={2}
            placeholder="np. Profesjonalna poczta w Twojej domenie — webmail, IMAP/SMTP, antyspam."
            className="form-input"
          />
        </Field>
      </Card>

      <Card title="Parametry poczty">
        <NumField
          label="Pojemność skrzynek (GB)"
          value={form.storageGb}
          onChange={(v) => setField("storageGb", v)}
          min={1}
          hint="Łączna przestrzeń na pocztę w ramach usługi."
        />
      </Card>

      <Card title="Ceny (rozliczenie z portfela)">
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
        <div />
        <NumField
          label={`Miesięcznie (${form.currency})`}
          value={form.priceMonthly}
          onChange={(v) => setField("priceMonthly", v)}
          step="0.01"
          min={0.01}
        />
        <NumField
          label={`Rocznie (${form.currency})`}
          value={form.priceYearly}
          onChange={(v) => setField("priceYearly", v)}
          step="0.01"
          min={0.01}
          hint="min. 6× ceny miesięcznej"
        />
      </Card>

      <Card title="Sprzedaż">
        <Field label="Aktywny w systemie">
          <ToggleRow
            checked={form.isActive}
            onChange={(v) => setField("isActive", v)}
            description="Możliwość zakładania nowych usług poczty."
          />
        </Field>
        <Field label="Publiczny">
          <ToggleRow
            checked={form.isPublic}
            onChange={(v) => setField("isPublic", v)}
            description="Pokaż w cenniku panelu klienta (kafel Poczta)."
          />
        </Field>
        <NumField label="Sort order" value={form.sortOrder} onChange={(v) => setField("sortOrder", v)} />
        <NumField label="Trial (dni, 0=brak)" value={form.trialDays} onChange={(v) => setField("trialDays", v)} />
        <NumField label="SLA wsparcia (h, 0=brak)" value={form.supportSlaHours} onChange={(v) => setField("supportSlaHours", v)} />
      </Card>

      <div className="pt-4 border-t border-white/5 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg border border-indigo-500/30 bg-indigo-500/15 px-5 py-2 text-sm font-medium text-indigo-200 hover:bg-indigo-500/25 disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
          Utwórz plan poczty
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

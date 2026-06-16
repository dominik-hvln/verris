"use client";

import { useEffect, useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Building2 } from "lucide-react";
import { fetchCompany, saveCompany, type SellerCompany } from "./actions";

const EMPTY: SellerCompany = {
  name: "",
  nip: "",
  regon: "",
  krs: "",
  address: "",
  city: "",
  postalCode: "",
  country: "PL",
  email: "",
  bankAccount: "",
};

export function CompanyForm() {
  const [form, setForm] = useState<SellerCompany>(EMPTY);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void fetchCompany().then((res) => {
      if ("data" in res && res.data) setForm({ ...EMPTY, ...res.data });
      else if ("error" in res && res.error) setError(res.error);
      setLoaded(true);
    });
  }, []);

  const set = (k: keyof SellerCompany) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await saveCompany(form);
      if ("error" in res && res.error) setError(res.error);
      else {
        if ("data" in res && res.data) setForm({ ...EMPTY, ...res.data });
        setSavedAt(new Date());
      }
    });
  };

  const complete = form.name && form.nip && form.address && form.city && form.postalCode;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Building2 className="h-4 w-4 text-emerald-300" /> Dane firmy (sprzedawca na fakturach)
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Te dane trafiają na każdą fakturę Verris (sprzedawca) i do faktur KSeF. Uzupełnij
          wszystkie pola przed wystawieniem pierwszej faktury.
        </p>
      </div>

      {!loaded ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
        </div>
      ) : (
        <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Field label="Nazwa firmy *" value={form.name} onChange={set("name")} required />
          <Field label="NIP *" value={form.nip} onChange={set("nip")} placeholder="10 cyfr" />
          <Field label="REGON" value={form.regon} onChange={set("regon")} />
          <Field label="KRS" value={form.krs} onChange={set("krs")} />
          <Field label="Adres *" value={form.address} onChange={set("address")} />
          <Field label="Miasto *" value={form.city} onChange={set("city")} />
          <Field label="Kod pocztowy *" value={form.postalCode} onChange={set("postalCode")} />
          <Field label="Kraj" value={form.country} onChange={set("country")} placeholder="PL" />
          <Field label="E-mail" value={form.email} onChange={set("email")} type="email" />
          <Field label="Nr konta bankowego" value={form.bankAccount} onChange={set("bankAccount")} />

          <div className="md:col-span-2 flex items-center gap-3 pt-2">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 hover:bg-emerald-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-black"
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Zapisz dane firmy
            </button>
            {savedAt && (
              <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
                <Check className="h-3 w-3" /> Zapisano {savedAt.toLocaleTimeString("pl-PL")}
              </span>
            )}
            {!complete && (
              <span className="text-xs text-amber-300 inline-flex items-center gap-1">
                <AlertCircle className="h-3 w-3" /> Uzupełnij pola wymagane (*)
              </span>
            )}
          </div>
        </form>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      <style>{`
        .cf-input{width:100%;border-radius:.5rem;background:rgb(255 255 255/.05);border:1px solid rgb(255 255 255/.1);padding:.5rem .75rem;font-size:.875rem;outline:none}
        .cf-input:focus{border-color:rgb(16 185 129/.6)}
      `}</style>
    </section>
  );
}

function Field({
  label,
  value,
  onChange,
  required,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  required?: boolean;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        className="cf-input"
        value={value}
        onChange={onChange}
        required={required}
        placeholder={placeholder}
        type={type ?? "text"}
      />
    </label>
  );
}

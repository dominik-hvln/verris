"use client";

import { Select } from "@/components/select";
import { useEffect, useId, useState, useTransition } from "react";
import { AlertCircle, Check, Loader2, Receipt } from "lucide-react";
import { fetchTrybFakturowania, saveTrybFakturowania, type TrybFakturowania } from "./actions";

/**
 * FAK-01 / KSeF 12.10 — przełącznik trybu fakturowania. Do 12.10 istniał tylko jako wiersz
 * `faktury.tryb` w bazie. Działa od następnego dokumentu; powrót do „programu księgowego”
 * wyłącza też wysyłkę do KSeF.
 */
export function TrybFakturowaniaForm() {
  const id = useId();
  const [zapisany, setZapisany] = useState<TrybFakturowania | null>(null);
  const [tryb, setTryb] = useState<TrybFakturowania>("zewnetrzny");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    void fetchTrybFakturowania().then((res) => {
      if ("data" in res && res.data) {
        setZapisany(res.data.tryb);
        setTryb(res.data.tryb);
      } else if ("error" in res && res.error) setError(res.error);
    });
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await saveTrybFakturowania(tryb);
      if ("error" in res && res.error) setError(res.error);
      else if ("data" in res && res.data) {
        setZapisany(res.data.tryb);
        setSavedAt(new Date());
      }
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4 text-indigo-300" /> Kto wystawia faktury VAT
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          „Program księgowy”: panel wystawia dokumenty rozliczeniowe (VDR/VDK), a fakturę VAT wystawiasz poza panelem.
          „Panel”: panel wystawia faktury VAT (VFV/VFK) i — gdy KSeF jest włączony niżej — wysyła je do KSeF, a klient
          dostaje PDF z kodem QR. Zmiana działa od następnego dokumentu i dotyczy wszystkich klientów. Powrót do
          „programu księgowego” wyłącza wysyłkę do KSeF.
        </p>
      </div>
      <form onSubmit={onSubmit} className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-[260px]">
          <label htmlFor={id} className="text-xs font-medium text-muted-foreground">Tryb fakturowania</label>
          <Select
            id={id}
            value={tryb}
            onChange={(v) => setTryb(v as TrybFakturowania)}
            className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            options={[
              { value: "zewnetrzny", label: "Program księgowy (dokument rozliczeniowy)" },
              { value: "panel", label: "Panel (faktura VAT + KSeF)" },
            ]}
          />
        </div>
        <button
          type="submit"
          disabled={isPending || zapisany === null || tryb === zapisany}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
          Zapisz tryb
        </button>
        {savedAt && (
          <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> Zapisano {savedAt.toLocaleTimeString("pl-PL")}
          </span>
        )}
      </form>
      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}
    </section>
  );
}

"use client";

import { Select } from "@/components/select";
import { useEffect, useState, useTransition, useId } from "react";
import { AlertCircle, Check, FileText, Loader2, ShieldCheck } from "lucide-react";
import {
  fetchKsef,
  fetchKsefOverview,
  fetchKsefZalegle,
  saveKsef,
  type KsefOverview,
  type KsefSettings,
  type KsefZalegle,
} from "./actions";
import { KsefZalegleSekcja } from "./ksef-zalegle";
import { KsefPoswiadczenia } from "./ksef-poswiadczenia";
import { Checkbox } from '@/components/checkbox';
import Link from "next/link";

export function KsefForm() {
  const envId = useId();
  const metodaId = useId();
  const [cfg, setCfg] = useState<KsefSettings | null>(null);
  const [overview, setOverview] = useState<KsefOverview | null>(null);
  const [zalegle, setZalegle] = useState<KsefZalegle | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [env, setEnv] = useState<"test" | "demo" | "prod">("test");
  const [nip, setNip] = useState("");
  const [token, setToken] = useState("");
  const [metoda, setMetoda] = useState<"token" | "certyfikat">("token");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [isPending, startTransition] = useTransition();

  const load = () => {
    void fetchKsef().then((res) => {
      if ("data" in res && res.data) {
        setCfg(res.data);
        setEnabled(res.data.enabled);
        setEnv(res.data.env);
        setNip(res.data.nip);
        setMetoda(res.data.metoda ?? "token");
      } else if ("error" in res && res.error) setError(res.error);
    });
    void fetchKsefOverview().then((res) => {
      if ("data" in res && res.data) setOverview(res.data);
    });
    void fetchKsefZalegle().then((res) => {
      if ("data" in res && res.data) setZalegle(res.data);
    });
  };
  useEffect(load, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startTransition(async () => {
      const res = await saveKsef({
        enabled,
        env,
        nip,
        token: token.trim() || undefined,
        metoda,
      });
      if ("error" in res && res.error) setError(res.error);
      else {
        if ("data" in res && res.data) setCfg(res.data);
        setToken("");
        setSavedAt(new Date());
        load();
      }
    });
  };

  return (
    <section id="ksef" className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <FileText className="h-4 w-4 text-indigo-300" /> KSeF 2.0 – Krajowy System e-Faktur
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Faktury FA(3) przez API KSeF 2.0 – wysyłka, statusy, UPO, tryb offline i ponowienia działają
          automatycznie (cykl co 10 min). Token i klucze prywatne certyfikatów są szyfrowane kluczem KMS
          i nigdy nie wracają z API. Klucze publiczne MF klient pobiera automatycznie. Włącz dopiero po
          pomyślnym smoke na środowisku testowym.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <Checkbox
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 bg-white/5"
            />
            Wysyłaj faktury do KSeF (włączone = scheduler co 10 min)
          </label>

          {/* Etykieta obok, nie owijająca — klik w listę nie może ponownie aktywować przycisku. */}
          <div className="block space-y-1">
            <label htmlFor={envId} className="text-xs font-medium text-muted-foreground">Środowisko</label>
            <Select
              id={envId}
              value={env}
              onChange={(v) => setEnv(v as "test" | "demo" | "prod")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
              options={[
                { value: "test", label: "Testowe (api-test.ksef.mf.gov.pl)" },
                { value: "demo", label: "Przedprodukcyjne DEMO (api-demo.ksef.mf.gov.pl)" },
                { value: "prod", label: "Produkcyjne (api.ksef.mf.gov.pl)" },
              ]}
            />
          </div>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-muted-foreground">NIP podatnika</span>
            <input
              value={nip}
              onChange={(e) => setNip(e.target.value)}
              placeholder="10 cyfr"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            />
          </label>

          <div className="block space-y-1 md:col-span-2">
            <label htmlFor={metodaId} className="text-xs font-medium text-muted-foreground">Uwierzytelnienie w KSeF</label>
            <Select
              id={metodaId}
              value={metoda}
              onChange={(v) => setMetoda(v as "token" | "certyfikat")}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
              options={[
                { value: "certyfikat", label: "Certyfikat KSeF (podpis XAdES) – zalecane, wymagane po wygaszeniu tokenów" },
                { value: "token", label: "Token KSeF" },
              ]}
            />
          </div>

          <label className="block space-y-1 md:col-span-2">
            <span className="text-xs font-medium text-muted-foreground">
              Token autoryzacyjny KSeF {cfg?.tokenSet && "(ustawiony – zostaw puste, by zachować)"}
            </span>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={cfg?.tokenSet ? "•••••••• zapisany" : "wklej token z Aplikacji Podatnika"}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            />
          </label>

        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Zapisz konfigurację KSeF
          </button>
          {savedAt && (
            <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
              <Check className="h-3 w-3" /> Zapisano {savedAt.toLocaleTimeString("pl-PL")}
            </span>
          )}
        </div>
      </form>

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {cfg && <KsefPoswiadczenia cfg={cfg} onZmiana={(s) => { setCfg(s); load(); }} />}

      {overview && (
        <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-2">
          {overview.ostatniCykl && (
            <p className="text-xs text-muted-foreground">
              Ostatni cykl {new Date(overview.ostatniCykl.koniec).toLocaleString("pl-PL")}: wysłane {overview.ostatniCykl.wyslane},
              przyjęte {overview.ostatniCykl.przyjete}, odrzucone {overview.ostatniCykl.odrzucone}, UPO {overview.ostatniCykl.upo}
              {overview.ostatniCykl.blad ? <span className="text-amber-300"> – {overview.ostatniCykl.blad}</span> : null}
            </p>
          )}
          {overview.wstrzymanoDo && (
            <p className="text-xs text-amber-300">
              Limit żądań KSeF (429) – wysyłka wstrzymana do {new Date(overview.wstrzymanoDo).toLocaleTimeString("pl-PL")}.
            </p>
          )}
          {(overview.offlineBezKoduII ?? 0) > 0 && (
            <p className="text-xs text-rose-300">
              {overview.offlineBezKoduII} faktur offline bez KODU II – wgraj certyfikat KSeF typu Offline.
            </p>
          )}
          {(overview.offline?.length ?? 0) > 0 && (
            <div className="space-y-1">
              <p className="text-xs font-medium text-amber-300">Poza KSeF (tryb offline / do wyjaśnienia) – automat dośle:</p>
              {overview.offline!.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                  <span className="truncate">
                    <code>{r.number}</code> – {r.tryb ?? r.status}
                    {r.terminDo && (
                      <span className={r.poTerminie ? "text-rose-300" : ""}>
                        {" "}· termin {new Date(r.terminDo).toLocaleString("pl-PL")}{r.poTerminie ? " (minął)" : ""}
                      </span>
                    )}
                    {r.czekaNaOperatora ? " · czeka na Twoją decyzję" : r.nastepnaProba ? ` · próba ${r.proby + 1} o ${new Date(r.nastepnaProba).toLocaleTimeString("pl-PL")}` : ""}
                    {r.error ? ` – ${r.error}` : ""}
                  </span>
                  <Link href={`/invoices/${r.id}#ksef`} className="shrink-0 px-2 py-0.5 rounded border border-white/15 hover:bg-white/5">
                    Otwórz fakturę
                  </Link>
                </div>
              ))}
            </div>
          )}
          <p className="text-sm font-medium text-white">Status faktur w KSeF</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(overview.counts).map(([k, v]) => (
              <span key={k} className="rounded-full border border-white/15 px-2.5 py-0.5 text-neutral-300">
                {k}: <strong className="text-white">{v}</strong>
              </span>
            ))}
            {Object.keys(overview.counts).length === 0 && (
              <span className="text-muted-foreground">Brak faktur w obiegu KSeF.</span>
            )}
          </div>
          {(overview.czekajaZBledem?.length ?? 0) > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-amber-300">Czekają na wysyłkę – powód:</p>
              {overview.czekajaZBledem!.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                  <span className="truncate">
                    <code>{r.number}</code> – {r.error}
                  </span>
                  <Link href={`/invoices/${r.id}#ksef`} className="shrink-0 px-2 py-0.5 rounded border border-white/15 hover:bg-white/5">
                    Otwórz fakturę
                  </Link>
                </div>
              ))}
            </div>
          )}
          {zalegle && <KsefZalegleSekcja zalegle={zalegle} env={overview.config.env} enabled={overview.config.enabled} onDone={load} />}
          {overview.recentRejected.length > 0 && (
            <div className="mt-2 space-y-1">
              <p className="text-xs font-medium text-rose-300">Odrzucone (wymagają interwencji):</p>
              {overview.recentRejected.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-2 text-xs text-neutral-300">
                  <span className="truncate">
                    <code>{r.number}</code> – {r.error ?? "błąd"}
                  </span>
                  {/* Ponowienie jest na stronie faktury (plan E, patch 10) — tam też stan KSeF i dane nabywcy. */}
                  <Link
                    href={`/invoices/${r.id}#ksef`}
                    className="shrink-0 px-2 py-0.5 rounded border border-white/15 hover:bg-white/5"
                  >
                    Otwórz fakturę
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

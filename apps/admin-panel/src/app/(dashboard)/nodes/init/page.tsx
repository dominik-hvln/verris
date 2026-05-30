"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, Server, Loader2, Copy, Check, Terminal, AlertCircle } from "lucide-react";
import type { InitServerResponseDto, BootstrapScriptResponseDto } from "@verris/contracts";
import { initServer, generateBootstrapScript } from "../actions";

export default function InitNodePage() {
  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<InitServerResponseDto | null>(null);
  const [scriptResp, setScriptResp] = useState<BootstrapScriptResponseDto | null>(null);
  const [copied, setCopied] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await initServer({
        name,
        hostname: hostname || undefined,
        region: region || undefined,
        notes: notes || undefined,
      });
      if ("error" in result) {
        setError(result.error ?? "Błąd inicjalizacji");
        return;
      }
      setCreated(result.data!);
      const scriptResult = await generateBootstrapScript(result.data!.server.id);
      if ("data" in scriptResult && scriptResult.data) {
        setScriptResp(scriptResult.data);
      } else if ("error" in scriptResult) {
        setError(scriptResult.error ?? "Nie udało się wygenerować skryptu");
      }
    });
  };

  const onCopy = () => {
    if (!scriptResp) return;
    void navigator.clipboard.writeText(scriptResp.script).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-8 max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          href="/nodes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Lista węzłów
        </Link>
      </div>

      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white drop-shadow-md">
          Inicjalizacja nowego węzła
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Utwórz rekord węzła i pobierz jednorazowy skrypt bootstrap. Po uruchomieniu skryptu na
          serwerze, węzeł zgłosi się do panelu i przejdzie w stan <em>oczekuje na akceptację</em>.
        </p>
      </header>

      {!created ? (
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 space-y-5"
        >
          <Field label="Nazwa węzła" required>
            <input
              type="text"
              required
              minLength={1}
              maxLength={80}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="np. Node-Alpha PL"
              className="form-input"
            />
          </Field>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field label="Hostname (opcjonalnie)">
              <input
                type="text"
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder="alpha.verris.internal"
                className="form-input"
              />
            </Field>
            <Field label="Region (opcjonalnie)">
              <input
                type="text"
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                placeholder="PL-WAW"
                className="form-input"
              />
            </Field>
          </div>

          <Field label="Notatki (opcjonalnie)">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="np. dostawca, model maszyny, planowane zastosowanie"
              className="form-input"
            />
          </Field>

          {error && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
              <AlertCircle className="h-4 w-4" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium transition-colors"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Server className="h-4 w-4" />}
            {isPending ? "Tworzenie..." : "Utwórz węzeł i wygeneruj skrypt"}
          </button>

          <style>{`
            .form-input { width: 100%; border-radius: 0.5rem; background-color: rgb(255 255 255 / 0.05); border: 1px solid rgb(255 255 255 / 0.1); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
            .form-input:focus { border-color: rgb(99 102 241 / 0.6); background-color: rgb(255 255 255 / 0.07); }
            .form-input::placeholder { color: rgb(113 113 122); }
          `}</style>
        </form>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-5 flex items-start gap-3">
            <Check className="h-5 w-5 text-emerald-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold text-emerald-100">Węzeł utworzony.</p>
              <p className="text-sm text-emerald-100/80 mt-1">
                ID: <code className="bg-black/30 px-1.5 py-0.5 rounded">{created.server.id}</code>
                {scriptResp ? (
                  <>
                    . Token bootstrap traci ważność{" "}
                    {new Date(scriptResp.expiresAt).toLocaleString("pl-PL")}.
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
          </div>

          {scriptResp && (
            <div className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md overflow-hidden">
              <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Terminal className="h-4 w-4" />
                  <span>Skrypt bootstrap (uruchom na serwerze jako root)</span>
                </div>
                <button
                  onClick={onCopy}
                  className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" /> Skopiowane
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Kopiuj
                    </>
                  )}
                </button>
              </div>
              <pre className="p-5 text-[12px] leading-relaxed overflow-x-auto bg-black/60 max-h-[420px]">
                <code>{scriptResp.script}</code>
              </pre>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Link
              href={`/nodes/wizard?server=${created.server.id}&step=approve-da`}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 px-4 py-2 text-sm font-medium transition-colors"
            >
              Kontynuuj wizard (kroki 6–8)
            </Link>
            <Link
              href={`/nodes/${created.server.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium transition-colors"
            >
              Szczegóły węzła (nowa karta)
            </Link>
            <Link
              href="/nodes"
              className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium transition-colors"
            >
              Wróć do listy
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-muted-foreground">
        {label}
        {required ? <span className="text-rose-400 ml-0.5">*</span> : null}
      </span>
      {children}
    </label>
  );
}

"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  CheckCircle2,
  Circle,
  Loader2,
  RefreshCw,
  Copy,
  Check,
  KeyRound,
  Terminal,
  AlertTriangle,
  RotateCw,
  ChevronDown,
} from "lucide-react";
import {
  fetchBootstrapStatus,
  saveNodeLicenseKeys,
  generateBootstrapOneLiner,
  type BootstrapStatusDto,
} from "../actions";

const PHASES: Array<{ key: string; label: string; detail: string }> = [
  { key: "PREFLIGHT", label: "Preflight", detail: "root, czysty OS, czas (NTP), brak innego panelu" },
  { key: "CLOUDLINUX", label: "CloudLinux", detail: "cldeploy → konwersja + reboot (kernel LVE)" },
  { key: "DA", label: "DirectAdmin", detail: "oficjalny instalator CLI (setup.sh)" },
  { key: "STACK", label: "LiteSpeed", detail: "CustomBuild: webserver litespeed + serial" },
  { key: "AGENT", label: "Agent + handshake", detail: "rejestracja w control-plane, agent LVE" },
  { key: "CANARY", label: "Canary + NS", detail: "wejście do puli, OVH NS glue (auto)" },
  { key: "DONE", label: "Gotowe", detail: "węzeł w pełni skonfigurowany" },
];

const ORDER = ["PENDING", "PREFLIGHT", "CLOUDLINUX", "DA", "STACK", "AGENT", "CANARY", "DONE"];

export function NodeBootstrapProgress({ serverId }: { serverId: string }) {
  const [status, setStatus] = useState<BootstrapStatusDto | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = async () => {
    setLoading(true);
    const { data } = await fetchBootstrapStatus(serverId);
    setLoading(false);
    if (data) {
      setStatus(data);
      setCheckedAt(new Date());
    }
  };

  useEffect(() => {
    void poll();
    timer.current = setInterval(() => void poll(), 5000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverId]);

  const currentIdx = status?.phase ? ORDER.indexOf(status.phase) : -1;
  const rebooting = status?.events?.[0]?.status === "REBOOT";
  const failed = status?.phase === "FAILED" || status?.events?.[0]?.status === "FAILED";

  return (
    <div className="space-y-6">
      <LicenseKeysForm serverId={serverId} />
      <OneLinerCard serverId={serverId} />

      <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
            {loading ? <Loader2 className="h-4 w-4 animate-spin text-indigo-300" /> : <RefreshCw className="h-4 w-4 text-indigo-300" />}
            Postęp instalacji (na żywo)
          </h3>
          {checkedAt ? <span className="text-[10px] text-muted-foreground">sprawdzono {checkedAt.toLocaleTimeString("pl-PL")}</span> : null}
        </div>

        {rebooting ? (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3 py-2 text-sm text-sky-100">
            <RotateCw className="h-4 w-4 animate-spin" /> Węzeł się restartuje (instalacja kernela CloudLinux) — instalacja wznowi się automatycznie po powrocie.
          </div>
        ) : null}
        {failed ? (
          <div className="mb-4 flex items-start gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-sm text-rose-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Faza nie powiodła się: {status?.error ?? "sprawdź historię poniżej"}
          </div>
        ) : null}

        <ol className="space-y-2">
          {PHASES.map((p) => {
            const idx = ORDER.indexOf(p.key);
            const done = currentIdx > idx || status?.phase === "DONE";
            const active = status?.phase === p.key;
            return (
              <li key={p.key} className="flex items-start gap-2.5">
                {done ? (
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
                ) : active ? (
                  <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-indigo-300" />
                ) : (
                  <Circle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground/40" />
                )}
                <div>
                  <p className={`text-sm ${done || active ? "text-white" : "text-muted-foreground"}`}>{p.label}</p>
                  <p className="text-[11px] text-muted-foreground">{p.detail}</p>
                </div>
              </li>
            );
          })}
        </ol>

        {status?.events && status.events.length > 0 ? (
          <details className="mt-4 rounded-xl border border-white/10 bg-black/30 p-3">
            <summary className="cursor-pointer text-xs font-medium text-neutral-300">Historia zdarzeń ({status.events.length})</summary>
            <ul className="mt-2 space-y-1 font-mono text-[11px]">
              {status.events.map((e, i) => (
                <li key={i} className="text-neutral-400">
                  <span className="text-neutral-500">{new Date(e.createdAt).toLocaleTimeString("pl-PL")}</span>{" "}
                  <span className={e.status === "FAILED" ? "text-rose-300" : e.status === "OK" ? "text-emerald-300" : "text-sky-300"}>
                    {e.phase}/{e.status}
                  </span>
                  {e.message ? ` — ${e.message}` : ""}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>

      <ManualSteps />
    </div>
  );
}

function LicenseKeysForm({ serverId }: { serverId: string }) {
  const [da, setDa] = useState("");
  const [cl, setCl] = useState("");
  const [ls, setLs] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setMsg(null);
    start(async () => {
      const r = await saveNodeLicenseKeys(serverId, {
        daLicenseKey: da.trim() || undefined,
        clActivationKey: cl.trim() || undefined,
        lsSerial: ls.trim() || undefined,
      });
      if (r.ok) {
        setMsg({ ok: true, text: "Klucze zapisane (zaszyfrowane). Wygeneruj one-liner poniżej." });
        setDa(""); setCl(""); setLs("");
      } else setMsg({ ok: false, text: r.error ?? "Błąd zapisu." });
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <KeyRound className="h-4 w-4 text-amber-300" /> Klucze licencyjne
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Wklej klucze po zakupie — są szyfrowane i wstrzykiwane do instalatora. Puste pole = faza pominięta (np. bez LiteSpeed zostaje domyślny serwer WWW).
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="DirectAdmin — License Key"><input value={da} onChange={(e) => setDa(e.target.value)} placeholder="XXXX-XXXX-…" className="inp" /></Field>
        <Field label="CloudLinux — Activation Key"><input value={cl} onChange={(e) => setCl(e.target.value)} placeholder="12314-…" className="inp" /></Field>
        <Field label="LiteSpeed — Serial"><input value={ls} onChange={(e) => setLs(e.target.value)} placeholder="XXXXXXXX (lub TRIAL)" className="inp" /></Field>
      </div>
      {msg ? <p className={`mt-2 text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
      <button onClick={save} disabled={pending} className="mt-3 inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-semibold text-white hover:bg-amber-500 disabled:opacity-50">
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Zapisz klucze
      </button>
      <style jsx>{`:global(.inp){width:100%;border-radius:.6rem;border:1px solid rgba(255,255,255,.1);background:rgba(0,0,0,.35);padding:.5rem .7rem;font-size:.8rem;color:#fff;outline:none}`}</style>
    </section>
  );
}

function OneLinerCard({ serverId }: { serverId: string }) {
  const [oneLiner, setOneLiner] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, start] = useTransition();

  const gen = () => {
    setErr(null);
    start(async () => {
      const r = await generateBootstrapOneLiner(serverId);
      if (r.data) { setOneLiner(r.data.oneLiner); setExpiresAt(r.data.expiresAt); }
      else setErr(r.error ?? "Błąd.");
    });
  };
  const copy = async () => {
    if (!oneLiner) return;
    try { await navigator.clipboard.writeText(oneLiner); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* noop */ }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <Terminal className="h-4 w-4 text-emerald-300" /> Komenda instalacyjna (jako root na świeżym serwerze)
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">
        Jeden podpisany one-liner uruchamia wznawialny bootstrap. Przeżywa restarty (systemd oneshot). Zainstaluj najpierw czysty AlmaLinux; resztę zrobi automat.
      </p>
      {oneLiner ? (
        <div className="flex items-center gap-2">
          <code className="flex-1 overflow-x-auto whitespace-nowrap rounded-lg bg-black/60 px-3 py-2 text-[11px] text-emerald-200">{oneLiner}</code>
          <button onClick={copy} className="shrink-0 rounded-lg border border-white/10 px-2.5 py-2 text-neutral-300 hover:bg-white/5">
            {copied ? <Check className="h-4 w-4 text-emerald-300" /> : <Copy className="h-4 w-4" />}
          </button>
        </div>
      ) : (
        <button onClick={gen} disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />} Wygeneruj komendę
        </button>
      )}
      {expiresAt ? <p className="mt-2 text-[11px] text-muted-foreground">Token ważny do {new Date(expiresAt).toLocaleString("pl-PL")}.</p> : null}
      {err ? <p className="mt-2 text-sm text-rose-300">{err}</p> : null}
    </section>
  );
}

function ManualSteps() {
  const steps = [
    { t: "Czysty OS", d: "Zainstaluj świeży AlmaLinux (8/9/10) — bez innego panelu. CloudLinux 10 = konwersja z AlmaLinux 10 (brak ISO, konwertuje cldeploy)." },
    { t: "Licencje", d: "Kup: DirectAdmin (License Key), CloudLinux (Activation Key), LiteSpeed (Serial) i wklej je powyżej." },
    { t: "rDNS / PTR", d: "W panelu dostawcy ustaw PTR dla IP węzła na jego hostname (np. srv01.verris.pl)." },
    { t: "Porty firewalla (dostawca)", d: "Otwórz: 22 (SSH), 2222 (DA), 80/443 (WWW), 25/465/587/993/995 (poczta), 53 (DNS)." },
    { t: "DNS węzła / NS", d: "A/AAAA węzła + glue NS robimy automatem przez OVH. Dla marki NS spoza OVH ustaw glue u rejestratora verris.pl." },
  ];
  return (
    <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-5">
      <h3 className="mb-1 flex items-center gap-2 text-sm font-semibold text-white">
        <ChevronDown className="h-4 w-4 text-neutral-300" /> Kroki ręczne (czego nie da się zautomatyzować)
      </h3>
      <p className="mb-3 text-[11px] text-muted-foreground">Te elementy wymagają Twojej akcji poza serwerem — reszta dzieje się automatycznie.</p>
      <ol className="space-y-2">
        {steps.map((s, i) => (
          <li key={i} className="flex items-start gap-2.5 rounded-lg border border-white/5 bg-black/20 p-2.5">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/10 text-[11px] font-bold text-white">{i + 1}</span>
            <div>
              <p className="text-sm text-white">{s.t}</p>
              <p className="text-[11px] text-muted-foreground">{s.d}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="mb-1 block text-[11px] font-medium text-muted-foreground">{label}</span>{children}</label>;
}

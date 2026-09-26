"use client";

import { Select } from "@/components/select";
import { REGIONY_DANYCH } from "@verris/contracts";
import { useState, useTransition, useEffect, useId } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Copy,
  Loader2,
  Server,
  Terminal,
  AlertTriangle,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import type { BootstrapScriptResponseDto, InitServerResponseDto } from "@verris/contracts";
import { generateBootstrapScript, initServer, fetchServer } from "../actions";
import { ApproveServerButton } from "../[id]/approve-button";
import { HostingProfilePanel } from "../[id]/hosting-profile-panel";
import { NodeBootstrapProgress } from "../[id]/node-bootstrap-progress";
import { NodeLiveStatus, type NodeLiveSignals } from "./node-live-status";
import {
  BOOTSTRAP_DOES,
  BOOTSTRAP_DOES_NOT,
  DOD_ACTIVE_CHECKLIST,
  HOSTING_PROFILE_HINT,
  BACKUP_OFFSITE_CONF,
  INSTALL_CLOUDLINUX_AL10,
  INSTALL_CLOUDLINUX_AL9,
  INSTALL_DIRECTADMIN,
  INSTALL_LITESPEED_STANDALONE,
  INSTALL_LITESPEED_VIA_DA,
  INSTALL_OS_PREP,
  ONBOARD_LIVE_DOES,
  ONBOARD_LIVE_RUN,
  ONBOARD_LIVE_SCP,
  ONBOARD_LIVE_VERIFY,
  PREPARE_NODE_EXPORTS,
  VERIFY_CLOUDLINUX,
  VERIFY_BOOTSTRAP_AGENTS,
  WIZARD_STEPS,
} from "./wizard-content";
import { Checkbox } from '@/components/checkbox';
import { KopieOffsiteFormularz, OnboardLivePanel } from "./onboard-panele";

const WIZARD_STORAGE_KEY = "verris-node-wizard-v1";
const APPROVE_DA_STEP_INDEX = WIZARD_STEPS.findIndex((s) => s.id === "approve-da");

type PersistedWizard = {
  stepIndex: number;
  name: string;
  hostname: string;
  region: string;
  notes: string;
  serverId: string | null;
  checked: Record<string, boolean>;
};

function loadPersistedWizard(): Partial<PersistedWizard> | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(WIZARD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as PersistedWizard) : null;
  } catch {
    return null;
  }
}

function savePersistedWizard(data: PersistedWizard) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(WIZARD_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* ignore quota / private mode */
  }
}

function CopyBlock({ label, text }: { label: string; text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-white/10 bg-black/50 overflow-hidden">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <span className="text-xs text-muted-foreground">{label}</span>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5"
        >
          {copied ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
          {copied ? "Skopiowane" : "Kopiuj"}
        </button>
      </div>
      <pre className="p-3 text-[11px] leading-relaxed overflow-x-auto max-h-48 text-zinc-300">
        <code>{text}</code>
      </pre>
    </div>
  );
}

function CheckItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2 text-sm text-zinc-300">
      <ChevronRight className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" aria-hidden />
      <span>{children}</span>
    </li>
  );
}

/**
 * Every wizard link to an external page or another panel section MUST open in a
 * new tab so the operator never loses wizard progress (state lives in
 * sessionStorage but step focus + scroll do not).
 */
function WizardExternalLink({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  const base =
    "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors";
  const cls =
    variant === "primary"
      ? "bg-indigo-500 hover:bg-indigo-600 text-white"
      : "border border-white/15 bg-white/5 hover:bg-white/10 text-zinc-100";
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={`${base} ${cls}`}>
      {children}
      <ExternalLink className="h-3.5 w-3.5" />
    </a>
  );
}

/**
 * Post-ACTIVE action panel ("Konfiguracja węzła w panelu"). Visible once a node
 * record exists; every action opens in a new tab. Centralises the steps the
 * operator previously had to remember from the runbook (DA config, package
 * sync/audit, hosting profile, TLS, probes, smoke).
 */
function NodeConfigActions({ serverId }: { serverId: string }) {
  return (
    <div className="rounded-2xl border border-indigo-500/25 bg-indigo-500/5 p-5 space-y-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Server className="h-4 w-4 text-indigo-300" /> Konfiguracja węzła w panelu
      </div>
      <p className="text-xs text-muted-foreground">
        Po podłączeniu węzła dokończ konfigurację stąd — wszystko otwiera się w nowej karcie, więc
        nie tracisz postępu wizarda. Audyt na stronie węzła zweryfikuje każdą akcję (pakiety, język,
        hostname, TLS) i pokaże raport zgodności z dokumentacją.
      </p>
      <div className="flex flex-wrap gap-2.5">
        <WizardExternalLink href={`/nodes/${serverId}`} variant="primary">
          Szczegóły węzła
        </WizardExternalLink>
        <WizardExternalLink href={`/nodes/${serverId}#directadmin`}>
          Konfiguracja DA i test API (scope)
        </WizardExternalLink>
        <WizardExternalLink href={`/nodes/${serverId}#audyt`}>
          Audyt i naprawa (pakiety DA, język, TLS)
        </WizardExternalLink>
        <WizardExternalLink href={`/nodes/${serverId}#hosting-profile`}>
          Profil hostingowy (LiteSpeed + Governor)
        </WizardExternalLink>
        <WizardExternalLink href="/status/probes">Status probes węzła</WizardExternalLink>
      </div>
      <p className="text-[11px] text-muted-foreground">
        Synchronizacja pakietów DA (starter/pro/business z limitami planu) i ich weryfikacja: sekcja
        „Audyt i naprawa” → „Napraw pakiet …”.
      </p>
    </div>
  );
}

export function NodeWizard() {
  const regionId = useId();
  const searchParams = useSearchParams();
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState("");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<InitServerResponseDto | null>(null);
  const [scriptResp, setScriptResp] = useState<BootstrapScriptResponseDto | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const step = WIZARD_STEPS[Math.min(stepIndex, WIZARD_STEPS.length - 1)]!;
  const serverId = created?.server.id;

  useEffect(() => {
    let cancelled = false;

    async function hydrate() {
      const saved = loadPersistedWizard();
      const paramServer = searchParams.get("server");
      const paramStep = searchParams.get("step");

      if (paramStep) {
        const idx = WIZARD_STEPS.findIndex((s) => s.id === paramStep);
        if (idx >= 0) setStepIndex(idx);
      } else if (saved?.stepIndex != null) {
        setStepIndex(saved.stepIndex);
      }

      if (saved?.name) setName(saved.name);
      if (saved?.hostname) setHostname(saved.hostname);
      if (saved?.region) setRegion(saved.region);
      if (saved?.notes) setNotes(saved.notes);
      if (saved?.checked) setChecked(saved.checked);

      const serverIdToLoad = paramServer ?? saved?.serverId ?? null;
      if (serverIdToLoad) {
        const { data } = await fetchServer(serverIdToLoad);
        if (!cancelled && data) {
          setCreated({
            server: data,
            bootstrapToken: "",
            bootstrapTokenId: "",
            expiresAt: "",
          });
          if (!saved?.name && data.name) setName(data.name);
          if (!saved?.hostname && data.hostname) setHostname(data.hostname ?? "");
          if (!saved?.region && data.region) setRegion(data.region ?? "");
        }
      }

      if (!cancelled) setHydrated(true);
    }

    void hydrate();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  useEffect(() => {
    if (!hydrated) return;
    savePersistedWizard({
      stepIndex,
      name,
      hostname,
      region,
      notes,
      serverId: created?.server.id ?? null,
      checked,
    });
  }, [hydrated, stepIndex, name, hostname, region, notes, created?.server.id, checked]);

  const toggleCheck = (key: string) => {
    setChecked((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // ADM-1+ — auto-potwierdzanie kroków na podstawie realnego stanu węzła.
  // Nie odznaczamy ręcznych zaznaczeń; tylko dostawiamy potwierdzone sygnały.
  const applyLiveSignals = (s: NodeLiveSignals) => {
    setChecked((prev) => {
      const bootstrap = prev.bootstrap || s.handshake;
      const approve = prev.approve || (s.active && s.daConfigured);
      if (bootstrap === prev.bootstrap && approve === prev.approve) return prev;
      return { ...prev, bootstrap, approve };
    });
  };

  const createNodeAndScript = () => {
    setError(null);
    startTransition(async () => {
      const result = await initServer({
        name,
        hostname: hostname.trim(),
        region: region || undefined,
        notes: notes || undefined,
      });
      if ("error" in result) {
        setError(result.error ?? "Błąd inicjalizacji");
        return;
      }
      // NODE-01 — zostajemy w kroku instalacji: licencje i skrypt v2 pojawiają się pod formularzem.
      setCreated(result.data!);
    });
  };

  const copyScript = () => {
    if (!scriptResp) return;
    void navigator.clipboard.writeText(scriptResp.script).then(() => {
      setScriptCopied(true);
      setTimeout(() => setScriptCopied(false), 2000);
    });
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <div className="flex items-center gap-3">
        <Link
          href="/nodes"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" /> Węzły
        </Link>
      </div>

      <header>
        <h1 className="text-3xl font-bold text-white">Kreator nowego węzła</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Jedna ścieżka dodania węzła: rekord w panelu → wznawialny bootstrap v2 (CloudLinux, DirectAdmin,
          LiteSpeed, agent) z postępem na żywo → akceptacja i DA API → backup offsite → Onboard LIVE →
          profil hostingowy → smoke. Klucze licencyjne zapisujemy zaszyfrowane; skrypt pobiera je osobno
          (wpis w audycie) i nie zapisuje na dysku serwera.
        </p>
      </header>

      {/* Progress */}
      <nav className="flex flex-wrap gap-2">
        {WIZARD_STEPS.map((s, i) => (
          <button
            key={s.id}
            type="button"
            onClick={() => setStepIndex(i)}
            className={`text-left rounded-lg px-3 py-2 border text-xs transition-colors ${
              i === stepIndex
                ? "border-indigo-500/50 bg-indigo-500/15 text-indigo-100"
                : i < stepIndex
                  ? "border-emerald-500/30 bg-emerald-500/5 text-emerald-200/80"
                  : "border-white/10 bg-black/30 text-muted-foreground hover:border-white/20"
            }`}
          >
            <span className="font-semibold">{i + 1}. {s.title}</span>
          </button>
        ))}
      </nav>

      <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-6 space-y-5">
        <div>
          <h2 className="text-xl font-semibold text-white">{step.title}</h2>
          <p className="text-sm text-muted-foreground mt-1">{step.subtitle}</p>
        </div>

        {(step.id === "approve-da" || step.id === "hosting-profile" || step.id === "finish") && (
          <div className="rounded-lg border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Zostały kroki <strong>{stepIndex + 1}–{WIZARD_STEPS.length}</strong> wizarda.
              Konfigurację DA możesz otworzyć w nowej karcie — po teście API wróć tutaj i przejdź
              dalej (profil hostingowy, smoke).
            </span>
          </div>
        )}

        {step.id === "bootstrap" && created && stepIndex === WIZARD_STEPS.findIndex((s) => s.id === "bootstrap") && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-100">
            Wklej jednolinijkowiec na węźle jako root — postęp faz widać poniżej na żywo, restarty nie
            przerywają instalacji. Gdy faza dojdzie do „Gotowe”, przejdź do{" "}
            <button
              type="button"
              onClick={() => setStepIndex(APPROVE_DA_STEP_INDEX)}
              className="underline font-medium hover:text-white"
            >
              kroku „Akceptacja i DA API”
            </button>
            .
          </div>
        )}

        {step.id === "requirements" && (
          <div className="space-y-2">
            <ul className="space-y-2">
            <CheckItem>
              Osobny serwer compute (nie ten sam co control-plane Docker/Caddy).
            </CheckItem>
            <CheckItem>
              <strong>AlmaLinux 9.x</strong> (produkcja / sharedlicense DA) lub{" "}
              <strong>10.2</strong> (test, najdłuższe wsparcie — full DA na AL10).
            </CheckItem>
            </ul>
            <CopyBlock label="Krok 0 — przygotowanie OS (root)" text={INSTALL_OS_PREP} />
            <ul className="space-y-2">
            <CheckItem>
              Min. <strong>4 GB RAM</strong> (8+ GB zalecane), dysk SSD z zapasem na konta.
            </CheckItem>
            <CheckItem>
              Węzeł musi łączyć się z <code className="text-indigo-300">https://api.verris.pl</code>{" "}
              (443).
            </CheckItem>
            <CheckItem>Licencje trial: CloudLinux, LiteSpeed, DA (sharedlicense na smoke).</CheckItem>
            </ul>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <Checkbox
                checked={!!checked.requirements}
                onChange={() => toggleCheck("requirements")}
                className="rounded border-white/20"
              />
              Serwer spełnia wymagania
            </label>
          </div>
        )}

        {step.id === "bootstrap" && (
          <div className="space-y-5">
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
                <p className="font-medium text-emerald-200 mb-2">Skrypt bootstrap robi</p>
                <ul className="space-y-1 text-zinc-300 text-xs">
                  {BOOTSTRAP_DOES.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
              <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
                <p className="font-medium text-rose-200 mb-2">Skrypt bootstrap nie robi</p>
                <ul className="space-y-1 text-zinc-300 text-xs">
                  {BOOTSTRAP_DOES_NOT.map((line) => (
                    <li key={line}>• {line}</li>
                  ))}
                </ul>
              </div>
            </div>

            {!created ? (
              <form
                className="space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  createNodeAndScript();
                }}
              >
                <div className="grid md:grid-cols-2 gap-4">
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground">Nazwa węzła *</span>
                    <input
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Node-PL-01"
                      className="wizard-input"
                    />
                  </label>
                  {/* Etykieta obok, nie owijająca — klik w listę nie może ponownie aktywować przycisku. */}
                  <div className="block space-y-1 text-sm">
                    <label htmlFor={regionId} className="text-muted-foreground">Lokalizacja (centrum danych)</label>
                    <Select
                      id={regionId}
                      value={region}
                      onChange={setRegion}
                      className="wizard-input"
                      options={[
                        { value: "", label: "— nie wybrano (klient zobaczy ogólne „EOG”) —" },
                        ...Object.entries(REGIONY_DANYCH).map(([kod, opis]) => ({ value: kod, label: `${kod} — ${opis}` })),
                      ]}
                    />
                  </div>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Hostname (FQDN) *</span>
                  <input
                    required
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    placeholder="node-pl-02.verris.pl"
                    pattern="^(?=.{1,253}$)([a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]{2,}$"
                    title="Poprawny FQDN, np. node-pl-02.verris.pl — nie surowe IP"
                    className="wizard-input"
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Wymagany — wildcard <code>*.verris.pl</code> i linki panelu działają po hostname.
                    Dodaj rekord A w OVH zanim zaakceptujesz węzeł.
                  </span>
                </label>
                {error && <p className="text-sm text-rose-300">{error}</p>}
                <button
                  type="submit"
                  disabled={isPending || !name.trim() || !hostname.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  Utwórz węzeł
                </button>
              </form>
            ) : (
              <div className="space-y-3">
                {serverId ? <NodeBootstrapProgress serverId={serverId} /> : null}
                <details className="rounded-xl border border-white/10 bg-black/30 p-4">
                  <summary className="cursor-pointer text-sm font-medium text-zinc-300">
                    Instalacja ręczna — tylko gdy bootstrap v2 nie może (np. licencja przypięta do IP, nietypowy OS)
                  </summary>
                  <div className="mt-4 space-y-4">
                    <p className="text-xs text-muted-foreground">
                      Te same komendy, które wykonuje bootstrap v2, do uruchomienia ręcznie. Po ręcznej instalacji
                      i tak uruchom skrypt v2 powyżej — pominie zrobione fazy i zrobi handshake oraz agenta.
                    </p>
                    <CopyBlock
                                  label="Instalacja CL 10 (AlmaLinux 10.2 → cldeploy + reboot)"
                                  text={INSTALL_CLOUDLINUX_AL10}
                                />
                    <CopyBlock
                                  label="Alternatywa: CL 9 (AlmaLinux 9.x)"
                                  text={INSTALL_CLOUDLINUX_AL9}
                                />
                    <CopyBlock label="Weryfikacja po reboot" text={VERIFY_CLOUDLINUX} />
                    <CopyBlock label="Instalacja DirectAdmin (setup.sh)" text={INSTALL_DIRECTADMIN} />
                    <CopyBlock
                                  label="3a) LiteSpeed + LSPHP przez DA CustomBuild (zalecane)"
                                  text={INSTALL_LITESPEED_VIA_DA}
                                />
                    <CopyBlock
                                  label="3b) LiteSpeed standalone (get.litespeed.sh)"
                                  text={INSTALL_LITESPEED_STANDALONE}
                                />
                    <CopyBlock label="4) Zmienne przed bootstrap Verris" text={PREPARE_NODE_EXPORTS} />
                    <button
                      type="button"
                      onClick={() => {
                        if (!serverId) return;
                        startTransition(async () => {
                          const r = await generateBootstrapScript(serverId);
                          if ("data" in r && r.data) setScriptResp(r.data);
                          else if ("error" in r) setError(r.error ?? "Nie udało się wygenerować skryptu");
                        });
                      }}
                      className="text-xs px-2.5 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10"
                    >
                      Tylko agent i handshake (panel zainstalowany ręcznie)
                    </button>
                  </div>
                </details>
                <p className="text-sm text-emerald-200">
                  Węzeł utworzony:{" "}
                  <code className="bg-black/40 px-1 rounded">{serverId}</code>
                  {scriptResp && (
                    <>
                      {" "}
                      · token ważny do{" "}
                      {new Date(scriptResp.expiresAt).toLocaleString("pl-PL")}
                    </>
                  )}
                </p>
                {scriptResp && (
                  <div className="rounded-xl border border-white/10 overflow-hidden">
                    <div className="flex items-center justify-between border-b border-white/10 px-4 py-2 bg-black/60">
                      <span className="text-xs flex items-center gap-2 text-muted-foreground">
                        <Terminal className="h-3.5 w-3.5" /> Na węźle: export LITESPEED_SERIAL_NO=…
                        && bash skrypt.sh
                      </span>
                      <button
                        type="button"
                        onClick={copyScript}
                        className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/5 inline-flex items-center gap-1"
                      >
                        {scriptCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        Kopiuj skrypt
                      </button>
                    </div>
                    <pre className="p-4 text-[11px] leading-relaxed overflow-x-auto max-h-80 bg-black/80">
                      <code>{scriptResp.script}</code>
                    </pre>
                  </div>
                )}
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={!!checked.bootstrap}
                    onChange={() => toggleCheck("bootstrap")}
                    className="rounded border-white/20"
                  />
                  Bootstrap doszedł do fazy „Gotowe” (albo ręcznie: „Bootstrap complete”)
                </label>
                <CopyBlock label="Weryfikacja agentów po bootstrap" text={VERIFY_BOOTSTRAP_AGENTS} />
              </div>
            )}
          </div>
        )}

        {step.id === "approve-da" && (
          <div className="space-y-4">
            <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-300">
              <li>
                Zaakceptuj węzeł poniżej (status{" "}
                <strong className="text-white">Czeka na akceptację</strong> →{" "}
                <strong className="text-white">ACTIVE</strong>).
              </li>
              <li>
                Uzupełnij <strong>DirectAdmin login key</strong> i uruchom test API — w nowej karcie
                (link poniżej), żeby nie wychodzić z wizarda.
              </li>
              <li>
                Po teście DA zaznacz checkbox i kliknij <strong>Dalej</strong> — dalej backup offsite, Onboard LIVE,
                profil hostingowy i smoke.
              </li>
            </ol>
            {serverId ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start gap-3">
                  <ApproveServerButton serverId={serverId} />
                  <Link
                    href={`/nodes/${serverId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 px-4 py-2 text-sm font-medium"
                  >
                    Konfiguracja DA i test API
                    <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                </div>
                <NodeLiveStatus serverId={serverId} onSignals={applyLiveSignals} />
              </div>
            ) : (
              <p className="text-sm text-amber-200">
                Najpierw ukończ krok „Instalacja (bootstrap v2)”.
              </p>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!checked.approve}
                onChange={() => toggleCheck("approve")}
                className="rounded border-white/20"
              />
              Węzeł zaakceptowany i test DA API OK
            </label>
            {serverId && <NodeConfigActions serverId={serverId} />}
          </div>
        )}

        {step.id === "backup-offsite" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Kopie kont idą co noc poza węzeł (szyfrowane rclone crypt, retencja 30 dni). Klienci widzą w
              panelu, że kopie są przechowywane poza serwerem — bez tej konfiguracji to byłaby nieprawda,
              dlatego onboard LIVE zatrzymuje się, dopóki jej nie ma.
            </p>
            <KopieOffsiteFormularz />
            <details className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Awaryjnie: konfiguracja ręczna na węźle</summary>
              <CopyBlock label="4b) Konfiguracja backupu offsite (root na węźle)" text={BACKUP_OFFSITE_CONF} />
            </details>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!checked.backupOffsite}
                onChange={() => toggleCheck("backupOffsite")}
                className="rounded border-white/20"
              />
              Konfiguracja zapisana, hasło i sól szyfrowania są w sejfie
            </label>
          </div>
        )}

        {step.id === "onboard-live" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>Krok obowiązkowy przed klientami LIVE.</strong> Bez niego węzeł nie ma
                hardeningu bezpieczeństwa, a provisioning może zakończyć się błędem{" "}
                <code className="text-amber-200">A valid IP was not provided</code> (brak
                publicznego IP w DirectAdmin).
              </span>
            </div>
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="font-medium text-emerald-200 mb-2 text-sm">
                Skrypt node-onboard-live.sh robi
              </p>
              <ul className="space-y-1 text-zinc-300 text-xs">
                {ONBOARD_LIVE_DOES.map((line) => (
                  <li key={line}>• {line}</li>
                ))}
              </ul>
            </div>
            {serverId ? <OnboardLivePanel serverId={serverId} /> : null}
            <details className="rounded-lg border border-white/10 px-3 py-2 text-xs text-zinc-400">
              <summary className="cursor-pointer text-zinc-300">Awaryjnie: onboard ręcznie przez SSH</summary>
              <CopyBlock label="5a) Skopiuj pakiet onboardu na węzeł" text={ONBOARD_LIVE_SCP} />
              <CopyBlock label="5b) Uruchom onboarding (root na węźle)" text={ONBOARD_LIVE_RUN} />
              <CopyBlock label="5c) Weryfikacja" text={ONBOARD_LIVE_VERIFY} />
            </details>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!checked.onboardLive}
                onChange={() => toggleCheck("onboardLive")}
                className="rounded border-white/20"
              />
              Onboard zakończony zielonym raportem (węzeł zweryfikowany)
            </label>
            {serverId && <NodeConfigActions serverId={serverId} />}
          </div>
        )}

        {step.id === "hosting-profile" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              <strong>Profil hostingowy Verris</strong> — Governor, ustawienia CustomBuild, restart
              LiteSpeed. Po akceptacji węzła uruchomisz go <strong>z panelu</strong> (agent na węźle
              wykona skrypt w ciągu ~1 min).
            </p>
            {serverId ? (
              <HostingProfilePanel
                serverId={serverId}
                serverStatus={
                  checked.approve ? "ACTIVE" : (created?.server.status ?? "PENDING_APPROVAL")
                }
                compact
              />
            ) : (
              <p className="text-sm text-amber-200">
                Najpierw ukończ krok „Instalacja (bootstrap v2)”.
              </p>
            )}
            <CopyBlock
              label="Ręcznie (SSH) — alternatywa"
              text={HOSTING_PROFILE_HINT}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox
                checked={!!checked.profile}
                onChange={() => toggleCheck("profile")}
                className="rounded border-white/20"
              />
              Profil hostingowy uruchomiony (panel lub SSH)
            </label>
            {serverId && <NodeConfigActions serverId={serverId} />}
          </div>
        )}

        {step.id === "finish" && (
          <div className="space-y-5">
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
              <p className="text-sm font-semibold text-emerald-200 mb-2">
                Definition of Done — węzeł ACTIVE
              </p>
              <ul className="space-y-1.5">
                {DOD_ACTIVE_CHECKLIST.map((item) => (
                  <CheckItem key={item}>{item}</CheckItem>
                ))}
              </ul>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Każdy punkt ma walidator w sekcji „Audyt i naprawa” na stronie węzła — uruchom audyt,
                aby potwierdzić zgodność z planem i dokumentacją (DA/CloudLinux), z atestem źródła.
              </p>
            </div>

            <ul className="space-y-2 text-sm text-zinc-300">
              <CheckItem>Smoke: zakup planu (Stripe sandbox) → provisioning konta DA.</CheckItem>
              <CheckItem>
                Grafana → dashboard <em>Compute fleet</em> — heartbeat węzła.
              </CheckItem>
              <CheckItem>HOST-4: WWW, FTP, mail hosting na koncie testowym.</CheckItem>
            </ul>

            {serverId && <NodeConfigActions serverId={serverId} />}

            <div className="flex flex-wrap gap-3">
              <WizardExternalLink href="/nodes">Lista węzłów</WizardExternalLink>
              {serverId && (
                <WizardExternalLink href={`/nodes/${serverId}#audyt`} variant="primary">
                  Uruchom audyt węzła
                </WizardExternalLink>
              )}
              <WizardExternalLink href="/status/probes">Status probes</WizardExternalLink>
            </div>
          </div>
        )}
      </section>

      <div className="flex justify-between">
        <button
          type="button"
          disabled={stepIndex === 0}
          onClick={() => setStepIndex((i) => i - 1)}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm disabled:opacity-40 hover:bg-white/5"
        >
          <ArrowLeft className="h-4 w-4" /> Wstecz
        </button>
        <button
          type="button"
          disabled={stepIndex >= WIZARD_STEPS.length - 1}
          onClick={() => setStepIndex((i) => i + 1)}
          className="inline-flex items-center gap-2 rounded-lg bg-white/10 hover:bg-white/15 px-4 py-2 text-sm disabled:opacity-40"
        >
          Dalej <ArrowRight className="h-4 w-4" />
        </button>
      </div>

      <style>{`
        .wizard-input {
          width: 100%;
          border-radius: 0.5rem;
          background: rgb(255 255 255 / 0.05);
          border: 1px solid rgb(255 255 255 / 0.1);
          padding: 0.5rem 0.75rem;
          font-size: 0.875rem;
          outline: none;
        }
        .wizard-input:focus {
          border-color: rgb(99 102 241 / 0.6);
        }
      `}</style>
    </div>
  );
}

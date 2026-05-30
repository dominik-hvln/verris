"use client";

import { useState, useTransition, useEffect } from "react";
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
import {
  BOOTSTRAP_DOES,
  BOOTSTRAP_DOES_NOT,
  HOSTING_PROFILE_HINT,
  INSTALL_CLOUDLINUX_AL10,
  INSTALL_CLOUDLINUX_AL9,
  INSTALL_DIRECTADMIN,
  INSTALL_LITESPEED_STANDALONE,
  INSTALL_LITESPEED_VIA_DA,
  INSTALL_OS_PREP,
  PREPARE_NODE_EXPORTS,
  VERIFY_CLOUDLINUX,
  WIZARD_STEPS,
} from "./wizard-content";

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
      <ChevronRight className="h-4 w-4 shrink-0 text-indigo-400 mt-0.5" />
      <span>{children}</span>
    </li>
  );
}

export function NodeWizard() {
  const searchParams = useSearchParams();
  const [stepIndex, setStepIndex] = useState(0);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [hydrated, setHydrated] = useState(false);

  const [name, setName] = useState("");
  const [hostname, setHostname] = useState("");
  const [region, setRegion] = useState("PL");
  const [notes, setNotes] = useState("");

  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<InitServerResponseDto | null>(null);
  const [scriptResp, setScriptResp] = useState<BootstrapScriptResponseDto | null>(null);
  const [scriptCopied, setScriptCopied] = useState(false);

  const step = WIZARD_STEPS[stepIndex]!;
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

  const createNodeAndScript = () => {
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
      if (APPROVE_DA_STEP_INDEX >= 0) {
        setStepIndex(APPROVE_DA_STEP_INDEX);
      }
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
        <h1 className="text-3xl font-bold text-white">Wizard nowego węzła compute</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-2xl">
          Krok po kroku: licencje vendorów (CL, DA, LS) ręcznie na serwerze, potem bootstrap Verris
          i profil hostingowy. Sekrety licencyjne <strong className="text-zinc-400">nie</strong>{" "}
          trafiają do panelu — tylko na SSH węzła.
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
            Skrypt bootstrap uruchom na węźle. Po komunikacie „Bootstrap complete” wróć do tego
            kroku (nawigacja u góry) albo przejdź do{" "}
            <button
              type="button"
              onClick={() => setStepIndex(APPROVE_DA_STEP_INDEX)}
              className="underline font-medium hover:text-white"
            >
              kroku 6 — Akceptacja i DA API
            </button>
            .
          </div>
        )}

        {step.id === "requirements" && (
          <ul className="space-y-2">
            <CheckItem>
              Osobny serwer compute (nie ten sam co control-plane Docker/Caddy).
            </CheckItem>
            <CheckItem>
              <strong>AlmaLinux 9.x</strong> (produkcja / sharedlicense DA) lub{" "}
              <strong>10.2</strong> (test, najdłuższe wsparcie — full DA na AL10).
            </CheckItem>
            <CopyBlock label="Krok 0 — przygotowanie OS (root)" text={INSTALL_OS_PREP} />
            <CheckItem>
              Min. <strong>4 GB RAM</strong> (8+ GB zalecane), dysk SSD z zapasem na konta.
            </CheckItem>
            <CheckItem>
              Węzeł musi łączyć się z <code className="text-indigo-300">https://api.verris.pl</code>{" "}
              (443).
            </CheckItem>
            <CheckItem>Licencje trial: CloudLinux, LiteSpeed, DA (sharedlicense na smoke).</CheckItem>
            <label className="flex items-center gap-2 text-sm cursor-pointer mt-4">
              <input
                type="checkbox"
                checked={!!checked.requirements}
                onChange={() => toggleCheck("requirements")}
                className="rounded border-white/20"
              />
              Serwer spełnia wymagania
            </label>
          </ul>
        )}

        {step.id === "cloudlinux" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              CloudLinux instalujesz przez <strong>konwersję</strong> AlmaLinux (CL 10 nie ma
              osobnego ISO). Agent Verris wymaga <code className="text-indigo-300">lveinfo</code>{" "}
              lub <code className="text-indigo-300">cloudlinux-statistic</code>.
            </p>
            <a
              href="https://docs.cloudlinux.com/cloudlinuxos/cloudlinux_installation/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-300 hover:underline"
            >
              Dokumentacja CloudLinux <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <CopyBlock
              label="Instalacja CL 10 (AlmaLinux 10.2 → cldeploy + reboot)"
              text={INSTALL_CLOUDLINUX_AL10}
            />
            <CopyBlock
              label="Alternatywa: CL 9 (AlmaLinux 9.x)"
              text={INSTALL_CLOUDLINUX_AL9}
            />
            <CopyBlock label="Weryfikacja po reboot" text={VERIFY_CLOUDLINUX} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked.cloudlinux}
                onChange={() => toggleCheck("cloudlinux")}
                className="rounded border-white/20"
              />
              CloudLinux + LVE działają na serwerze
            </label>
          </div>
        )}

        {step.id === "directadmin" && (
          <div className="space-y-4">
            <p className="text-sm text-zinc-300">
              Zainstaluj <strong>DirectAdmin</strong> na CloudLinux (sharedlicense OK na smoke
              HOST-1…4). Przed klientami płacącymi — docelowa licencja na IP węzła.
            </p>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100 flex gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>
                <strong>AlmaLinux 10:</strong> sharedlicense / legacy DA może nie wspierać RHEL10 —
                wtedy full license lub test na AL9. Bootstrap Verris nie instaluje DA (tylko API w
                kroku 6).
              </span>
            </div>
            <a
              href="https://docs.directadmin.com/directadmin/installation/"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-sm text-indigo-300 hover:underline"
            >
              Dokumentacja DirectAdmin <ExternalLink className="h-3.5 w-3.5" />
            </a>
            <CopyBlock label="Instalacja DirectAdmin (setup.sh)" text={INSTALL_DIRECTADMIN} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked.directadmin}
                onChange={() => toggleCheck("directadmin")}
                className="rounded border-white/20"
              />
              DirectAdmin działa (panel :2222 / custombuild dostępny)
            </label>
          </div>
        )}

        {step.id === "litespeed" && (
          <div className="space-y-4">
            <div className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-100 space-y-2">
              <p className="font-medium flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Restart SSH / długa instalacja
              </p>
              <p>
                Instalator LiteSpeed może trwać kilka–kilkanaście minut. Pełny reboot OS jest
                rzadki, ale sesja SSH może się urwać.{" "}
                <strong>Zalecenie:</strong> zainstaluj LS + LSPHP ręcznie lub uruchom bootstrap w{" "}
                <code className="text-sky-200">tmux</code> / <code className="text-sky-200">screen</code>.
                Po zerwaniu połączenia —{" "}
                <strong>uruchom ten sam skrypt ponownie</strong> (token bootstrap ważny 48 h).
              </p>
              <p>
                Najbezpieczniejsza ścieżka: <strong>LiteSpeed + LSPHP już zainstalowane</strong>{" "}
                (np. przez DA CustomBuild) — wtedy bootstrap tylko robi handshake i agenta.
              </p>
            </div>
            <CopyBlock
              label="3a) LiteSpeed + LSPHP przez DA CustomBuild (zalecane)"
              text={INSTALL_LITESPEED_VIA_DA}
            />
            <CopyBlock
              label="3b) LiteSpeed standalone (get.litespeed.sh)"
              text={INSTALL_LITESPEED_STANDALONE}
            />
            <CopyBlock label="4) Zmienne przed bootstrap Verris" text={PREPARE_NODE_EXPORTS} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked.litespeed}
                onChange={() => toggleCheck("litespeed")}
                className="rounded border-white/20"
              />
              LiteSpeed trial aktywny (lub gotowy serial do exportu na węźle)
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
                  <label className="block space-y-1 text-sm">
                    <span className="text-muted-foreground">Region</span>
                    <input
                      value={region}
                      onChange={(e) => setRegion(e.target.value)}
                      placeholder="PL-WAW"
                      className="wizard-input"
                    />
                  </label>
                </div>
                <label className="block space-y-1 text-sm">
                  <span className="text-muted-foreground">Hostname (opcjonalnie)</span>
                  <input
                    value={hostname}
                    onChange={(e) => setHostname(e.target.value)}
                    className="wizard-input"
                  />
                </label>
                {error && <p className="text-sm text-rose-300">{error}</p>}
                <button
                  type="submit"
                  disabled={isPending || !name.trim()}
                  className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium"
                >
                  {isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Server className="h-4 w-4" />
                  )}
                  Utwórz węzeł i wygeneruj skrypt
                </button>
              </form>
            ) : (
              <div className="space-y-3">
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
                  <input
                    type="checkbox"
                    checked={!!checked.bootstrap}
                    onChange={() => toggleCheck("bootstrap")}
                    className="rounded border-white/20"
                  />
                  Skrypt zakończył się komunikatem „Bootstrap complete”
                </label>
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
                Po teście DA zaznacz checkbox i kliknij <strong>Dalej</strong> — krok 7 (profil
                hostingowy) i 8 (smoke).
              </li>
            </ol>
            {serverId ? (
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
            ) : (
              <p className="text-sm text-amber-200">
                Najpierw ukończ krok 5 (utwórz węzeł i uruchom bootstrap).
              </p>
            )}
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked.approve}
                onChange={() => toggleCheck("approve")}
                className="rounded border-white/20"
              />
              Węzeł zaakceptowany i test DA API OK
            </label>
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
                Najpierw ukończ krok 5 (utwórz węzeł i bootstrap).
              </p>
            )}
            <CopyBlock
              label="Ręcznie (SSH) — alternatywa"
              text={HOSTING_PROFILE_HINT}
            />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={!!checked.profile}
                onChange={() => toggleCheck("profile")}
                className="rounded border-white/20"
              />
              Profil hostingowy uruchomiony (panel lub SSH)
            </label>
          </div>
        )}

        {step.id === "finish" && (
          <div className="space-y-4">
            <ul className="space-y-2 text-sm text-zinc-300">
              <CheckItem>
                Admin → Status → probes dla węzła (HTTP/DA-API/MySQL).
              </CheckItem>
              <CheckItem>
                Smoke: zakup planu (Stripe sandbox) → provisioning konta DA.
              </CheckItem>
              <CheckItem>
                Grafana → dashboard <em>Compute fleet</em> — heartbeat węzła.
              </CheckItem>
              <CheckItem>
                HOST-4: WWW, FTP, mail hosting na koncie testowym.
              </CheckItem>
            </ul>
            <div className="flex flex-wrap gap-3">
              <Link href="/nodes" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
                Lista węzłów
              </Link>
              {serverId && (
                <Link
                  href={`/nodes/${serverId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5 inline-flex items-center gap-2"
                >
                  Szczegóły węzła
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              )}
              <Link href="/status/probes" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
                Status probes
              </Link>
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

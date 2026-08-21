"use client";

import { useState, useTransition } from "react";
import { Save, Loader2, AlertCircle, Check, Plug } from "lucide-react";
import { updateDirectAdminConfig, testDirectAdmin } from "../actions";

interface InitialConfig {
  daHost: string;
  daPort: number;
  daUsername: string;
  daUseTls: boolean;
  daAllowInvalidCert?: boolean;
  daPasswordSet: boolean;
}

export function DirectAdminConfigForm({
  serverId,
  initial,
}: {
  serverId: string;
  initial: InitialConfig;
}) {
  const [daHost, setDaHost] = useState(initial.daHost);
  const [daPort, setDaPort] = useState<number>(initial.daPort);
  const [daUsername, setDaUsername] = useState(initial.daUsername);
  const [daPassword, setDaPassword] = useState("");
  const [daUseTls, setDaUseTls] = useState<boolean>(initial.daUseTls);
  const [daAllowInvalidCert, setDaAllowInvalidCert] = useState<boolean>(
    initial.daAllowInvalidCert ?? false,
  );
  const [hasStoredPassword, setHasStoredPassword] = useState<boolean>(initial.daPasswordSet);

  const [isSaving, startSaveTransition] = useTransition();
  const [isTesting, startTestTransition] = useTransition();

  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{
    ok: boolean;
    sampleCount?: number;
    error?: string;
  } | null>(null);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSavedAt(null);
    startSaveTransition(async () => {
      const result = await updateDirectAdminConfig(serverId, {
        daHost,
        daPort,
        daUsername,
        daUseTls,
        daAllowInvalidCert,
        daPassword: daPassword || undefined,
      });
      if ("error" in result && result.error) {
        setError(result.error);
        return;
      }
      setSavedAt(new Date());
      if (daPassword) setHasStoredPassword(true);
      setDaPassword("");
    });
  };

  const onTest = () => {
    setTestResult(null);
    startTestTransition(async () => {
      const result = await testDirectAdmin(serverId);
      if ("error" in result && result.error) {
        setTestResult({ ok: false, error: result.error });
        return;
      }
      setTestResult(result.data!);
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 backdrop-blur-md p-5 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Plug className="h-4 w-4 text-indigo-300" /> Konfiguracja DirectAdmin
          </h2>
          <p className="text-xs text-muted-foreground mt-1">
            Hasło / login key DA jest szyfrowane kluczem KMS aplikacji i nigdy nie jest zwracane
            przez API w postaci jawnej.
          </p>
        </div>
        <button
          type="button"
          onClick={onTest}
          disabled={isTesting || !hasStoredPassword}
          className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border border-white/10 bg-white/5 hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title={!hasStoredPassword ? "Zapisz najpierw login key" : ""}
        >
          {isTesting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plug className="h-3.5 w-3.5" />}
          Testuj połączenie
        </button>
      </div>

      <form onSubmit={onSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Host DA" required>
          <input
            type="text"
            required
            value={daHost}
            onChange={(e) => setDaHost(e.target.value)}
            className="form-input"
            placeholder="server.verris.com"
          />
        </Field>
        <Field label="Port" required>
          <input
            type="number"
            required
            min={1}
            max={65535}
            value={daPort}
            onChange={(e) => setDaPort(parseInt(e.target.value, 10) || 0)}
            className="form-input"
          />
        </Field>
        <Field label="Login admina DA" required>
          <input
            type="text"
            required
            value={daUsername}
            onChange={(e) => setDaUsername(e.target.value)}
            className="form-input"
          />
        </Field>
        <Field
          label={
            hasStoredPassword
              ? "Login key (pozostaw puste, aby zachować obecny)"
              : "Login key DA"
          }
          required={!hasStoredPassword}
        >
          <input
            type="password"
            required={!hasStoredPassword}
            value={daPassword}
            onChange={(e) => setDaPassword(e.target.value)}
            placeholder={hasStoredPassword ? "•••••••• zapisany" : ""}
            className="form-input"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            checked={daUseTls}
            onChange={(e) => setDaUseTls(e.target.checked)}
            className="h-4 w-4 rounded border-white/20 bg-white/5"
          />
          Wymuszaj HTTPS (TLS)
        </label>

        <label className="flex items-start gap-2 text-sm text-muted-foreground md:col-span-2">
          <input
            type="checkbox"
            checked={daAllowInvalidCert}
            onChange={(e) => setDaAllowInvalidCert(e.target.checked)}
            className="h-4 w-4 mt-0.5 rounded border-white/20 bg-white/5"
          />
          <span>
            Akceptuj niezweryfikowany certyfikat TLS (self-signed){" "}
            <span className="text-amber-300">
              — tylko na czas onboardingu. Docelowo wdroż certyfikat na :2222 (skrypt{" "}
              <code className="text-amber-200">node-directadmin-tls-http01.sh</code>) i wyłącz tę
              opcję — połączenie bez weryfikacji jest podatne na MITM.
            </span>
          </span>
        </label>
        {daAllowInvalidCert && (
          <div className="md:col-span-2 flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            Weryfikacja certyfikatu DA jest WYŁĄCZONA dla tego węzła — audyt węzła będzie to
            flagował do czasu wdrożenia poprawnego certyfikatu.
          </div>
        )}

        <div className="md:col-span-2 flex items-center gap-3 flex-wrap pt-2">
          <button
            type="submit"
            disabled={isSaving}
            className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium transition-colors"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Zapisz konfigurację
          </button>
          {savedAt && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
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

      {testResult && (
        <div
          className={`rounded-lg border px-3 py-2 text-sm flex items-center gap-2 ${
            testResult.ok
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
              : "border-rose-500/30 bg-rose-500/10 text-rose-200"
          }`}
        >
          {testResult.ok ? <Check className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {testResult.ok
            ? `Połączenie OK. DA zwróciło ${testResult.sampleCount ?? 0} domen.`
            : `Test się nie udał: ${testResult.error}`}
        </div>
      )}

      <style>{`
        .form-input { width: 100%; border-radius: 0.5rem; background-color: rgb(255 255 255 / 0.05); border: 1px solid rgb(255 255 255 / 0.1); padding: 0.5rem 0.75rem; font-size: 0.875rem; outline: none; transition: border-color 0.2s; }
        .form-input:focus { border-color: rgb(99 102 241 / 0.6); background-color: rgb(255 255 255 / 0.07); }
      `}</style>
    </section>
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

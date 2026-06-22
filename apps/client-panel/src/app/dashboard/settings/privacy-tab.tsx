"use client";

import { useEffect, useState, useTransition } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileDown,
  History,
  Loader2,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import {
  cancelAccountDeletion,
  fetchConsentHistory,
  fetchDataExports,
  fetchDeletionStatus,
  requestAccountDeletion,
  requestDataExport,
  type DataExportSummary,
  type DeletionStatus,
  type UserConsentRow,
} from "./privacy-actions";

const KIND_LABELS: Record<UserConsentRow["documentKind"], string> = {
  TERMS: "Regulamin",
  PRIVACY: "Polityka prywatności",
  COOKIES: "Polityka cookies",
  DPA: "Umowa powierzenia (DPA)",
};

const SOURCE_LABELS: Record<UserConsentRow["source"], string> = {
  REGISTRATION: "Rejestracja",
  RE_CONSENT: "Re-akceptacja",
  SETTINGS: "Ustawienia",
  ADMIN_MANUAL: "Ręczne (admin)",
};

const STATUS_LABELS: Record<DataExportSummary["status"], string> = {
  PENDING: "W kolejce",
  GENERATING: "Generowanie...",
  READY: "Gotowy do pobrania",
  EXPIRED: "Wygasł",
  FAILED: "Błąd generowania",
};

const STATUS_TONE: Record<DataExportSummary["status"], string> = {
  PENDING: "text-neutral-300",
  GENERATING: "text-sky-300",
  READY: "text-emerald-300",
  EXPIRED: "text-neutral-500",
  FAILED: "text-rose-300",
};

function formatBytes(bytes: number | null): string {
  if (!bytes || bytes <= 0) return "—";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pl-PL", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function PrivacyTab({
  showToast,
}: {
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [consents, setConsents] = useState<UserConsentRow[]>([]);
  const [exports, setExports] = useState<DataExportSummary[]>([]);
  const [deletion, setDeletion] = useState<DeletionStatus>({ active: false });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetchConsentHistory(),
      fetchDataExports(),
      fetchDeletionStatus(),
    ]).then(([c, e, d]) => {
      setConsents(c);
      setExports(e);
      setDeletion(d);
      setLoading(false);
    });
  }, []);

  const refreshExports = async () => {
    setExports(await fetchDataExports());
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="h-8 w-8 animate-spin text-white" />
        <p className="text-neutral-400">Ładowanie sekcji prywatności...</p>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-12">
      <header>
        <h2 className="text-xl font-bold text-white mb-2">Prywatność i dane</h2>
        <p className="text-neutral-400">
          Przejrzyj swoje zgody, pobierz kopię danych lub złóż wniosek o usunięcie konta zgodnie z
          RODO. Preferencje e-mail znajdziesz w zakładce „Powiadomienia".
        </p>
      </header>

      <ConsentsSection consents={consents} />
      <DataExportSection exports={exports} onRefresh={refreshExports} showToast={showToast} />
      <AccountDeletionSection
        deletion={deletion}
        onChange={setDeletion}
        showToast={showToast}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

function ConsentsSection({ consents }: { consents: UserConsentRow[] }) {
  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          Twoje zgody
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Lista wszystkich zgód udzielonych w trakcie rejestracji, ponownej akceptacji i z ustawień.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 overflow-hidden">
        {consents.length === 0 ? (
          <p className="p-6 text-sm text-neutral-500">Brak zarejestrowanych zgód.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-neutral-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Dokument</th>
                <th className="text-left font-semibold px-4 py-3">Wersja</th>
                <th className="text-left font-semibold px-4 py-3">Źródło</th>
                <th className="text-left font-semibold px-4 py-3">Data</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {consents.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-neutral-200">{KIND_LABELS[row.documentKind]}</td>
                  <td className="px-4 py-3 font-mono text-xs text-neutral-300">
                    {row.documentVersion}
                  </td>
                  <td className="px-4 py-3 text-neutral-400">{SOURCE_LABELS[row.source]}</td>
                  <td className="px-4 py-3 text-neutral-400">{formatDate(row.grantedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}

function DataExportSection({
  exports,
  onRefresh,
  showToast,
}: {
  exports: DataExportSummary[];
  onRefresh: () => Promise<void>;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [pending, startTransition] = useTransition();
  const hasActive = exports.some(
    (e) => e.status === "PENDING" || e.status === "GENERATING" || e.status === "READY",
  );

  const onRequest = () => {
    startTransition(async () => {
      const result = await requestDataExport();
      if (result.ok) {
        await onRefresh();
        showToast(
          "Eksport został zakolejkowany — wyślemy e-mail z linkiem gdy będzie gotowy.",
          "success",
        );
      } else {
        showToast(result.error, "error");
      }
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-white flex items-center gap-2">
          <FileDown className="h-4 w-4 text-sky-400" />
          Pobierz kopię swoich danych
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Realizacja prawa do przenoszenia danych (RODO art. 20). Generujemy paczkę .ndjson.gz ze
          wszystkimi Twoimi danymi w panelu (profil, faktury, tickety, audyt logów). Link do
          pobrania jest ważny 7 dni.
        </p>
      </div>
      <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-white">Nowy eksport danych</p>
          <p className="text-xs text-neutral-500 mt-0.5">
            Maksymalnie 1 aktywny eksport co 24 godziny.
          </p>
        </div>
        <button
          onClick={onRequest}
          disabled={pending || hasActive}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {hasActive ? "Eksport już aktywny" : "Wygeneruj nowy eksport"}
        </button>
      </div>

      {exports.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-[#0a0a0a]/40 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-neutral-400 text-xs uppercase tracking-wider">
              <tr>
                <th className="text-left font-semibold px-4 py-3">Status</th>
                <th className="text-left font-semibold px-4 py-3">Zażądany</th>
                <th className="text-left font-semibold px-4 py-3">Rozmiar</th>
                <th className="text-left font-semibold px-4 py-3">Wygasa</th>
                <th className="text-right font-semibold px-4 py-3">Akcja</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {exports.map((e) => (
                <tr key={e.id}>
                  <td className={`px-4 py-3 ${STATUS_TONE[e.status]}`}>
                    <span className="inline-flex items-center gap-2">
                      {e.status === "GENERATING" && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      {STATUS_LABELS[e.status]}
                    </span>
                    {e.errorMessage && (
                      <p className="text-xs text-rose-400/80 mt-1">{e.errorMessage}</p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-neutral-300">{formatDate(e.requestedAt)}</td>
                  <td className="px-4 py-3 text-neutral-300">{formatBytes(e.sizeBytes)}</td>
                  <td className="px-4 py-3 text-neutral-300">{formatDate(e.expiresAt)}</td>
                  <td className="px-4 py-3 text-right">
                    {e.status === "READY" && e.downloadUrl && (
                      <a
                        href={(process.env.NEXT_PUBLIC_API_URL ?? "") + e.downloadUrl}
                        className="inline-flex items-center gap-1 text-sky-400 hover:text-sky-300 text-xs font-semibold"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        Pobierz <Download className="h-3 w-3" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function AccountDeletionSection({
  deletion,
  onChange,
  showToast,
}: {
  deletion: DeletionStatus;
  onChange: (d: DeletionStatus) => void;
  showToast: (msg: string, type: "success" | "error") => void;
}) {
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState("");
  const [reason, setReason] = useState("");
  const [agree, setAgree] = useState(false);
  const [pending, startTransition] = useTransition();

  const onRequest = () => {
    if (!password || !agree) return;
    startTransition(async () => {
      const result = await requestAccountDeletion(password, reason || undefined);
      if (result.ok) {
        showToast(
          `Usunięcie zaplanowane na ${formatDate(result.scheduledFor)}. Możesz cofnąć w ciągu 14 dni.`,
          "success",
        );
        onChange({
          active: true,
          requestedAt: new Date().toISOString(),
          scheduledFor: result.scheduledFor,
          reason: reason || null,
        });
        setShowModal(false);
        setPassword("");
        setReason("");
        setAgree(false);
      } else {
        showToast(result.error, "error");
      }
    });
  };

  const onCancel = () => {
    startTransition(async () => {
      const result = await cancelAccountDeletion();
      if (result.ok) {
        showToast("Wniosek o usunięcie konta został anulowany.", "success");
        onChange({ active: false });
      } else {
        showToast(result.error, "error");
      }
    });
  };

  return (
    <section className="space-y-4">
      <div>
        <h3 className="text-base font-semibold text-rose-300 flex items-center gap-2">
          <ShieldAlert className="h-4 w-4" />
          Usunięcie konta
        </h3>
        <p className="text-xs text-neutral-500 mt-1">
          Realizacja prawa do bycia zapomnianym (RODO art. 17). Po wniosku konto wchodzi w 14-dniowy
          okres karencji — w tym czasie możesz cofnąć decyzję. Po 14 dniach dane osobowe są
          anonimizowane (faktury i logi rozliczeniowe pozostają zgodnie z prawem 5 lat).
        </p>
      </div>

      {deletion.active ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-500/10 p-5 space-y-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-rose-400 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-rose-200">
                Konto zaplanowane do usunięcia
              </p>
              <p className="text-xs text-rose-200/80 mt-1">
                Wniosek złożony: {formatDate(deletion.requestedAt)} · anonimizacja:{" "}
                {formatDate(deletion.scheduledFor)}
              </p>
              {deletion.reason && (
                <p className="text-xs text-rose-200/60 mt-2 italic">
                  Powód: {deletion.reason}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onCancel}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-xl border border-white/20 bg-white/5 px-5 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clock className="h-4 w-4" />}
            Cofnij wniosek o usunięcie
          </button>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/5 p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-rose-200">Strefa nieodwracalna</p>
            <p className="text-xs text-neutral-400 mt-0.5">
              Wymaga potwierdzenia hasłem. Po 14 dniach proces jest nieodwracalny.
            </p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-rose-500/10 px-5 py-2.5 text-sm font-semibold text-rose-200 hover:bg-rose-500/20"
          >
            <Trash2 className="h-4 w-4" />
            Usuń konto
          </button>
        </div>
      )}

      {showModal && (
        <div
          role="dialog"
          aria-modal
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-rose-500/30 bg-neutral-950 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-2">Usuń konto Verris</h3>
            <p className="text-xs text-neutral-400 mb-5">
              Aby kontynuować, podaj swoje aktualne hasło. Zaplanujemy usunięcie za 14 dni.
            </p>

            <div className="space-y-4">
              <input
                type="password"
                placeholder="Aktualne hasło"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              />
              <textarea
                placeholder="Powód (opcjonalnie — pomaga nam się rozwijać)"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-white/10 bg-[#0a0a0a]/50 px-4 py-2.5 text-sm text-white placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-rose-500/30 resize-none"
              />
              <label className="flex items-start gap-3 text-xs text-neutral-300">
                <input
                  type="checkbox"
                  checked={agree}
                  onChange={(e) => setAgree(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-white/20 bg-neutral-900 text-rose-500"
                />
                Rozumiem, że proces jest nieodwracalny po upływie 14 dni i moje dane osobowe zostaną
                zanonimizowane.
              </label>
            </div>

            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                onClick={() => {
                  setShowModal(false);
                  setPassword("");
                  setReason("");
                  setAgree(false);
                }}
                className="rounded-xl border border-white/10 px-4 py-2.5 text-sm text-neutral-300 hover:bg-white/5"
              >
                Anuluj
              </button>
              <button
                onClick={onRequest}
                disabled={!password || !agree || pending}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-rose-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Potwierdź usunięcie
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

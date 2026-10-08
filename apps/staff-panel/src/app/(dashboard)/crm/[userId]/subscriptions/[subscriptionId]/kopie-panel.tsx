"use client";

import { useState } from "react";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/checkbox";
import { plural } from "@/lib/pl";
import { odtworzZKopiiAction, pobierzKopieAction, type KopieKonta, type Wynik } from "./obsluga-actions";

const STATUS: Record<string, string> = {
  QUEUED: "w kolejce",
  RUNNING: "przygotowanie",
  SAFETY_BACKUP: "kopia bezpieczeństwa",
  RESTORING: "serwer odtwarza (czekam na potwierdzenie)",
  COMPLETED: "odtworzono — serwer potwierdził",
  FAILED: "nieudane",
};
const W_TOKU = ["QUEUED", "RUNNING", "SAFETY_BACKUP", "RESTORING"];
export const MIN_POWOD = 10;

/**
 * PB-44 — kopie konta i odtworzenie przez pracownika obsługi (H-18). Nadpisuje dane na żywym koncie, więc
 * operator przepisuje domenę i podaje powód (trafia do dziennika); kopia bezpieczeństwa domyślnie włączona.
 * `mozeOdtwarzac=false` → sama lista kopii, bez formularza.
 */
export function KopiePanel({
  subscriptionId,
  userId,
  domain,
  poczatkowe,
  mozeOdtwarzac,
}: {
  subscriptionId: string;
  userId: string;
  domain: string;
  poczatkowe: Wynik<KopieKonta>;
  mozeOdtwarzac: boolean;
}) {
  const [dane, setDane] = useState<KopieKonta | null>(poczatkowe.ok ? poczatkowe.data : null);
  const [bladOdczytu, setBladOdczytu] = useState<string | null>(poczatkowe.ok ? null : poczatkowe.error);
  const [backupId, setBackupId] = useState(poczatkowe.ok ? (poczatkowe.data.backups[0]?.id ?? "") : "");
  const [zakres, setZakres] = useState({ scopeFiles: true, scopeDatabases: true, scopeEmail: false });
  const [safetyBackup, setSafetyBackup] = useState(true);
  const [powod, setPowod] = useState("");
  const [potwierdzenie, setPotwierdzenie] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const odswiez = () =>
    pobierzKopieAction(subscriptionId).then((r) => {
      if (r.ok) {
        setDane(r.data);
        setBladOdczytu(null);
      } else setBladOdczytu(r.error);
    });

  const last = dane?.last ?? null;
  const wToku = !!last && W_TOKU.includes(last.status);
  const gotowe =
    !!backupId &&
    powod.trim().length >= MIN_POWOD &&
    potwierdzenie.trim().toLowerCase() === domain.toLowerCase() &&
    (zakres.scopeFiles || zakres.scopeDatabases || zakres.scopeEmail);

  const zlec = async () => {
    setBusy(true);
    setMsg(null);
    const r = await odtworzZKopiiAction({ subscriptionId, userId, backupId, ...zakres, safetyBackup, reason: powod.trim() });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: "Odtworzenie zlecone. Status odświeży się poniżej." });
    setPotwierdzenie("");
    setPowod("");
    void odswiez();
  };

  const pole = (key: keyof typeof zakres, label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-200">
      <Checkbox checked={zakres[key]} onChange={(e) => setZakres({ ...zakres, [key]: e.target.checked })} disabled={busy} />
      {label}
    </label>
  );

  return (
    <div className="space-y-3">
      {last ? (
        <p className="text-xs text-neutral-400">
          Ostatnie odtworzenie: <span className="font-mono text-neutral-200">{last.backupFileName}</span> ·{" "}
          {STATUS[last.status] ?? last.status} · {new Date(last.createdAt).toLocaleString("pl-PL")}
          {last.error ? <span className="block text-rose-300">{last.error}</span> : null}
        </p>
      ) : null}
      {bladOdczytu ? <p className="text-sm text-rose-300">{bladOdczytu}</p> : null}
      {dane?.fetchError ? (
        <p className="text-sm text-amber-200">Serwer nie oddał listy kopii — lista może być niepełna: {dane.fetchError}</p>
      ) : null}
      {!dane ? null : dane.backups.length === 0 ? (
        <p className="text-sm text-muted-foreground">Na koncie nie ma kopii do odtworzenia.</p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground">
            Na koncie: {plural(dane.backups.length, "kopia", "kopie", "kopii")}.
          </p>
          {!mozeOdtwarzac ? (
            <ul className="space-y-1 font-mono text-xs text-neutral-300">
              {dane.backups.map((b) => (
                <li key={b.id}>{b.fileName}</li>
              ))}
            </ul>
          ) : (
            <div className="space-y-3">
              <Select
                aria-label="Kopia do odtworzenia"
                value={backupId}
                onChange={setBackupId}
                disabled={busy}
                className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
                options={dane.backups.map((b) => ({ value: b.id, label: b.fileName }))}
              />
              <div className="flex flex-wrap gap-4">
                {pole("scopeFiles", "Pliki")}
                {pole("scopeDatabases", "Bazy danych")}
                {pole("scopeEmail", "Poczta")}
              </div>
              <label className="flex items-center gap-2 text-sm text-neutral-200">
                <Checkbox checked={safetyBackup} onChange={(e) => setSafetyBackup(e.target.checked)} disabled={busy} />
                Najpierw kopia bezpieczeństwa obecnego stanu (zalecane)
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-400">Powód (zapisze się w dzienniku, min. {MIN_POWOD} znaków), np. numer zgłoszenia</span>
                <textarea
                  value={powod}
                  onChange={(e) => setPowod(e.target.value)}
                  disabled={busy}
                  maxLength={500}
                  className="min-h-[60px] w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-xs text-neutral-400">
                  Odtworzenie nadpisze dane na żywym koncie klienta. Wpisz domenę, żeby potwierdzić: <span className="font-mono">{domain}</span>
                </span>
                <input
                  value={potwierdzenie}
                  onChange={(e) => setPotwierdzenie(e.target.value)}
                  disabled={busy}
                  className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-sm text-white"
                />
              </label>
              <button
                type="button"
                onClick={zlec}
                disabled={busy || !gotowe || wToku}
                className="rounded-lg border border-rose-400/40 bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-100 hover:bg-rose-500/25 disabled:opacity-50"
              >
                {wToku ? "Odtwarzanie w toku" : busy ? "Zlecanie…" : "Odtwórz konto z kopii"}
              </button>
            </div>
          )}
        </>
      )}
      {msg ? <p className={`text-sm ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
      <p className="text-[11px] text-muted-foreground">Odtworzenie na innym węźle (awaria węzła) wykonuje administrator.</p>
    </div>
  );
}

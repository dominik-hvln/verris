"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { CheckCircle2, Loader2, Play, RefreshCw, XCircle } from "lucide-react";
import {
  pobierzOffsite,
  pobierzStanOnboardu,
  uruchomOnboard,
  zapiszOffsite,
  type PodgladOffsite,
  type StanOnboardu,
} from "./onboard-actions";

const pole = "mt-1 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white";
const etykieta = "text-[10px] font-bold uppercase tracking-wider text-neutral-500";
const przycisk =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";

/** Losowy sekret do rclone crypt — generowany w przeglądarce, nie trafia nigdzie poza formularz. */
function losowy(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * PB-31 — krok 4: kopie off-site floty zapisane raz w panelu. Węzeł pobiera je sam w onboardzie
 * (rclone bez interakcji), więc na serwerze nie trzeba nic konfigurować ręcznie.
 */
export function KopieOffsiteFormularz() {
  const [stan, setStan] = useState<PodgladOffsite | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ host: "", port: "23", user: "", sciezka: "verris", retencjaDni: "30", pass: "", cryptPass: "", cryptSalt: "" });

  useEffect(() => {
    void pobierzOffsite().then((r) => {
      if (!r.ok) return setBlad(r.error);
      setStan(r.data);
      if (r.data.skonfigurowany) {
        const d = r.data;
        setF((x) => ({ ...x, host: d.host, port: String(d.port), user: d.user, sciezka: d.sciezka, retencjaDni: String(d.retencjaDni) }));
      }
    });
  }, []);

  const zapisz = () => {
    setBlad(null);
    setOk(null);
    start(async () => {
      const r = await zapiszOffsite({
        host: f.host.trim(),
        port: Number(f.port),
        user: f.user.trim(),
        sciezka: f.sciezka.trim(),
        retencjaDni: Number(f.retencjaDni),
        pass: f.pass || undefined,
        cryptPass: f.cryptPass || undefined,
        cryptSalt: f.cryptSalt || undefined,
      });
      if (!r.ok) return setBlad(r.error);
      setStan(r.data);
      setF((x) => ({ ...x, pass: "", cryptPass: "", cryptSalt: "" }));
      setOk("Zapisane. Każdy węzeł pobierze tę konfigurację w onboardzie.");
    });
  };

  const ustaw = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pierwszyZapis = !stan || !stan.skonfigurowany;

  return (
    <div className="space-y-3 rounded-xl border border-white/10 p-4">
      <p className="text-sm text-white">
        Kopie off-site floty:{" "}
        <strong className={stan?.skonfigurowany ? "text-emerald-300" : "text-amber-300"}>
          {stan === null ? "…" : stan.skonfigurowany ? "skonfigurowane" : "brak"}
        </strong>
      </p>
      <p className="text-xs text-zinc-400">
        Hetzner Storage Box przez SFTP (port 23) + szyfrowanie rclone crypt. Te same hasła dla całej floty —
        tylko wtedy konto z utraconego węzła odtworzysz na innym. Hasło i sól szyfrowania zapisz w sejfie poza
        panelem: bez nich kopii nie odczytasz. Pola haseł zostaw puste, żeby nie zmieniać zapisanych.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={etykieta}>Host Storage Boxa</span><input className={pole} value={f.host} onChange={ustaw("host")} placeholder="u123456.your-storagebox.de" /></label>
        <label className="block"><span className={etykieta}>Port</span><input className={pole} inputMode="numeric" value={f.port} onChange={ustaw("port")} /></label>
        <label className="block"><span className={etykieta}>Użytkownik</span><input className={pole} value={f.user} onChange={ustaw("user")} placeholder="u123456" /></label>
        <label className="block"><span className={etykieta}>Hasło Storage Boxa</span><input className={pole} type="password" autoComplete="new-password" value={f.pass} onChange={ustaw("pass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Katalog na Storage Boxie</span><input className={pole} value={f.sciezka} onChange={ustaw("sciezka")} /></label>
        <label className="block"><span className={etykieta}>Retencja (dni)</span><input className={pole} inputMode="numeric" value={f.retencjaDni} onChange={ustaw("retencjaDni")} /></label>
        <label className="block"><span className={etykieta}>Hasło szyfrowania (min. 16 znaków)</span><input className={pole} type="password" autoComplete="new-password" value={f.cryptPass} onChange={ustaw("cryptPass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Sól szyfrowania (min. 16 znaków)</span><input className={pole} type="password" autoComplete="new-password" value={f.cryptSalt} onChange={ustaw("cryptSalt")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
      </div>
      {pierwszyZapis ? (
        <button
          type="button"
          className="text-xs font-semibold text-emerald-300 underline underline-offset-2"
          onClick={() => setF((x) => ({ ...x, cryptPass: losowy(), cryptSalt: losowy() }))}
        >
          Wygeneruj hasło i sól szyfrowania
        </button>
      ) : (
        <p className="text-xs text-amber-200">Zmiana hasła lub soli szyfrowania odcina dostęp do wcześniejszych kopii — rób to tylko świadomie.</p>
      )}
      <div>
        <button type="button" className={przycisk} disabled={pending} onClick={zapisz}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz konfigurację kopii
        </button>
      </div>
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
      {ok ? <p className="text-sm text-emerald-300" role="status">{ok}</p> : null}
    </div>
  );
}

const STATUS: Record<string, string> = { QUEUED: "w kolejce", RUNNING: "trwa", COMPLETED: "zakończone", FAILED: "błąd", CANCELLED: "anulowane" };

/**
 * PB-31 — krok 5: Onboard LIVE z panelu. Agent pobiera pakiet, sam bierze klucz admina DA
 * (`da api-url`) i konfigurację kopii, a raport gotowości decyduje o przydziale kont.
 */
export function OnboardLivePanel({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<StanOnboardu | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const odswiez = useCallback(async () => {
    const r = await pobierzStanOnboardu(serverId);
    if (r.ok) setStan(r.data);
    else setBlad(r.error);
  }, [serverId]);

  useEffect(() => {
    void pobierzStanOnboardu(serverId).then((r) => (r.ok ? setStan(r.data) : setBlad(r.error)));
  }, [serverId]);

  useEffect(() => {
    if (!stan?.trwa) return;
    const t = setInterval(() => void odswiez(), 10_000);
    return () => clearInterval(t);
  }, [stan?.trwa, odswiez]);

  const uruchom = () => {
    setBlad(null);
    start(async () => {
      const r = await uruchomOnboard(serverId);
      if (!r.ok) setBlad(r.error);
      await odswiez();
    });
  };

  const raport = stan?.raport;
  return (
    <div className="space-y-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={przycisk} disabled={pending || stan?.trwa} onClick={uruchom}>
          {pending || stan?.trwa ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
          {stan?.trwa ? "Onboard trwa…" : "Uruchom Onboard LIVE z panelu"}
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-xs text-zinc-300 hover:text-white" onClick={() => void odswiez()}>
          <RefreshCw className="h-3.5 w-3.5" /> Odśwież
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        Agent na węźle pobiera pakiet onboardu do /opt/verris, bierze tymczasowy klucz admina DirectAdmina
        (<code>da api-url</code>) i konfigurację kopii z kroku 4. Trwa kilkanaście minut (profil hostingu).
      </p>
      {stan?.zadanie ? (
        <p className="text-sm text-white">
          Ostatnie zadanie: <strong>{STATUS[stan.zadanie.status] ?? stan.zadanie.status}</strong>{" "}
          <span className="text-zinc-400">({new Date(stan.zadanie.createdAt).toLocaleString("pl-PL")})</span>
          {stan.zadanie.errorMessage ? <span className="block text-xs text-rose-300">{stan.zadanie.errorMessage}</span> : null}
        </p>
      ) : null}
      {stan ? (
        <p className="flex items-center gap-2 text-sm">
          {stan.zweryfikowany ? <CheckCircle2 className="h-4 w-4 text-emerald-300" /> : <XCircle className="h-4 w-4 text-amber-300" />}
          {stan.zweryfikowany
            ? `Węzeł zweryfikowany ${new Date(stan.zweryfikowany).toLocaleString("pl-PL")} — przyjmuje nowe konta.`
            : "Węzeł nie jest zweryfikowany — nie dostaje nowych kont."}
        </p>
      ) : null}
      {raport?.podsumowanie ? (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-black/60 p-3 text-xs text-zinc-200">{raport.podsumowanie}</pre>
      ) : null}
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
    </div>
  );
}

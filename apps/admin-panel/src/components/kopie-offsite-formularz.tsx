"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/checkbox";
import { pobierzOffsite, zapiszOffsite, type PodgladOffsite } from "./kopie-offsite-actions";

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
 * PB-31 — kopie off-site floty zapisane raz w panelu (Ustawienia → Kopie offsite i krok 4 kreatora). Węzeł pobiera je sam w onboardzie
 * (rclone bez interakcji), więc na serwerze nie trzeba nic konfigurować ręcznie.
 */
export function KopieOffsiteFormularz() {
  const [stan, setStan] = useState<PodgladOffsite | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ host: "", port: "23", user: "", sciezka: "verris", retencjaDni: "30", pass: "", cryptPass: "", cryptSalt: "" });
  // Hasło i sól szyfrowania trzeba zobaczyć i skopiować PRZED zapisem — panel ich potem nie pokaże,
  // a bez nich kopii nie odczyta nikt (28.09: wygenerowane wartości były niewidoczne w polach password).
  const [pokazSekrety, setPokazSekrety] = useState(false);
  const [wSejfie, setWSejfie] = useState(false);
  const [skopiowano, setSkopiowano] = useState(false);
  const noweSekrety = Boolean(f.cryptPass || f.cryptSalt);

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
      setPokazSekrety(false);
      setWSejfie(false);
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
        <label className="block"><span className={etykieta}>Hasło szyfrowania (min. 16 znaków)</span><input className={`${pole} font-mono`} type={pokazSekrety ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={f.cryptPass} onChange={ustaw("cryptPass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Sól szyfrowania (min. 16 znaków)</span><input className={`${pole} font-mono`} type={pokazSekrety ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={f.cryptSalt} onChange={ustaw("cryptSalt")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
      </div>
      <div className="flex flex-wrap items-center gap-4 text-xs">
        <button
          type="button"
          className="font-semibold text-emerald-300 underline underline-offset-2"
          onClick={() => {
            setF((x) => ({ ...x, cryptPass: losowy(), cryptSalt: losowy() }));
            setPokazSekrety(true);
            setWSejfie(false);
          }}
        >
          Wygeneruj hasło i sól szyfrowania
        </button>
        <button type="button" className="inline-flex items-center gap-1 text-zinc-300 hover:text-white" onClick={() => setPokazSekrety((v) => !v)}>
          {pokazSekrety ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />} {pokazSekrety ? "Ukryj" : "Pokaż"} hasło i sól
        </button>
        {noweSekrety ? (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-zinc-300 hover:text-white"
            onClick={() => {
              void navigator.clipboard
                .writeText(`Verris — kopie off-site (rclone crypt)\nHasło szyfrowania: ${f.cryptPass}\nSól szyfrowania: ${f.cryptSalt}\n`)
                .then(() => { setSkopiowano(true); setTimeout(() => setSkopiowano(false), 2000); });
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {skopiowano ? "Skopiowano" : "Kopiuj oba"}
          </button>
        ) : null}
      </div>
      {pierwszyZapis ? null : (
        <p className="text-xs text-amber-200">Zmiana hasła lub soli szyfrowania odcina dostęp do wcześniejszych kopii — rób to tylko świadomie.</p>
      )}
      {noweSekrety ? (
        <label className="flex items-start gap-2 text-xs text-zinc-300">
          <Checkbox checked={wSejfie} onChange={(e) => setWSejfie(e.target.checked)} className="mt-0.5" />
          Hasło i sól szyfrowania są zapisane w menedżerze haseł. Panel ich później nie pokaże, a bez nich kopii nie odczytamy.
        </label>
      ) : null}
      <div>
        <button type="button" className={przycisk} disabled={pending || (noweSekrety && !wSejfie)} onClick={zapisz}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz konfigurację kopii
        </button>
      </div>
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
      {ok ? <p className="text-sm text-emerald-300" role="status">{ok}</p> : null}
    </div>
  );
}

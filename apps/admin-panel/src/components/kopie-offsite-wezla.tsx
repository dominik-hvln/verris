"use client";

import { useEffect, useState, useTransition } from "react";
import { Copy, Eye, EyeOff, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/checkbox";
import { pobierzOffsiteWezla, ustawTylkoPerWezel, zapiszOffsiteWezla, type PodgladOffsiteWezla } from "./kopie-offsite-actions";

const pole = "mt-1 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white";
const etykieta = "text-[10px] font-bold uppercase tracking-wider text-neutral-500";
const przycisk =
  "inline-flex items-center gap-2 rounded-lg bg-emerald-700 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-600 disabled:opacity-50";

function losowy(): string {
  const b = new Uint8Array(24);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
}

/**
 * Audyt 13.10 (#11) — własne dane kopii off-site węzła. Wspólny zestaw floty dawał rootowi JEDNEGO węzła odczyt,
 * odszyfrowanie i kasowanie kopii wszystkich węzłów. Tu: subkonto Storage Boxa ograniczone do katalogu węzła, subkonto
 * tylko do odczytu tego katalogu (odtworzenie konta na innym węźle) i własne hasło szyfrowania. Węzeł przechodzi na nie
 * przy najbliższym Onboard LIVE. Tylko admin — to klucze do kopii klientów węzła.
 */
export function KopieOffsiteWezla({ serverId }: { serverId: string }) {
  const [stan, setStan] = useState<PodgladOffsiteWezla | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [f, setF] = useState({ host: "", port: "23", user: "", sciezka: "", pass: "", roUser: "", roPass: "", cryptPass: "", cryptSalt: "" });
  const [pokazSekrety, setPokazSekrety] = useState(false);
  const [wSejfie, setWSejfie] = useState(false);
  const [skopiowano, setSkopiowano] = useState(false);
  const noweSekrety = Boolean(f.cryptPass || f.cryptSalt);

  useEffect(() => {
    void pobierzOffsiteWezla(serverId).then((r) => {
      if (!r.ok) return setBlad(r.error);
      setStan(r.data);
      if (r.data.wlasne) {
        const d = r.data;
        setF((x) => ({ ...x, host: d.host, port: String(d.port), user: d.user, sciezka: d.sciezka, roUser: d.roUser ?? "" }));
      }
    });
  }, [serverId]);

  const ustaw = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((x) => ({ ...x, [k]: e.target.value }));
  const pierwszyZapis = !stan || !stan.wlasne;

  const zapisz = () => {
    setBlad(null);
    setOk(null);
    start(async () => {
      const r = await zapiszOffsiteWezla(serverId, {
        host: f.host.trim(),
        port: Number(f.port),
        user: f.user.trim(),
        sciezka: f.sciezka.trim(),
        pass: f.pass || undefined,
        roUser: f.roUser.trim() || undefined,
        roPass: f.roPass || undefined,
        cryptPass: f.cryptPass || undefined,
        cryptSalt: f.cryptSalt || undefined,
      });
      if (!r.ok) return setBlad(r.error);
      setStan(r.data);
      setF((x) => ({ ...x, pass: "", roPass: "", cryptPass: "", cryptSalt: "" }));
      setPokazSekrety(false);
      setWSejfie(false);
      setOk("Zapisane. Węzeł przejdzie na te dane przy najbliższym Onboard LIVE (Aktualizacje → Uruchom Onboard LIVE).");
    });
  };

  const przelaczTylko = (wlacz: boolean) => {
    setBlad(null);
    start(async () => {
      const r = await ustawTylkoPerWezel(wlacz);
      if (!r.ok) return setBlad(r.error);
      setStan((s) => (s ? { ...s, tylkoPerWezel: r.data.tylkoPerWezel } : s));
    });
  };

  return (
    <section className="space-y-3 rounded-xl border border-white/10 p-4" aria-label="Kopie off-site tego węzła">
      <h2 className="font-display text-[17px] font-bold text-white">Kopie off-site tego węzła</h2>
      <p className="text-sm text-white">
        Dane kopii:{" "}
        <strong className={stan?.wlasne ? "text-emerald-300" : "text-amber-300"}>
          {stan === null ? "…" : stan.wlasne ? "własne (subkonto tego węzła)" : "wspólne dla floty"}
        </strong>
      </p>
      <p className="text-xs text-zinc-400">
        Wspólne dane floty dają rootowi każdego węzła dostęp do kopii wszystkich węzłów. Załóż w konsoli Hetznera dwa
        subkonta Storage Boxa z katalogiem tego węzła: jedno do zapisu, drugie tylko do odczytu (to drugie posłuży do
        odtworzenia konta na innym węźle). Hasło i sól szyfrowania wygeneruj tutaj i zapisz w sejfie — bez nich kopii
        tego węzła nikt nie odczyta. Pola haseł zostaw puste, żeby nie zmieniać zapisanych.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block"><span className={etykieta}>Host Storage Boxa</span><input className={pole} value={f.host} onChange={ustaw("host")} placeholder="u123456.your-storagebox.de" /></label>
        <label className="block"><span className={etykieta}>Port</span><input className={pole} inputMode="numeric" value={f.port} onChange={ustaw("port")} /></label>
        <label className="block"><span className={etykieta}>Subkonto (zapis)</span><input className={pole} value={f.user} onChange={ustaw("user")} placeholder="u123456-sub1" /></label>
        <label className="block"><span className={etykieta}>Hasło subkonta (zapis)</span><input className={pole} type="password" autoComplete="new-password" value={f.pass} onChange={ustaw("pass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Subkonto tylko do odczytu</span><input className={pole} value={f.roUser} onChange={ustaw("roUser")} placeholder="u123456-sub2" /></label>
        <label className="block"><span className={etykieta}>Hasło subkonta tylko do odczytu</span><input className={pole} type="password" autoComplete="new-password" value={f.roPass} onChange={ustaw("roPass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Katalog w subkoncie (zwykle pusty)</span><input className={pole} value={f.sciezka} onChange={ustaw("sciezka")} /></label>
        <span />
        <label className="block"><span className={etykieta}>Hasło szyfrowania węzła (min. 16 znaków)</span><input className={`${pole} font-mono`} type={pokazSekrety ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={f.cryptPass} onChange={ustaw("cryptPass")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
        <label className="block"><span className={etykieta}>Sól szyfrowania węzła (min. 16 znaków)</span><input className={`${pole} font-mono`} type={pokazSekrety ? "text" : "password"} autoComplete="new-password" spellCheck={false} value={f.cryptSalt} onChange={ustaw("cryptSalt")} placeholder={pierwszyZapis ? "" : "bez zmian"} /></label>
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
                .writeText(`Verris — kopie off-site węzła ${serverId} (rclone crypt)\nHasło szyfrowania: ${f.cryptPass}\nSól szyfrowania: ${f.cryptSalt}\n`)
                .then(() => { setSkopiowano(true); setTimeout(() => setSkopiowano(false), 2000); });
            }}
          >
            <Copy className="h-3.5 w-3.5" /> {skopiowano ? "Skopiowano" : "Kopiuj oba"}
          </button>
        ) : null}
      </div>
      {noweSekrety ? (
        <label className="flex items-start gap-2 text-xs text-zinc-300">
          <Checkbox checked={wSejfie} onChange={(e) => setWSejfie(e.target.checked)} className="mt-0.5" />
          Hasło i sól szyfrowania tego węzła są zapisane w menedżerze haseł. Panel ich później nie pokaże.
        </label>
      ) : null}
      <div>
        <button type="button" className={przycisk} disabled={pending || (noweSekrety && !wSejfie)} onClick={zapisz}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz dane kopii węzła
        </button>
      </div>
      {stan ? (
        <label className="flex items-start gap-2 border-t border-white/10 pt-3 text-xs text-zinc-300">
          <Checkbox checked={stan.tylkoPerWezel} disabled={pending} onChange={(e) => przelaczTylko(e.target.checked)} className="mt-0.5" />
          Cała flota: węzeł bez własnych danych nie dostaje wspólnych (włącz, gdy każdy węzeł ma już własne subkonto).
        </label>
      ) : null}
      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
      {ok ? <p className="text-sm text-emerald-300" role="status">{ok}</p> : null}
    </section>
  );
}

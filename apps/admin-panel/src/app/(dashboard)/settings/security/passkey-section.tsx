"use client";

import { useEffect, useState, useTransition } from "react";
import { startRegistration } from "@simplewebauthn/browser";
import { Fingerprint, Loader2, Trash2, ShieldCheck } from "lucide-react";
import {
  deletePasskey,
  getPasskeyRegisterOptions,
  listPasskeys,
  verifyPasskeyRegister,
  type PasskeyCredential,
} from "./actions";

export function PasskeySection({ enrollHint }: { enrollHint?: boolean }) {
  const [creds, setCreds] = useState<PasskeyCredential[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const supported =
    typeof window !== "undefined" && typeof window.PublicKeyCredential !== "undefined";

  const load = () => {
    void listPasskeys().then((res) => {
      if ("data" in res && res.data) setCreds(res.data);
      setLoaded(true);
    });
  };
  useEffect(load, []);

  const onRegister = () => {
    setError(null);
    setOk(null);
    startTransition(async () => {
      const opt = await getPasskeyRegisterOptions();
      if ("error" in opt && opt.error) {
        setError(opt.error);
        return;
      }
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const resp = await startRegistration({ optionsJSON: (opt as any).data });
        const res = await verifyPasskeyRegister(resp, deviceName.trim() || undefined);
        if ("error" in res && res.error) {
          setError(res.error);
          return;
        }
        setOk("Passkey dodany. Od teraz loguj się nim do Verris Core.");
        setDeviceName("");
        load();
      } catch (e) {
        setError(
          e instanceof Error && e.name === "NotAllowedError"
            ? "Anulowano dodawanie passkey."
            : "Nie udało się dodać passkey na tym urządzeniu.",
        );
      }
    });
  };

  const onDelete = (id: string) => {
    startTransition(async () => {
      await deletePasskey(id);
      load();
    });
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-black/40 p-5 space-y-4">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-indigo-300" /> Passkeys
        </h2>
        <p className="text-xs text-muted-foreground mt-1">
          Logowanie passkey jest odporne na phishing i jest podstawową metodą logowania do
          panelu administratora. Dodaj co najmniej jeden passkey i zapasowy (np. drugie
          urządzenie lub klucz sprzętowy).
        </p>
      </div>

      {enrollHint && creds.length === 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-200">
          To konto wymaga skonfigurowania passkey. Dodaj go teraz, aby dokończyć zabezpieczenie.
        </div>
      )}

      {!supported && (
        <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          Ta przeglądarka nie obsługuje passkey.
        </div>
      )}

      {loaded && (
        <div className="space-y-2">
          {creds.length === 0 && (
            <p className="text-sm text-muted-foreground">Brak zarejestrowanych passkey.</p>
          )}
          {creds.map((c) => (
            <div
              key={c.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm"
            >
              <div>
                <p className="text-white">{c.name || "Passkey"}</p>
                <p className="text-xs text-muted-foreground">
                  {c.deviceType ?? "—"} · dodano {new Date(c.createdAt).toLocaleDateString("pl-PL")}
                  {c.lastUsedAt
                    ? ` · ostatnio ${new Date(c.lastUsedAt).toLocaleDateString("pl-PL")}`
                    : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => onDelete(c.id)}
                disabled={isPending}
                className="shrink-0 p-1.5 rounded border border-white/10 hover:bg-rose-500/10 hover:border-rose-500/40 disabled:opacity-50"
                title="Usuń passkey"
              >
                <Trash2 className="h-3.5 w-3.5 text-rose-300" />
              </button>
            </div>
          ))}
        </div>
      )}

      {supported && (
        <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
          <label className="flex-1 space-y-1">
            <span className="text-xs font-medium text-muted-foreground">Nazwa urządzenia (opcjonalnie)</span>
            <input
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="np. MacBook służbowy"
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60"
            />
          </label>
          <button
            type="button"
            onClick={onRegister}
            disabled={isPending}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-4 py-2 text-sm font-medium text-white"
          >
            {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
            Dodaj passkey
          </button>
        </div>
      )}

      {ok && <p className="text-sm text-emerald-300">{ok}</p>}
      {error && <p className="text-sm text-rose-300">{error}</p>}
    </section>
  );
}

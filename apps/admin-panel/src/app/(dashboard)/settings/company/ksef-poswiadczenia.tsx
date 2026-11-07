"use client";

import { useId, useState, useTransition } from "react";
import { AlertCircle, Check, KeyRound, Loader2, Trash2 } from "lucide-react";
import { Select } from "@/components/select";
import { usunCertyfikatKsef, wgrajCertyfikatKsef, type CertyfikatKsef, type KsefSettings } from "./actions";

/**
 * KSeF 07.11 — certyfikaty KSeF w Ustawienia → Firma → KSeF:
 *  - „do uwierzytelnienia” (typ Authentication) — logowanie automatu do KSeF podpisem XAdES,
 *  - „Offline” — wyłącznie do KODU II na fakturach wystawionych w trybie offline.
 * Pliki czytane w przeglądarce i wysyłane jako Base64 (PEM i DER działają tak samo). Klucz prywatny
 * API szyfruje kluczem KMS i nigdy go nie zwraca — tu widać tylko dane jawne certyfikatu.
 */

const POLE = "w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm outline-none focus:border-indigo-500/60";

async function plikBase64(plik: File): Promise<string> {
  const bajty = new Uint8Array(await plik.arrayBuffer());
  let bin = "";
  for (const b of bajty) bin += String.fromCharCode(b);
  // PEM zostaje tekstem (API rozpoznaje nagłówek), DER idzie jako Base64.
  return bin.includes("-----BEGIN") ? bin : btoa(bin);
}

/** Wybór pliku po polsku — systemowe pole („Choose file”) ukryte, jak w bazie wiedzy AI. */
function PolePliku({ etykieta, accept, plik, onWybor }: { etykieta: string; accept: string; plik: File | null; onWybor: (f: File | null) => void }) {
  return (
    <label className="block space-y-1 cursor-pointer">
      <span className="text-xs font-medium text-muted-foreground">{etykieta}</span>
      <span className={`${POLE} flex items-center justify-between gap-2`}>
        <span className="truncate">{plik ? plik.name : "Nie wybrano pliku"}</span>
        <span className="shrink-0 rounded border border-white/15 px-2 py-0.5 text-xs">Wybierz plik</span>
      </span>
      <input type="file" accept={accept} className="hidden" onChange={(e) => onWybor(e.target.files?.[0] ?? null)} />
    </label>
  );
}

export function OpisCertyfikatu({ c }: { c: CertyfikatKsef }) {
  const ton = c.dniDoWygasniecia < 0 ? "text-rose-300" : c.dniDoWygasniecia < 30 ? "text-amber-300" : "text-emerald-300";
  return (
    <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-0.5 text-xs text-neutral-300">
      <dt className="text-muted-foreground">Podmiot</dt>
      <dd className="break-all">{c.podmiot}</dd>
      <dt className="text-muted-foreground">Numer seryjny</dt>
      <dd className="font-mono break-all">{c.numerSeryjny}</dd>
      <dt className="text-muted-foreground">Ważny</dt>
      <dd className={ton}>
        {c.waznyOd.slice(0, 10)} – {c.waznyDo.slice(0, 10)}{" "}
        {c.dniDoWygasniecia < 0 ? "(wygasł)" : `(zostało ${c.dniDoWygasniecia} dni)`}
      </dd>
      <dt className="text-muted-foreground">Klucz</dt>
      <dd>{c.algorytm}</dd>
      {c.typIdentyfikatora && (
        <>
          <dt className="text-muted-foreground">Identyfikacja</dt>
          <dd>{c.typIdentyfikatora === "certificateFingerprint" ? "odcisk certyfikatu (SHA-256)" : "NIP/PESEL z certyfikatu"}</dd>
        </>
      )}
    </dl>
  );
}

function SlotCertyfikatu({
  rodzaj,
  tytul,
  opis,
  certyfikat,
  onZmiana,
}: {
  rodzaj: "uwierzytelnianie" | "offline";
  tytul: string;
  opis: string;
  certyfikat: CertyfikatKsef | null;
  onZmiana: (s: KsefSettings) => void;
}) {
  const typId = useId();
  const [plikCert, setPlikCert] = useState<File | null>(null);
  const [plikKlucz, setPlikKlucz] = useState<File | null>(null);
  const [haslo, setHaslo] = useState("");
  const [typ, setTyp] = useState<"certificateSubject" | "certificateFingerprint">(certyfikat?.typIdentyfikatora ?? "certificateSubject");
  const [blad, setBlad] = useState<string | null>(null);
  const [ostrzezenia, setOstrzezenia] = useState<string[]>([]);
  const [zapisano, setZapisano] = useState(false);
  const [pending, start] = useTransition();

  const wgraj = () => {
    if (!plikCert || !plikKlucz) {
      setBlad("Wybierz plik certyfikatu (.crt/.cer/.pem) i plik klucza prywatnego (.key/.pem).");
      return;
    }
    setBlad(null);
    setZapisano(false);
    start(async () => {
      const res = await wgrajCertyfikatKsef({
        rodzaj,
        certyfikat: await plikBase64(plikCert),
        klucz: await plikBase64(plikKlucz),
        haslo: haslo || undefined,
        ...(rodzaj === "uwierzytelnianie" ? { typIdentyfikatora: typ } : {}),
      });
      setHaslo("");
      if ("error" in res && res.error) setBlad(res.error);
      else if ("data" in res && res.data) {
        setOstrzezenia(res.data.ostrzezenia);
        setZapisano(true);
        setPlikCert(null);
        setPlikKlucz(null);
        onZmiana(res.data.ustawienia);
      }
    });
  };

  const usun = () => {
    setBlad(null);
    start(async () => {
      const res = await usunCertyfikatKsef(rodzaj);
      if ("error" in res && res.error) setBlad(res.error);
      else if ("data" in res && res.data) onZmiana(res.data);
    });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-black/20 p-4 space-y-3">
      <div>
        <p className="text-sm font-medium text-white flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-indigo-300" /> {tytul}
        </p>
        <p className="text-xs text-muted-foreground mt-1">{opis}</p>
      </div>
      {certyfikat ? <OpisCertyfikatu c={certyfikat} /> : <p className="text-xs text-amber-300">Nie wgrano certyfikatu.</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <PolePliku etykieta="Certyfikat (.crt / .cer / .pem)" accept=".crt,.cer,.pem,.der" plik={plikCert} onWybor={setPlikCert} />
        <PolePliku etykieta="Klucz prywatny (.key / .pem)" accept=".key,.pem,.der" plik={plikKlucz} onWybor={setPlikKlucz} />
        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">Hasło do klucza (jeśli jest zaszyfrowany)</span>
          <input type="password" autoComplete="off" value={haslo} onChange={(e) => setHaslo(e.target.value)} className={POLE} />
        </label>
        {rodzaj === "uwierzytelnianie" && (
          <div className="block space-y-1">
            <label htmlFor={typId} className="text-xs font-medium text-muted-foreground">Identyfikacja w KSeF</label>
            <Select
              id={typId}
              value={typ}
              onChange={(v) => setTyp(v as "certificateSubject" | "certificateFingerprint")}
              className={POLE}
              options={[
                { value: "certificateSubject", label: "NIP/PESEL z certyfikatu (zwykle)" },
                { value: "certificateFingerprint", label: "Odcisk certyfikatu (uprawnienia nadane na odcisk)" },
              ]}
            />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={wgraj}
          disabled={pending}
          className="inline-flex items-center gap-2 rounded-lg bg-indigo-500 hover:bg-indigo-600 disabled:opacity-60 px-3 py-1.5 text-sm font-medium text-white"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          {certyfikat ? "Wgraj nowy certyfikat" : "Wgraj certyfikat"}
        </button>
        {certyfikat && (
          <button
            type="button"
            onClick={usun}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg border border-white/15 hover:bg-white/5 px-3 py-1.5 text-sm"
          >
            <Trash2 className="h-4 w-4" /> Usuń
          </button>
        )}
        {zapisano && (
          <span className="text-xs text-emerald-300 inline-flex items-center gap-1">
            <Check className="h-3 w-3" /> Zapisano
          </span>
        )}
      </div>
      {ostrzezenia.map((o) => (
        <p key={o} className="text-xs text-amber-300">{o}</p>
      ))}
      {blad && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-200">
          <AlertCircle className="h-4 w-4" /> {blad}
        </div>
      )}
    </div>
  );
}

export function KsefPoswiadczenia({ cfg, onZmiana }: { cfg: KsefSettings; onZmiana: (s: KsefSettings) => void }) {
  return (
    <div className="space-y-3">
      <SlotCertyfikatu
        rodzaj="uwierzytelnianie"
        tytul="Certyfikat KSeF do uwierzytelnienia (typ Authentication)"
        opis="Automat loguje się nim do KSeF (podpis XAdES). Wystaw go w Aplikacji Podatnika KSeF (Certyfikaty → typ „Uwierzytelnianie”) dla właściwego środowiska i wgraj tu certyfikat z kluczem."
        certyfikat={cfg.certyfikatUwierzytelniania}
        onZmiana={onZmiana}
      />
      <SlotCertyfikatu
        rodzaj="offline"
        tytul="Certyfikat KSeF typu Offline (KOD II)"
        opis="Podpisuje drugi kod QR („CERTYFIKAT”) na fakturach wystawionych, gdy KSeF był niedostępny. Bez niego faktura offline nie spełnia wymogu dwóch kodów QR. Zalecany klucz EC (krótszy kod QR)."
        certyfikat={cfg.certyfikatOffline}
        onZmiana={onZmiana}
      />
    </div>
  );
}

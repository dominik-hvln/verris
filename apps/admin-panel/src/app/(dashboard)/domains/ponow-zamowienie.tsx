"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { ponowZamowienieAction, sprawdzTransferyAction } from "./actions";

/**
 * F2.7 (OI-09) — „Ponów” przy nieudanej rejestracji albo transferze: nowe zamówienie na tego samego abonenta
 * z opłatą z portfela klienta (pierwsza wróciła albo nie została pobrana). Powód obowiązkowy; przy transferze
 * można podać nowy kod EPP od klienta. Bez DOMAINS_MANAGE przycisk jest wyszarzony.
 */
const MIN_POWOD = 10;
const POLE = "w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white";

export function PonowZamowienie(p: { orderId: string; domena: string; typ: string; kwota: string | null; zablokowane: string | null; moznaPonowic: boolean }) {
  const router = useRouter();
  const [otwarte, setOtwarte] = useState(false);
  const [powod, setPowod] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [kod, setKod] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  if (!p.moznaPonowic) {
    return <span className="text-xs text-muted-foreground">Bez danych abonenta — klient musi zamówić ponownie</span>;
  }
  if (!otwarte) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          data-ponow={p.orderId}
          disabled={!!p.zablokowane}
          title={p.zablokowane ?? undefined}
          onClick={() => setOtwarte(true)}
          className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white disabled:opacity-50"
        >
          Ponów
        </button>
        <Pomoc id="ponowienie-rejestracji" />
      </span>
    );
  }
  const wykonaj = async () => {
    const rodzaj = p.typ === "TRANSFER" ? "transfer" : "rejestrację";
    if (!(await potwierdz(`Ponowić ${rodzaj} ${p.domena}? Opłata${p.kwota ? ` (ok. ${p.kwota} zł)` : ""} zejdzie z portfela klienta, a klient zobaczy wpis „obsługa Verris”.`, { akcja: "Ponów" }))) return;
    start(async () => {
      let r: Awaited<ReturnType<typeof ponowZamowienieAction>>;
      try {
        r = await ponowZamowienieAction(p.orderId, { powod, zgloszenie, authCode: kod });
      } catch {
        r = { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
      }
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: r.wynik.status === "SUBMITTED" ? "Transfer zlecony ponownie — czeka na rejestr." : "Domena zarejestrowana." });
      router.refresh();
    });
  };
  return (
    <div className="flex w-full flex-col gap-2" data-formularz-ponow={p.orderId}>
      <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} placeholder={`Powód (min. ${MIN_POWOD} znaków)`} aria-label="Powód" className={POLE} />
      <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} disabled={pending} placeholder="#ab12cd34 (zgłoszenie klienta, opcjonalnie)" aria-label="Numer zgłoszenia" className={`${POLE} font-mono`} />
      {p.typ === "TRANSFER" ? (
        <input value={kod} onChange={(e) => setKod(e.target.value)} maxLength={256} disabled={pending} placeholder="Nowy kod EPP (puste — kod z zamówienia)" aria-label="Nowy kod EPP" className={`${POLE} font-mono`} />
      ) : null}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => void wykonaj()}
          disabled={pending || powod.trim().length < MIN_POWOD}
          className="rounded-md border border-cyan-400/60 bg-cyan-500/15 px-3 py-1 text-xs text-cyan-100 disabled:opacity-50"
        >
          Ponów zamówienie
        </button>
        <button type="button" onClick={() => setOtwarte(false)} disabled={pending} className="text-xs text-muted-foreground hover:underline">
          Anuluj
        </button>
      </div>
      {msg ? (
        <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
          {msg.tekst}
        </p>
      ) : null}
    </div>
  );
}

/** A-09 — przebieg „domknij transfery” od razu, bez czekania na godzinny harmonogram. */
export function SprawdzTransfery({ zablokowane }: { zablokowane: string | null }) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        disabled={pending || !!zablokowane}
        title={zablokowane ?? undefined}
        onClick={() =>
          start(async () => {
            try {
              const r = await sprawdzTransferyAction();
              setMsg(r.ok ? `Zakończone: ${r.wynik.zakonczone}, odrzucone: ${r.wynik.nieudane}.` : r.error);
              if (r.ok) router.refresh();
            } catch {
              setMsg("Nie udało się połączyć z panelem.");
            }
          })
        }
        className="rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-300 hover:text-white disabled:opacity-50"
      >
        {pending ? "Sprawdzam…" : "Sprawdź u rejestratora"}
      </button>
      {msg ? <span role="status" className="text-xs text-muted-foreground">{msg}</span> : null}
    </span>
  );
}

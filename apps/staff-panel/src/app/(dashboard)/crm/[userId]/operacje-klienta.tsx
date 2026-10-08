"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/select";
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { wykonajOperacjeAction, type TypWniosku } from "@/lib/wnioski-actions";

export interface FakturaDoAnulowania {
  id: string;
  number: string;
  amount: string;
  currency: string;
}

const POLE = "w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white";
const PRZYCISK =
  "rounded-lg border border-cyan-500/35 bg-cyan-500/15 px-3 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-500/25 disabled:opacity-50";
const BRAK = "Twoja rola nie ma tego uprawnienia — wyślij wniosek.";

/**
 * Jedna operacja: z uprawnieniem — „Wykonaj” (endpoint bezpośredni); bez — „Wyślij wniosek” z tymi samymi
 * parametrami. 403 WYMAGA_WNIOSKU z API (np. uprawnienie odebrane w trakcie sesji) przełącza na wniosek.
 */
function Operacja({
  typ,
  userId,
  tytul,
  mozeBezposrednio,
  payload,
  gotowe,
  etykietaWykonaj,
  children,
}: {
  typ: TypWniosku;
  userId: string;
  tytul: string;
  mozeBezposrednio: boolean;
  payload: Record<string, unknown>;
  gotowe: boolean;
  etykietaWykonaj: string;
  children?: React.ReactNode;
}) {
  const [wniosek, setWniosek] = useState(!mozeBezposrednio);
  const [komunikat, setKomunikat] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const wykonaj = () =>
    start(async () => {
      const r = await wykonajOperacjeAction(typ, userId, payload);
      if (r.ok) setKomunikat({ ok: true, tekst: r.komunikat });
      else if (r.wymagaWniosku) {
        setWniosek(true);
        setKomunikat({ ok: false, tekst: r.error });
      } else setKomunikat({ ok: false, tekst: r.error });
    });

  return (
    <div className="space-y-2 border-t border-white/5 pt-4" data-operacja={typ} data-tryb={wniosek ? "wniosek" : "bezposrednio"}>
      <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-300">{tytul}</h3>
      {children}
      {wniosek ? (
        <WyslijWniosek typ={typ} userId={userId} payload={payload} gotowe={gotowe} podpowiedz={komunikat?.ok === false ? komunikat.tekst : BRAK} />
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={wykonaj} disabled={pending || !gotowe} className={PRZYCISK}>
            {pending ? "Wykonuję…" : etykietaWykonaj}
          </button>
          {komunikat ? <span className={`text-xs ${komunikat.ok ? "text-emerald-300" : "text-rose-300"}`}>{komunikat.tekst}</span> : null}
        </div>
      )}
    </div>
  );
}

export function OperacjeKlienta({
  userId,
  isInternal,
  mozeFlage,
  mozeFinanse,
  faktury,
}: {
  userId: string;
  /** null — nie udało się odczytać stanu konta (operacja niedostępna, komunikat zamiast pustki). */
  isInternal: boolean | null;
  mozeFlage: boolean;
  mozeFinanse: boolean;
  faktury: FakturaDoAnulowania[];
}) {
  const [kwota, setKwota] = useState("");
  const [opis, setOpis] = useState("");
  const [faktura, setFaktura] = useState(faktury[0]?.id ?? "");
  const [powod, setPowod] = useState("");
  const liczba = Number(kwota.replace(",", "."));
  const kwotaOk = Number.isFinite(liczba) && liczba > 0 && liczba <= 100000;

  return (
    <div className="mt-4 space-y-4">
      {isInternal === null ? (
        <p className="text-xs text-muted-foreground">Nie udało się odczytać, czy konto jest wewnętrzne — odśwież stronę.</p>
      ) : (
        <Operacja
          typ="CUSTOMER_INTERNAL_FLAG"
          userId={userId}
          tytul="Konto wewnętrzne (poza MRR i churnem)"
          mozeBezposrednio={mozeFlage}
          payload={{ isInternal: !isInternal }}
          gotowe
          etykietaWykonaj={isInternal ? "Zdejmij oznaczenie" : "Oznacz jako wewnętrzne"}
        >
          <p className="text-sm text-white">
            Teraz: <strong>{isInternal ? "wewnętrzne" : "zwykłe konto klienta"}</strong>
            {` — ${isInternal ? "zdjęcie oznaczenia" : "oznaczenie jako wewnętrzne"}`}
          </p>
        </Operacja>
      )}

      <Operacja
        typ="WALLET_CREDIT"
        userId={userId}
        tytul="Zasilenie portfela"
        mozeBezposrednio={mozeFinanse}
        payload={{ amount: kwotaOk ? Math.round(liczba * 100) / 100 : 0, ...(opis.trim() ? { description: opis.trim() } : {}) }}
        gotowe={kwotaOk}
        etykietaWykonaj="Zasil portfel"
      >
        <div className="grid gap-2 sm:grid-cols-[10rem_1fr]">
          <input aria-label="Kwota (K)" inputMode="decimal" placeholder="Kwota, np. 25,00" value={kwota} onChange={(e) => setKwota(e.target.value)} className={POLE} />
          <input aria-label="Opis dla klienta" placeholder="Opis dla klienta (opcjonalnie)" maxLength={255} value={opis} onChange={(e) => setOpis(e.target.value)} className={POLE} />
        </div>
      </Operacja>

      {faktury.length === 0 ? null : (
        <Operacja
          typ="INVOICE_VOID"
          userId={userId}
          tytul="Anulowanie nieopłaconego dokumentu"
          mozeBezposrednio={mozeFinanse}
          payload={{ invoiceId: faktura, powod: powod.trim() }}
          gotowe={Boolean(faktura) && powod.trim().length >= 5}
          etykietaWykonaj="Anuluj dokument"
        >
          <div className="grid gap-2 sm:grid-cols-[14rem_1fr]">
            <Select
              aria-label="Dokument"
              value={faktura}
              onChange={setFaktura}
              options={faktury.map((f) => ({ value: f.id, label: `${f.number} · ${f.amount} ${f.currency}` }))}
            />
            <input aria-label="Powód anulowania" placeholder="Powód anulowania (min. 5 znaków)" maxLength={500} value={powod} onChange={(e) => setPowod(e.target.value)} className={POLE} />
          </div>
        </Operacja>
      )}
    </div>
  );
}

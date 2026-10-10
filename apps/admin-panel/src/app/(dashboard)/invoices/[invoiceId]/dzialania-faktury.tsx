"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { potwierdz } from "@/components/potwierdz";
import { PRZYCISK } from "@/components/v2";
import { WyslijWniosek } from "@/components/wniosek-operacji";
import { anulujDokument, dokonczFakture, ponowKsef } from "../actions";

/**
 * Anulowanie nieopłaconego dokumentu (M-08) na stronie faktury. Bez BILLING_MANAGE — „Wyślij wniosek”
 * (API: @WniosekMozliwy('INVOICE_VOID')), z tym samym powodem w payloadzie.
 */
export function AnulujDokument({ invoiceId, number, userId, wniosek }: { invoiceId: string; number: string; userId: string; wniosek: boolean }) {
  const router = useRouter();
  const [powod, setPowod] = useState("");
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const gotowy = powod.trim().length >= 5;

  return (
    <div className="flex flex-col gap-2">
      <label className="flex flex-col gap-1 text-xs text-muted-foreground">
        Powód anulowania (trafia do dziennika)
        <input
          value={powod}
          onChange={(e) => setPowod(e.target.value)}
          minLength={5}
          maxLength={500}
          className="w-full max-w-md rounded-[9px] border border-line-strong bg-transparent px-3 py-2 text-sm text-foreground"
        />
      </label>
      {wniosek ? (
        <WyslijWniosek typ="INVOICE_VOID" userId={userId} payload={{ invoiceId, powod: powod.trim() }} gotowe={gotowy} podpowiedz="Anulowanie wymaga BILLING_MANAGE — wyślij wniosek." />
      ) : (
        <button
          type="button"
          disabled={pending || !gotowy}
          className={`${PRZYCISK} self-start !border-[color-mix(in_srgb,var(--crit)_40%,transparent)] !text-crit`}
          onClick={async () => {
            if (!(await potwierdz(`Anulować dokument ${number}? Tego nie da się cofnąć.`, { akcja: "Anuluj dokument", niebezpieczne: true }))) return;
            setBlad(null);
            start(async () => {
              const r = await anulujDokument(invoiceId, powod.trim());
              if (r.ok) router.refresh();
              else setBlad(r.error);
            });
          }}
        >
          {pending ? "Anuluję…" : "Anuluj dokument"}
        </button>
      )}
      {blad ? <p className="text-xs text-crit">{blad}</p> : null}
    </div>
  );
}

/** Ponowienie wysyłki odrzuconej faktury do KSeF (tylko ADMIN; wcześniej w „Danych firmy”). */
export function PonowKsef({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        className={`${PRZYCISK} self-start`}
        onClick={async () => {
          if (!(await potwierdz(`Wysłać ${number} do KSeF ponownie? Popraw najpierw dane, które KSeF odrzucił.`, { akcja: "Ponów" }))) return;
          setBlad(null);
          start(async () => {
            const r = await ponowKsef(invoiceId);
            if (r.ok) router.refresh();
            else setBlad(r.error);
          });
        }}
      >
        {pending ? "Wysyłam…" : "Ponów wysyłkę do KSeF"}
      </button>
      {blad ? <p className="text-xs text-crit">{blad}</p> : null}
    </div>
  );
}

/** Fala 1B — dokończenie opłaconej faktury bez PDF-u (numer i plik), z potwierdzeniem. */
export function DokonczFakture({ invoiceId, number }: { invoiceId: string; number: string }) {
  const router = useRouter();
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        disabled={pending}
        className={`${PRZYCISK} self-start`}
        onClick={async () => {
          if (!(await potwierdz(`Dokończyć wystawienie ${number}? Faktura dostanie numer i PDF, jak przy automacie.`, { akcja: "Dokończ" }))) return;
          setBlad(null);
          start(async () => {
            const r = await dokonczFakture(invoiceId);
            if (r.ok) router.refresh();
            else setBlad(r.error);
          });
        }}
      >
        {pending ? "Dokańczam…" : "Dokończ wystawienie"}
      </button>
      {blad ? <p className="text-xs text-crit">{blad}</p> : null}
    </div>
  );
}

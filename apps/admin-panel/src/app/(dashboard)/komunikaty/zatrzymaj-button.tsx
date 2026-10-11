"use client";

import { useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { zatrzymajKomunikatAction } from "./actions";

/** F3.8 — zatrzymanie wysyłki komunikatu (reszta odbiorców pominięta, wysłanych maili nie cofa). */
export function ZatrzymajKomunikat({ id }: { id: string }) {
  const [blad, setBlad] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const klik = async () => {
    if (!(await potwierdz("Zatrzymać wysyłkę? Klienci, do których mail jeszcze nie wyszedł, go nie dostaną.", { akcja: "Zatrzymaj", niebezpieczne: true }))) return;
    start(async () => {
      const r = await zatrzymajKomunikatAction(id);
      setBlad(r.ok ? null : r.error);
    });
  };
  return (
    <span className="inline-flex items-center gap-2">
      <button type="button" data-akcja="zatrzymaj" disabled={pending} onClick={() => void klik()} className="text-xs text-rose-300 hover:underline disabled:opacity-50">
        Zatrzymaj
      </button>
      {blad ? <span className="text-xs text-rose-300">{blad}</span> : null}
    </span>
  );
}

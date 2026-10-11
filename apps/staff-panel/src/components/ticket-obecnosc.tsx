"use client";

import { useEffect, useRef, useState } from "react";
import { staffLeave, staffPresence } from "@/lib/ticket-actions";

/** Co ile panel zgłasza obecność (API trzyma znacznik 30 s — tickets/obecnosc-zgloszen.ts). */
export const ODPYTANIE_MS = 10_000;

/** „Anna też to ogląda” / „Anna pisze odpowiedź” — tekst ostrzeżenia z listy innych obecnych. */
export function tekstObecnosci(inni: { nazwa: string; pisze: boolean }[]): string | null {
  if (!inni.length) return null;
  const pisza = inni.filter((o) => o.pisze).map((o) => o.nazwa);
  if (pisza.length) return `${pisza.join(", ")} ${pisza.length > 1 ? "piszą" : "pisze"} teraz odpowiedź — uzgodnij, kto odpisuje.`;
  return `${inni.map((o) => o.nazwa).join(", ")} ${inni.length > 1 ? "też to oglądają" : "też to ogląda"}.`;
}

/**
 * F3.7 — kolizje: lekki znacznik obecności bez websocketów. Co ODPYTANIE_MS „jestem / piszę”, w odpowiedzi inni
 * obecni. Przy wyjściu ze zgłoszenia znacznik znika od razu (DELETE), inaczej wygasa sam.
 */
export function TicketObecnosc({ ticketId, pisze }: { ticketId: string; pisze: boolean }) {
  const [inni, setInni] = useState<{ nazwa: string; pisze: boolean }[]>([]);
  const piszeRef = useRef(pisze);
  useEffect(() => {
    piszeRef.current = pisze;
  }, [pisze]);
  useEffect(() => {
    let aktywne = true;
    const zglos = () => void staffPresence(ticketId, piszeRef.current).then((r) => aktywne && setInni(r));
    zglos();
    const t = setInterval(zglos, ODPYTANIE_MS);
    return () => {
      aktywne = false;
      clearInterval(t);
      void staffLeave(ticketId);
    };
  }, [ticketId]);
  const tekst = tekstObecnosci(inni);
  if (!tekst) return null;
  const ktosPisze = inni.some((o) => o.pisze);
  return (
    <p role="status" data-obecnosc={ktosPisze ? "pisze" : "oglada"} className={`rounded-lg px-3 py-2 text-[13px] font-semibold ${ktosPisze ? "bg-warn-soft text-warn" : "bg-raised text-[color:var(--verris-body)]"}`}>
      {tekst}
    </p>
  );
}

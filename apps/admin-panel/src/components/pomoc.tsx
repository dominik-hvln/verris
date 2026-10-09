"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { HelpCircle } from "lucide-react";
import { POMOC, type PomocId, type WpisPomocy } from "@/lib/pomoc";

/**
 * Pozycja dymka w granicach ekranu: nad elementem, a gdy brak miejsca — pod nim
 * (port `placeTip` z apps/client-panel/src/components/panel/v2.tsx).
 */
export function placeTip(
  anchor: { x: number; y: number; bottom: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  gap = 8,
  margin = 8,
): { left: number; top: number } {
  const left = Math.min(Math.max(anchor.x - size.w / 2, margin), Math.max(margin, view.w - size.w - margin));
  const above = anchor.y - gap - size.h;
  const top = above >= margin ? above : Math.min(anchor.bottom + gap, view.h - size.h - margin);
  return { left, top };
}

const bezSubskrypcji = () => () => {};

/**
 * Ikonka „?” z opisem funkcji ze słownika lib/pomoc.ts (propozycja 10.10, sekcja D). Otwiera się
 * kliknięciem (działa na dotyku), Esc zamyka i wraca fokusem na „?”; dymek renderowany na body, żeby nie
 * chował się pod kartami z backdrop-filter.
 */
export function Pomoc({ id }: { id: PomocId }) {
  const wpis: WpisPomocy = POMOC[id];
  const [otwarty, setOtwarty] = useState(false);
  const [pozycja, setPozycja] = useState<{ left: number; top: number } | null>(null);
  const przycisk = useRef<HTMLButtonElement>(null);
  const dymek = useRef<HTMLDivElement>(null);
  const idDymka = useId();
  const klient = useSyncExternalStore(bezSubskrypcji, () => true, () => false);

  const zamknij = useCallback((fokus: boolean) => {
    setOtwarty(false);
    setPozycja(null);
    if (fokus) przycisk.current?.focus();
  }, []);

  const ustawPozycje = useCallback(() => {
    const a = przycisk.current?.getBoundingClientRect();
    const d = dymek.current;
    if (!a || !d) return;
    setPozycja(placeTip({ x: a.left + a.width / 2, y: a.top, bottom: a.bottom }, { w: d.offsetWidth, h: d.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }));
  }, []);

  useLayoutEffect(() => {
    if (!otwarty) return;
    ustawPozycje();
    dymek.current?.focus();
  }, [otwarty, ustawPozycje]);

  useEffect(() => {
    if (!otwarty) return;
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === "Escape") zamknij(true);
    };
    const klik = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!dymek.current?.contains(t) && !przycisk.current?.contains(t)) zamknij(false);
    };
    window.addEventListener("keydown", klawisz);
    document.addEventListener("mousedown", klik);
    window.addEventListener("scroll", ustawPozycje, true);
    window.addEventListener("resize", ustawPozycje);
    return () => {
      window.removeEventListener("keydown", klawisz);
      document.removeEventListener("mousedown", klik);
      window.removeEventListener("scroll", ustawPozycje, true);
      window.removeEventListener("resize", ustawPozycje);
    };
  }, [otwarty, zamknij, ustawPozycje]);

  return (
    <>
      <button
        ref={przycisk}
        type="button"
        aria-label={`Pomoc: ${wpis.tytul}`}
        aria-expanded={otwarty}
        aria-controls={otwarty ? idDymka : undefined}
        onClick={() => (otwarty ? zamknij(false) : setOtwarty(true))}
        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full align-middle text-muted-foreground hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary"
      >
        <HelpCircle className="h-3.5 w-3.5" aria-hidden />
      </button>
      {otwarty && klient
        ? createPortal(
            <div
              ref={dymek}
              id={idDymka}
              role="dialog"
              aria-label={wpis.tytul}
              tabIndex={-1}
              onBlur={(e) => {
                const dokad = e.relatedTarget as Node | null;
                if (dokad && !dymek.current?.contains(dokad) && dokad !== przycisk.current) zamknij(false);
              }}
              className="fixed z-[120] w-max max-w-[min(340px,calc(100vw-16px))] rounded-[10px] border border-line-strong bg-card px-3.5 py-3 text-left text-[13px] leading-snug text-foreground shadow-xl outline-none"
              style={pozycja ?? { left: 0, top: 0, visibility: "hidden" }}
            >
              <p className="m-0 font-semibold">{wpis.tytul}</p>
              <p className="m-0 mt-1 text-muted-foreground">{wpis.opis}</p>
              {wpis.kiedy ? (
                <p className="m-0 mt-1.5">
                  <span className="font-semibold">Kiedy: </span>
                  <span className="text-muted-foreground">{wpis.kiedy}</span>
                </p>
              ) : null}
              {wpis.rozniSieOd ? <p className="m-0 mt-1.5 text-muted-foreground">{wpis.rozniSieOd}</p> : null}
              <Link href="/ai-knowledge" className="mt-2 inline-block text-[13px] font-semibold text-data-hi hover:underline">
                Zapytaj asystenta →
              </Link>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

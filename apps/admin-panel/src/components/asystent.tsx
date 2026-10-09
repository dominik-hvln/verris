"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, MessageCircle, X } from "lucide-react";
import type { KontekstAsystentaDto, ObiektAsystenta } from "@verris/contracts";
import { POMOC, type PomocId } from "@/lib/pomoc";
import { StaffAssistant } from "./staff-assistant";

/** Karty obiektów panelu → typ obiektu dla asystenta (API dostaje tylko typ i ID, bez danych). */
const KARTY: Record<string, ObiektAsystenta> = {
  nodes: "wezel",
  customers: "klient",
  subscriptions: "usluga",
  invoices: "faktura",
  tickets: "zgloszenie",
  migrations: "migracja",
  operators: "operator",
};

/**
 * Kontekst strony dla asystenta: ścieżka (bez zapytania, w granicach walidacji API) i obiekt z karty.
 * ID ma cyfrę — podstrony typu /nodes/wizard czy /invoices/reczna nie są kartą obiektu.
 */
export function kontekstZeSciezki(pathname: string): KontekstAsystentaDto {
  const strona = `/${pathname.replace(/[^A-Za-z0-9/_.-]/g, "").replace(/^\/+/, "")}`.slice(0, 200);
  const [, sekcja, id] = strona.split("/");
  const obiektTyp = sekcja ? KARTY[sekcja] : undefined;
  if (obiektTyp && id && /\d/.test(id) && /^[A-Za-z0-9_-]{1,64}$/.test(id)) return { strona, obiektTyp, obiektId: id };
  return { strona };
}

export function pytanieOFunkcje(id: PomocId): string {
  return `Jak działa „${POMOC[id].tytul}” i jak tego użyć tutaj?`;
}

interface Asystent {
  /** Otwiera okno asystenta i od razu zadaje pytanie o funkcję ze słownika „?” (z kontekstem strony). */
  zapytaj: (funkcja: PomocId) => void;
}

const AsystentKontekst = createContext<Asystent | null>(null);

/** null — asystent niedostępny (AI nieskonfigurowane albo poza AdminShell): „?” prowadzi wtedy do funkcji. */
export function useAsystent(): Asystent | null {
  return useContext(AsystentKontekst);
}

/**
 * Pływający asystent pracowników w AdminShell (propozycja 10.10, sekcja D, wzór: HostingAssistant panelu
 * klienta). Bez skonfigurowanego AI (GET /ai/status) nie renderuje niczego i nie daje kontekstu.
 */
export function AsystentPracownika({ dostepny, children }: { dostepny: boolean; children: React.ReactNode }) {
  const pathname = usePathname() ?? "/";
  const [otwarty, setOtwarty] = useState(false);
  const [start, setStart] = useState<{ pytanie: string; nr: number } | null>(null);
  const [funkcja, setFunkcja] = useState<{ id: PomocId; strona: string } | null>(null);
  const okno = useRef<HTMLDivElement>(null);
  const przycisk = useRef<HTMLButtonElement>(null);

  const zapytaj = useCallback(
    (id: PomocId) => {
      setFunkcja({ id, strona: pathname });
      setStart((s) => ({ pytanie: pytanieOFunkcje(id), nr: (s?.nr ?? 0) + 1 }));
      setOtwarty(true);
    },
    [pathname],
  );
  const wartosc = useMemo(() => (dostepny ? { zapytaj } : null), [dostepny, zapytaj]);

  // Funkcja z „?” dotyczy strony, na której o nią zapytano — po przejściu dalej zostaje sama strona.
  const kontekst: KontekstAsystentaDto = {
    ...kontekstZeSciezki(pathname),
    ...(funkcja && funkcja.strona === pathname ? { funkcja: funkcja.id } : {}),
  };

  useEffect(() => {
    if (!otwarty) return;
    okno.current?.focus();
    const klawisz = (e: KeyboardEvent) => {
      if (e.key === "Escape" && okno.current?.contains(document.activeElement)) setOtwarty(false);
    };
    window.addEventListener("keydown", klawisz);
    return () => window.removeEventListener("keydown", klawisz);
  }, [otwarty, start]);

  // Po zamknięciu fokus wraca na pływający przycisk (montuje się dopiero przy zamkniętym oknie).
  useEffect(() => {
    if (!otwarty && start) przycisk.current?.focus();
  }, [otwarty, start]);

  return (
    <AsystentKontekst.Provider value={wartosc}>
      {children}
      {dostepny ? (
        <>
          {!otwarty ? (
            <button
              ref={przycisk}
              type="button"
              aria-label="Otwórz asystenta"
              onClick={() => setOtwarty(true)}
              className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-4 z-50 flex h-12 w-12 items-center justify-center rounded-full border border-line-strong bg-card text-foreground shadow-[0_18px_40px_-18px_rgba(0,0,0,0.55)] transition-colors hover:bg-raised sm:bottom-6 sm:right-6"
            >
              <MessageCircle className="h-5 w-5" />
            </button>
          ) : null}
          {/* Okno zostaje zamontowane po zamknięciu — rozmowa przetrwa. */}
          <div
            ref={okno}
            role="dialog"
            aria-label="Asystent"
            tabIndex={-1}
            hidden={!otwarty}
            className="fixed bottom-[max(1rem,env(safe-area-inset-bottom,1rem))] right-4 z-50 flex h-[min(560px,80dvh)] w-[min(380px,calc(100vw-2rem))] flex-col gap-3 overflow-hidden rounded-xl border border-line-strong bg-card p-4 text-foreground shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] outline-none sm:bottom-6 sm:right-6 [&[hidden]]:hidden"
          >
            <div className="flex items-center justify-between">
              <p className="m-0 flex items-center gap-2 text-sm font-semibold">
                <Bot className="h-4 w-4" /> Asystent
              </p>
              <button type="button" aria-label="Zamknij asystenta" onClick={() => setOtwarty(false)} className="rounded-md p-1.5 text-muted-foreground hover:bg-raised hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            <StaffAssistant kontekst={kontekst} start={start} />
          </div>
        </>
      ) : null}
    </AsystentKontekst.Provider>
  );
}

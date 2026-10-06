"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, User, Server, Globe, FileText, CornerDownLeft, ArrowRight } from "lucide-react";
import { globalSearchAction, type GlobalSearchResult } from "./command-palette-actions";

const TYPE_ICON = {
  user: User,
  service: Server,
  domain: Globe,
  invoice: FileText,
} as const;

/** Strona menu dla wyszukiwarki: nazwa, sekcja, słowa kluczowe (admin-shell.tsx). */
export type StronaMenu = { name: string; href: string; sekcja: string; szukaj?: string };

const bezOgonkow = (t: string) => t.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l");

/** Strony, których nazwa, sekcja albo słowa kluczowe zawierają każde wpisane słowo (bez polskich znaków). */
export function szukajStron(strony: StronaMenu[], q: string, max = 6): StronaMenu[] {
  const slowa = bezOgonkow(q).split(/\s+/).filter(Boolean);
  if (!slowa.length) return [];
  const trafione = strony.filter((s) => {
    const tekst = bezOgonkow(`${s.name} ${s.sekcja} ${s.szukaj ?? ""}`);
    return slowa.every((w) => tekst.includes(w));
  });
  // Najpierw strony, których sama nazwa pasuje.
  const wNazwie = (s: StronaMenu) => (slowa.every((w) => bezOgonkow(s.name).includes(w)) ? 0 : 1);
  return trafione.sort((a, b) => wNazwie(a) - wNazwie(b)).slice(0, max);
}

type Wynik = { type: "strona"; id: string; title: string; subtitle: string; href: string } | GlobalSearchResult;

/** ADM-4 — globalna wyszukiwarka (Cmd/Ctrl-K, „/”): strony panelu + klienci, usługi, domeny, faktury. */
export function CommandPalette({ strony = [] }: { strony?: StronaMenu[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Zerowanie w miejscu zamknięcia, nie efektem po zmianie `open`.
  const close = useCallback(() => {
    setOpen(false);
    setQ("");
    setResults([]);
    setActive(0);
  }, []);

  // Globalny skrót Cmd/Ctrl-K.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const wPolu = (e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable=true]");
      if (!open && !wPolu && e.key === "/" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        setOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (open) close();
        else setOpen(true);
      } else if (e.key === "Escape") {
        close();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30);
  }, [open]);

  const doSearch = useCallback((value: string) => {
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(async () => {
      if (value.trim().length < 2) {
        setResults([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      const res = await globalSearchAction(value);
      setResults(res);
      setActive(0);
      setLoading(false);
    }, 220);
  }, []);

  const wyniki: Wynik[] = [
    ...(q.trim().length >= 2 ? szukajStron(strony, q) : []).map((st) => ({ type: "strona" as const, id: st.href, title: st.name, subtitle: st.sekcja ? `Strona · ${st.sekcja}` : "Strona", href: st.href })),
    ...results,
  ];

  const go = useCallback(
    (r: Wynik) => {
      close();
      router.push(r.href);
    },
    [router, close],
  );

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, wyniki.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && wyniki[active]) {
      e.preventDefault();
      go(wyniki[active]);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Szukaj strony, klienta, domeny"
        className="flex h-[38px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-card px-3 text-sm text-muted-foreground hover:border-primary md:w-[360px]"
      >
        <Search className="h-[15px] w-[15px] shrink-0" />
        <span className="hidden md:inline">Szukaj strony, klienta, domeny…</span>
        <kbd className="ml-auto hidden rounded-[5px] border border-line-strong px-1.5 py-px font-mono text-[11px] md:inline">/</kbd>
      </button>

      {open ? (
        <div
          role="presentation"
          className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Wyszukiwarka"
            className="w-full max-w-xl overflow-hidden rounded-2xl border border-line bg-popover shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-white/10 px-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  doSearch(e.target.value);
                }}
                onKeyDown={onKeyDown}
                aria-label="Szukaj"
                placeholder="Strona panelu, klient, usługa (ID), domena, NIP, faktura…"
                className="flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-neutral-600"
              />
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {wyniki.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {q.trim().length < 2
                    ? "Wpisz co najmniej 2 znaki: strona panelu (np. wykresy, ssl), klient, domena, faktura."
                    : loading
                      ? "Szukam…"
                      : "Brak wyników."}
                </p>
              ) : (
                wyniki.map((r, i) => {
                  const Icon = r.type === "strona" ? ArrowRight : TYPE_ICON[r.type];
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                        i === active ? "bg-data-soft" : "hover:bg-raised"
                      }`}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/5 text-neutral-300">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-white">{r.title}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">{r.subtitle}</span>
                      </span>
                      {i === active ? <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /> : null}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

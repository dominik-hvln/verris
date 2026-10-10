"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Search, Loader2, User, Server, Globe, FileText, HardDrive, LifeBuoy, ArrowRightLeft, CornerDownLeft, ArrowRight, Zap, X } from "lucide-react";
import { globalSearchAction, type GlobalSearchResult, type TypWyniku } from "./command-palette-actions";
import { ocenaTrafienia, slowaZapytania } from "@/lib/dopasowanie";
import { akcjeDlaWezlow, akcjeObiektuDlaZapytania, OBIEKTY_Z_DZIALANIAMI, rozbierzZapytanie, szukajAkcjiGlobalnych, type AkcjaWPalecie } from "@/lib/akcje/szukaj";
import type { DostepDoAkcji } from "@/lib/akcje/wezel";
import { podswietlKotwice } from "@/lib/podswietl";
import { NieWczytano } from "./nie-wczytano";
import { createNodeSsoUrl } from "@/app/(dashboard)/nodes/[id]/da-sso-actions";
import { otworzLinkJednorazowy } from "@/lib/otworz-link-jednorazowy";

const TYPE_ICON = {
  user: User,
  service: Server,
  domain: Globe,
  invoice: FileText,
  node: HardDrive,
  ticket: LifeBuoy,
  migration: ArrowRightLeft,
} as const;

/** Dopełniacz l.mn. — „Twoja rola nie przeszukuje węzłów ani faktur”. */
const TYP_DOPELNIACZ: Record<TypWyniku, string> = {
  user: "klientów",
  service: "usług",
  domain: "domen",
  invoice: "faktur",
  node: "węzłów",
  ticket: "zgłoszeń",
  migration: "migracji",
};

/** Komunikat przy pustej liście, gdy część typów pominięto z braku uprawnień; null — nic nie pominięto. */
export function komunikatPominietych(pominiete: TypWyniku[]): string | null {
  if (!pominiete.length) return null;
  if (pominiete.length === Object.keys(TYP_DOPELNIACZ).length) return "Brak wyników. Twoja rola przeszukuje tylko strony panelu.";
  const nazwy = pominiete.map((t) => TYP_DOPELNIACZ[t]);
  const lista = nazwy.length > 1 ? `${nazwy.slice(0, -1).join(", ")} ani ${nazwy.at(-1)}` : nazwy[0];
  return `Brak wyników. Twoja rola nie przeszukuje ${lista}.`;
}

/** Strona menu dla wyszukiwarki: nazwa, sekcja, słowa kluczowe (admin-shell.tsx). */
export type StronaMenu = { name: string; href: string; sekcja: string; szukaj?: string };

/**
 * Strony, których nazwa, sekcja albo słowa kluczowe zawierają każde wpisane słowo (bez polskich znaków).
 * Kolejność: początek nazwy > słowo w nazwie > fragment nazwy > słowa kluczowe.
 */
export function szukajStron(strony: StronaMenu[], q: string, max = 6): StronaMenu[] {
  const slowa = slowaZapytania(q);
  if (!slowa.length) return [];
  return strony
    .map((s, i) => ({ s, i, o: ocenaTrafienia(s.name, `${s.sekcja} ${s.szukaj ?? ""}`, slowa) }))
    .filter((x): x is { s: StronaMenu; i: number; o: number } => x.o !== null)
    .sort((a, b) => a.o - b.o || a.i - b.i)
    .slice(0, max)
    .map((x) => x.s);
}

const bezSubskrypcji = () => () => {};
const naMacu = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

type Wynik =
  | { type: "strona"; id: string; title: string; subtitle: string; href: string }
  /** Działanie (węzła albo globalne) — prowadzi do miejsca z podświetleniem, nie wykonuje. */
  | { type: "akcja"; id: string; title: string; subtitle: string; href: string; zablokowane: string | null; wniosek?: boolean; uruchom?: AkcjaWPalecie["uruchom"] }
  | GlobalSearchResult;

const jakoWynik = (a: AkcjaWPalecie): Wynik => ({
  type: "akcja",
  id: a.id,
  title: a.nazwa,
  subtitle: a.zablokowane ? (a.wniosek ? `${a.zablokowane} · wyślij wniosek` : a.zablokowane) : a.opis,
  href: a.href,
  zablokowane: a.zablokowane,
  ...(a.wniosek ? { wniosek: true } : {}),
  ...(a.uruchom ? { uruchom: a.uruchom } : {}),
});

/** Podpowiedź w polu w trybie obiekt → działanie. */
const PRZYKLADY: Record<string, string> = {
  node: "Działanie, np. onboard, drain, waf…",
  user: "Działanie, np. reseller, blokada, kredyty…",
  service: "Działanie, np. ponów, migracja, zawieś…",
  invoice: "Działanie, np. korekta, ksef, anuluj…",
};
const maDzialania = (r: { type: string }) => r.type in OBIEKTY_Z_DZIALANIAMI;

/**
 * ADM-4 — globalna wyszukiwarka (Cmd/Ctrl-K, „/”): strony panelu, działania (lib/akcje/*) oraz klienci, usługi,
 * domeny, faktury, węzły, zgłoszenia, migracje. Tryb obiekt → działanie: na węźle, kliencie, usłudze albo
 * fakturze Tab albo → pokazuje jego działania; „onboard t1” trafia w to samo. Wybór działania prowadzi do karty z podświetlonym miejscem
 * (decyzja 10.10) — operacja uruchamia się tam, z potwierdzeniem. Bez uprawnień — wyszarzone z powodem.
 */
export function CommandPalette({ strony = [], dostep = { isAdmin: false, permissions: [] } }: { strony?: StronaMenu[]; dostep?: DostepDoAkcji }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<GlobalSearchResult[]>([]);
  const [pominiete, setPominiete] = useState<TypWyniku[]>([]);
  const [bladSzukania, setBladSzukania] = useState(false);
  const [dzialaniaNaWezlach, setDzialaniaNaWezlach] = useState<AkcjaWPalecie[]>([]);
  /** Wybrany obiekt: węzeł, klient, usługa, faktura (tryb obiekt → działanie). */
  const [obiekt, setObiekt] = useState<GlobalSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  /** Błąd działania uruchomionego z palety (np. SSO) — paleta zostaje otwarta z komunikatem. */
  const [bladAkcji, setBladAkcji] = useState<string | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const zapytanie = useRef(0);
  const mac = useSyncExternalStore(bezSubskrypcji, naMacu, () => false);

  // Zerowanie w miejscu zamknięcia, nie efektem po zmianie `open`.
  const close = useCallback(() => {
    if (debounce.current) clearTimeout(debounce.current);
    zapytanie.current++;
    setOpen(false);
    setQ("");
    setResults([]);
    setPominiete([]);
    setBladSzukania(false);
    setDzialaniaNaWezlach([]);
    setObiekt(null);
    setLoading(false);
    setBladAkcji(null);
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

  const doSearch = useCallback(
    (value: string) => {
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(async () => {
        const nr = ++zapytanie.current;
        if (value.trim().length < 2) {
          setResults([]);
          setBladSzukania(false);
          setDzialaniaNaWezlach([]);
          setLoading(false);
          return;
        }
        setLoading(true);
        // „onboard t1” — osobno szukamy węzła „t1”, żeby pokazać „Onboard LIVE · t1”.
        const rozbior = rozbierzZapytanie(value);
        const [res, wezly] = await Promise.all([globalSearchAction(value), rozbior ? globalSearchAction(rozbior.obiekt) : null]);
        if (nr !== zapytanie.current) return;
        setResults(res.results);
        setPominiete(res.pominiete);
        setBladSzukania(!!res.blad);
        setDzialaniaNaWezlach(rozbior && wezly ? akcjeDlaWezlow(wezly.results.filter((r) => r.type === "node"), rozbior.dzialanie, dostep) : []);
        setActive(0);
        setLoading(false);
      }, 220);
    },
    [dostep],
  );

  const szukaj = q.trim().length >= 2;
  const pokazBlad = bladSzukania && szukaj && !obiekt && !loading;
  const globalne = szukaj ? szukajAkcjiGlobalnych(q, dostep) : [];
  // Strona menu o tym samym adresie co działanie (np. „Dodaj węzeł”) — raz, jako działanie.
  const adresyDzialan = new Set(globalne.map((a) => a.href));
  const wyniki: Wynik[] = obiekt
    ? akcjeObiektuDlaZapytania(obiekt, q, dostep).map(jakoWynik)
    : [
        ...dzialaniaNaWezlach.map(jakoWynik),
        ...globalne.map(jakoWynik),
        ...(szukaj ? szukajStron(strony, q).filter((st) => !adresyDzialan.has(st.href)) : []).map((st) => ({ type: "strona" as const, id: st.href, title: st.name, subtitle: st.sekcja ? `Strona · ${st.sekcja}` : "Strona", href: st.href })),
        ...results,
      ];

  /**
   * Fala 1B — SSO do DA węzła od razu z palety (decyzja 10.10: bezpieczne działania wykonują się od razu).
   * Ta sama akcja serwera co przycisk na karcie (da-sso-button.tsx): POST admin/servers/:id/sso-url, tylko ADMIN,
   * wpis NODE_ADMIN_SSO_URL_CREATED w dzienniku. Okno otwieramy przed awaitem (blokada wyskakujących okien).
   */
  const ssoTrwa = useRef(false);
  const uruchomSso = useCallback(
    async (serverId: string) => {
      // Drugi Enter w trakcie nie tworzy drugiego linku (każdy to osobny wpis w dzienniku).
      if (ssoTrwa.current) return;
      ssoTrwa.current = true;
      setBladAkcji(null);
      try {
        const blad = await otworzLinkJednorazowy(() => createNodeSsoUrl(serverId));
        if (blad) setBladAkcji(blad);
        else close();
      } finally {
        ssoTrwa.current = false;
      }
    },
    [close],
  );

  const go = useCallback(
    (r: Wynik) => {
      // Bez uprawnień — nic; chyba że można wysłać wniosek: wtedy do formularza z „Wyślij wniosek”.
      if (r.type === "akcja" && r.zablokowane && !r.wniosek) return;
      if (r.type === "akcja" && !r.zablokowane && r.uruchom?.rodzaj === "sso-da") {
        void uruchomSso(r.uruchom.id);
        return;
      }
      close();
      router.push(r.href);
      if (r.href.includes("#")) podswietlKotwice(r.href);
    },
    [router, close, uruchomSso],
  );

  const wybierzObiekt = (r: GlobalSearchResult) => {
    if (debounce.current) clearTimeout(debounce.current);
    zapytanie.current++;
    setObiekt(r);
    setQ("");
    setLoading(false);
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    const biezacy = wyniki[active];
    const kursorNaKoncu = e.currentTarget.selectionStart === e.currentTarget.value.length;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => Math.min(a + 1, wyniki.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => Math.max(a - 1, 0));
    } else if (e.key === "Enter" && biezacy) {
      e.preventDefault();
      go(biezacy);
    } else if (!obiekt && biezacy && biezacy.type !== "strona" && biezacy.type !== "akcja" && maDzialania(biezacy) && ((e.key === "Tab" && !e.shiftKey) || (e.key === "ArrowRight" && kursorNaKoncu))) {
      e.preventDefault();
      wybierzObiekt(biezacy);
    } else if (obiekt && e.key === "Backspace" && q === "") {
      e.preventDefault();
      setObiekt(null);
      setActive(0);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Szukaj strony, klienta, domeny"
        aria-keyshortcuts="Meta+K Control+K"
        className="flex h-[38px] items-center gap-2.5 rounded-[9px] border border-line-strong bg-card px-3 text-sm text-muted-foreground hover:border-primary md:w-[360px]"
      >
        <Search className="h-[15px] w-[15px] shrink-0" />
        <span className="hidden md:inline">Szukaj strony, klienta, domeny…</span>
        <kbd className="ml-auto hidden rounded-[5px] border border-line-strong px-1.5 py-px font-mono text-[11px] md:inline">{mac ? "⌘K" : "Ctrl K"}</kbd>
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
              {obiekt ? (
                <button
                  type="button"
                  onClick={() => setObiekt(null)}
                  aria-label={`${OBIEKTY_Z_DZIALANIAMI[obiekt.type]} ${obiekt.title} — wróć do wyszukiwania`}
                  className="flex max-w-[45%] shrink-0 items-center gap-1 rounded-md border border-line-strong px-2 py-0.5 text-xs text-foreground hover:border-primary"
                >
                  <span className="truncate">
                    {OBIEKTY_Z_DZIALANIAMI[obiekt.type]} {obiekt.title}
                  </span>
                  <X className="h-3 w-3 shrink-0" />
                </button>
              ) : null}
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setActive(0);
                  if (!obiekt) doSearch(e.target.value);
                }}
                onKeyDown={onKeyDown}
                aria-label="Szukaj"
                placeholder={obiekt ? PRZYKLADY[obiekt.type] : "Strona, węzeł (nazwa, IP), klient, domena, NIP, faktura…"}
                className="flex-1 bg-transparent py-4 text-sm text-white outline-none placeholder:text-neutral-600"
              />
              {loading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-2">
              {bladAkcji ? (
                <p role="alert" className="m-1 rounded-lg border border-crit/30 bg-crit/10 px-3 py-2 text-xs text-crit">
                  {bladAkcji}
                </p>
              ) : null}
              {pokazBlad ? (
                <div className="p-1">
                  <NieWczytano co="wyników wyszukiwania" onPonow={() => doSearch(q)} />
                </div>
              ) : null}
              {pokazBlad && wyniki.length === 0 ? null : wyniki.length === 0 ? (
                <p className="px-3 py-8 text-center text-xs text-muted-foreground">
                  {obiekt
                    ? "Brak takiego działania."
                    : !szukaj
                      ? "Wpisz co najmniej 2 znaki: strona (np. onboard, ksef), węzeł, klient, faktura."
                      : loading
                        ? "Szukam…"
                        : (komunikatPominietych(pominiete) ?? "Brak wyników.")}
                </p>
              ) : (
                wyniki.map((r, i) => {
                  const Icon = r.type === "strona" ? ArrowRight : r.type === "akcja" ? Zap : TYPE_ICON[r.type];
                  const zablokowane = r.type === "akcja" ? r.zablokowane : null;
                  const wniosek = r.type === "akcja" && !!r.wniosek;
                  return (
                    <button
                      key={`${r.type}-${r.id}`}
                      type="button"
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      aria-disabled={zablokowane && !wniosek ? true : undefined}
                      title={zablokowane ?? undefined}
                      className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${zablokowane ? `opacity-60 ${wniosek ? "" : "cursor-not-allowed"}` : ""} ${
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
                      {i === active && r.type !== "strona" && r.type !== "akcja" && maDzialania(r) && !obiekt ? (
                        <kbd className="shrink-0 rounded-[5px] border border-line-strong px-1.5 font-mono text-[10.5px] text-muted-foreground">Tab · działania</kbd>
                      ) : i === active && (!zablokowane || wniosek) ? (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      ) : null}
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

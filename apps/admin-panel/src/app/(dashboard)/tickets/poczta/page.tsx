import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import { brakUprawnienia } from "@/lib/akcje/wezel";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Eyebrow, KARTA, Pigulka, PRZYCISK, WIERSZ } from "@/components/v2";
import { BlokadyNadawcow, DecyzjePoczty, PlikiPoczty, type PlikPoczty } from "./decyzje";

export const dynamic = "force-dynamic";

type WierszPoczty = {
  id: string;
  nadawca: string;
  nadawcaNazwa: string | null;
  temat: string;
  rodzaj: "SUPPORT" | "ABUSE";
  otrzymano: string;
  wynik: string;
  powod: string | null;
  tresc: string | null;
  ticketId: string | null;
  sugerowaneZgloszenieId: string | null;
  zalaczniki: PlikPoczty[];
};

type ListaPoczty = {
  rows: WierszPoczty[];
  total: number;
  page: number;
  totalPages: number;
  liczby: { kolejka: number; spam: number };
  konfiguracja: boolean;
};

const WIDOKI = { kolejka: "Bez klienta", spam: "Spam", wszystkie: "Wszystkie" } as const;
type Widok = keyof typeof WIDOKI;

const WYNIK: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ZGLOSZENIE: { t: "Nowe zgłoszenie", ton: "ok" },
  ODPOWIEDZ: { t: "Odpowiedź w wątku", ton: "ok" },
  BEZ_KLIENTA: { t: "Bez klienta", ton: "warn" },
  SPAM: { t: "Spam", ton: "crit" },
  BLOKADA: { t: "Zablokowany nadawca", ton: "muted" },
  AUTO: { t: "Automat", ton: "muted" },
  ZA_DUZY: { t: "Za duży", ton: "warn" },
  PRZYPISANY: { t: "Przypisany", ton: "ok" },
  ODRZUCONY: { t: "Odrzucony", ton: "muted" },
};

const kiedy = (d: string) => new Date(d).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * F3.7 (OE-19, OE-20) — „Poczta bez klienta”: maile do support@/abuse@, których import nie przypisał do konta klienta
 * (obcy nadawca, nie właściciel zgłoszenia z wątku, DMARC), oraz spam. Odczyt — TICKETS_VIEW; decyzje — TICKETS_MANAGE.
 */
export default async function PocztaBezKlientaPage({ searchParams }: { searchParams?: Promise<{ widok?: string; page?: string }> }) {
  const bramka = await bramkaStrony("/tickets/poczta");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  const widok: Widok = q.widok === "spam" || q.widok === "wszystkie" ? q.widok : "kolejka";
  const strona = Math.max(1, Number.parseInt(q.page ?? "1", 10) || 1);
  let lista: ListaPoczty;
  let blokady: { wzorzec: string; powod: string | null }[];
  try {
    [lista, blokady] = await Promise.all([
      adminApi<ListaPoczty>(`/admin/poczta-zgloszen?widok=${widok}&page=${strona}`),
      adminApi<{ wzorzec: string; powod: string | null }[]>("/admin/poczta-zgloszen/blokady"),
    ]);
  } catch (e) {
    return <BladStrony blad={e} tytul="Poczta bez klienta" powrot={{ href: "/tickets", label: "Zgłoszenia" }} />;
  }
  const brakZmian = brakUprawnienia("TICKETS_MANAGE", await fetchStaffAccess());
  const href = (o: { widok?: Widok; page?: number }) => {
    const p = new URLSearchParams();
    const w = o.widok ?? widok;
    if (w !== "kolejka") p.set("widok", w);
    if (o.page && o.page > 1) p.set("page", String(o.page));
    const s = p.toString();
    return s ? `/tickets/poczta?${s}` : "/tickets/poczta";
  };
  const licznik: Record<Widok, number | null> = { kolejka: lista.liczby.kolejka, spam: lista.liczby.spam, wszystkie: null };

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Klienci i usługi · Zgłoszenia</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Poczta bez klienta <Pomoc id="poczta-bez-klienta" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Maile do support@ i abuse@, których nie przypisaliśmy do konta klienta, oraz spam. Maile klientów trafiają od razu do zgłoszeń.
        </p>
        {!lista.konfiguracja ? (
          <p className="text-sm text-amber-300">Import poczty jest wyłączony — brak skrzynki w konfiguracji API (CONTROL_PLANE_MAIL_TICKETS_USER).</p>
        ) : null}
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Widok">
        {(Object.keys(WIDOKI) as Widok[]).map((w) => (
          <Link key={w} href={href({ widok: w })} aria-current={w === widok ? "page" : undefined} className={`${PRZYCISK} ${w === widok ? "!border-emerald-400/40 !text-emerald-200" : ""}`}>
            {WIDOKI[w]}
            {licznik[w] ? ` (${licznik[w]})` : ""}
          </Link>
        ))}
      </nav>

      <section className={KARTA} aria-label="Wiadomości" data-lista="poczta">
        {lista.rows.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak wiadomości w tym widoku.</div> : null}
        {lista.rows.map((w) => {
          const st = WYNIK[w.wynik] ?? { t: w.wynik, ton: "muted" as const };
          const decyzja = w.wynik === "BEZ_KLIENTA" || w.wynik === "SPAM";
          return (
            <div key={w.id} className={`${WIERSZ} flex-col !items-start gap-1.5`} data-wynik={w.wynik}>
              <div className="flex w-full flex-wrap items-center gap-2">
                <span className="font-mono text-xs text-muted-foreground">{kiedy(w.otrzymano)}</span>
                <Pigulka ton={st.ton} className="!text-xs">{st.t}</Pigulka>
                {w.rodzaj === "ABUSE" ? <Pigulka ton="crit" className="!text-xs">abuse@</Pigulka> : null}
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{w.temat || "(bez tematu)"}</span>
              </div>
              <div className="text-[12.5px] text-muted-foreground">
                {w.nadawcaNazwa ? `${w.nadawcaNazwa} ` : ""}&lt;{w.nadawca}&gt;
                {w.powod ? ` · ${w.powod}` : ""}
                {w.sugerowaneZgloszenieId ? ` · wątek zgłoszenia #${w.sugerowaneZgloszenieId.slice(0, 8)}` : ""}
                {w.ticketId ? ` · zgłoszenie #${w.ticketId.slice(0, 8)}` : ""}
              </div>
              {w.tresc ? (
                <details className="w-full text-sm">
                  <summary className="cursor-pointer text-xs text-muted-foreground">Treść</summary>
                  <pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-md bg-black/30 p-2 text-[12.5px]">{w.tresc}</pre>
                </details>
              ) : null}
              <PlikiPoczty id={w.id} pliki={w.zalaczniki} />
              {decyzja && !brakZmian ? <DecyzjePoczty id={w.id} nadawca={w.nadawca} sugerowane={w.sugerowaneZgloszenieId} /> : null}
            </div>
          );
        })}
      </section>

      {lista.totalPages > 1 ? (
        <nav className="flex items-center gap-2 text-sm" aria-label="Strony">
          {lista.page > 1 ? <Link className={PRZYCISK} href={href({ page: lista.page - 1 })}>Poprzednia</Link> : null}
          <span className="text-muted-foreground">Strona {lista.page} z {lista.totalPages}</span>
          {lista.page < lista.totalPages ? <Link className={PRZYCISK} href={href({ page: lista.page + 1 })}>Następna</Link> : null}
        </nav>
      ) : null}

      <section className={`${KARTA} p-4`} aria-labelledby="blokady-nadawcow">
        <h2 id="blokady-nadawcow" className="mb-2 text-base font-semibold">Zablokowani nadawcy</h2>
        <BlokadyNadawcow blokady={blokady} moze={!brakZmian} />
      </section>
    </div>
  );
}

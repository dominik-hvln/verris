import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Eyebrow, KARTA, PRZYCISK, WIERSZ } from "@/components/v2";
import { TICKET_PRIORITY_PL, etykieta } from "@verris/contracts";
import { plForm } from "@/lib/pl";

export const dynamic = "force-dynamic";

type Terminy = { dotrzymane: number; przekroczone: number; wToku: number; bez: number };
type RaportObslugi = {
  okres: { dni: number; od: string; do: string };
  sla: {
    zgloszen: number;
    odpowiedz: Terminy & { procent: number | null };
    rozwiazanie: Terminy & { procent: number | null };
    wgPriorytetu: Record<string, { odpowiedz: Terminy; rozwiazanie: Terminy }>;
    medianaPierwszejMin: number | null;
  };
  csat: { ocen: number; obsluga: number | null; opiekun: number | null; rozwiazanePct: number | null };
  osoby: {
    agentId: string;
    nazwa: string;
    odpowiedzi: number;
    odpowiedziNaKlienta: number;
    medianaMin: number | null;
    zamkniete: number;
    ocen: number;
    ocenaOpiekuna: number | null;
  }[];
};

const OKRESY = [7, 30, 90] as const;
const PRIORYTETY = ["URGENT", "HIGH", "NORMAL", "LOW"];

/** Minuty po ludzku: „45 min”, „3 h 10 min”, „2 dni 4 h”. */
function czasMin(m: number | null): string {
  if (m == null) return "—";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ""}`;
  return `${Math.floor(h / 24)} dni${h % 24 ? ` ${h % 24} h` : ""}`;
}

const proc = (p: number | null) => (p == null ? "—" : `${p.toLocaleString("pl-PL")}%`);
const liczba = (x: number | null, po = "") => (x == null ? "—" : `${x.toLocaleString("pl-PL")}${po}`);
const dotrz = (t: Terminy) => {
  const n = t.dotrzymane + t.przekroczone;
  return n ? `${Math.round((t.dotrzymane / n) * 100)}% (${t.dotrzymane}/${n})` : "—";
};

/**
 * F3.7 (OE-32) — raporty obsługi dla kierownika zmiany (TICKETS_REPORTS) i administratora: terminy SLA,
 * oceny klientów (CSAT) i wyniki osób z zespołu. Liczby z API (admin/support/raporty), strona tylko pokazuje.
 */
export default async function RaportyObslugiPage({ searchParams }: { searchParams?: Promise<{ dni?: string }> }) {
  const bramka = await bramkaStrony("/tickets/raporty");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  const dni = OKRESY.find((d) => String(d) === q.dni) ?? 30;
  let r: RaportObslugi;
  try {
    r = await adminApi<RaportObslugi>(`/admin/support/raporty?dni=${dni}`);
  } catch (e) {
    return <BladStrony blad={e} tytul="Raporty obsługi" powrot={{ href: "/tickets", label: "Zgłoszenia" }} />;
  }
  const s = r.sla;
  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Klienci i usługi · Zgłoszenia</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Raporty obsługi <Pomoc id="raporty-obslugi" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Zgłoszenia założone w ostatnich {dni} dniach: terminy SLA, oceny klientów i praca zespołu. Scalone zgłoszenia liczą się raz — w docelowym.
        </p>
      </header>

      <nav className="flex flex-wrap gap-1.5" aria-label="Okres">
        {OKRESY.map((d) => (
          <Link key={d} href={d === 30 ? "/tickets/raporty" : `/tickets/raporty?dni=${d}`} aria-current={d === dni ? "page" : undefined} className={`${PRZYCISK} ${d === dni ? "!border-emerald-400/40 !text-emerald-200" : ""}`}>
            {d} dni
          </Link>
        ))}
      </nav>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Podsumowanie" data-raport="podsumowanie">
        <Kafel tytul="Pierwsza odpowiedź w terminie" wartosc={proc(s.odpowiedz.procent)} opis={`${s.odpowiedz.przekroczone} po terminie · ${s.odpowiedz.wToku} w toku`} />
        <Kafel tytul="Rozwiązanie w terminie" wartosc={proc(s.rozwiazanie.procent)} opis={`${s.rozwiazanie.przekroczone} po terminie · ${s.rozwiazanie.wToku} w toku`} />
        <Kafel tytul="Mediana 1. odpowiedzi" wartosc={czasMin(s.medianaPierwszejMin)} opis={`${s.zgloszen} ${plForm(s.zgloszen, "zgłoszenie", "zgłoszenia", "zgłoszeń")} w okresie`} />
        <Kafel
          tytul="Ocena obsługi (CSAT)"
          wartosc={liczba(r.csat.obsluga, "/5")}
          opis={`${r.csat.ocen} ${plForm(r.csat.ocen, "ocena", "oceny", "ocen")} · opiekun ${liczba(r.csat.opiekun, "/5")} · rozwiązane ${proc(r.csat.rozwiazanePct)}`}
        />
      </section>

      <section className={KARTA} aria-labelledby="sla-priorytet" data-raport="sla">
        <h2 id="sla-priorytet" className="px-4 pt-3.5 text-base font-semibold">
          Terminy SLA według priorytetu
        </h2>
        <div className={`${WIERSZ} !border-t-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground`}>
          <span className="w-[120px]">Priorytet</span>
          <span className="flex-1">Pierwsza odpowiedź</span>
          <span className="flex-1">Rozwiązanie</span>
        </div>
        {PRIORYTETY.filter((p) => s.wgPriorytetu[p]).map((p) => (
          <div key={p} className={`${WIERSZ} text-sm`}>
            <span className="w-[120px] font-semibold">{etykieta(TICKET_PRIORITY_PL, p)}</span>
            <span className="flex-1">{dotrz(s.wgPriorytetu[p]!.odpowiedz)}</span>
            <span className="flex-1">{dotrz(s.wgPriorytetu[p]!.rozwiazanie)}</span>
          </div>
        ))}
        {Object.keys(s.wgPriorytetu).length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak zgłoszeń w tym okresie.</div> : null}
      </section>

      <section className={KARTA} aria-labelledby="osoby" data-raport="osoby">
        <h2 id="osoby" className="px-4 pt-3.5 text-base font-semibold">
          Zespół
        </h2>
        <p className="px-4 text-xs text-muted-foreground">
          Odpowiedzi bez notatek i automatów. Czas odpowiedzi — od pierwszej nieodpowiedzianej wiadomości klienta (mediana).
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Osoba</th>
                <th className="px-4 py-2 text-right">Odpowiedzi</th>
                <th className="px-4 py-2 text-right">Mediana czasu</th>
                <th className="px-4 py-2 text-right">Zamknięte</th>
                <th className="px-4 py-2 text-right">Ocena opiekuna</th>
              </tr>
            </thead>
            <tbody>
              {r.osoby.map((o) => (
                <tr key={o.agentId} className="border-t border-line">
                  <td className="px-4 py-2 font-semibold">{o.nazwa}</td>
                  <td className="px-4 py-2 text-right font-mono">{o.odpowiedzi}</td>
                  <td className="px-4 py-2 text-right font-mono">{czasMin(o.medianaMin)}</td>
                  <td className="px-4 py-2 text-right font-mono">{o.zamkniete}</td>
                  <td className="px-4 py-2 text-right font-mono">{o.ocen ? `${liczba(o.ocenaOpiekuna, "/5")} (${o.ocen})` : "—"}</td>
                </tr>
              ))}
              {r.osoby.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-3 text-muted-foreground">
                    Nikt z zespołu nie odpowiadał w tym okresie.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Kafel({ tytul, wartosc, opis }: { tytul: string; wartosc: string; opis: string }) {
  return (
    <div className={`${KARTA} flex flex-col gap-1 p-4`}>
      <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{tytul}</span>
      <span className="font-display text-[28px] font-extrabold leading-none">{wartosc}</span>
      <span className="text-[12.5px] text-muted-foreground">{opis}</span>
    </div>
  );
}

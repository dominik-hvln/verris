import Link from "next/link";
import { KARTA, LinkKarty, NaglowekKarty, Pasek, Pigulka, WIERSZ } from "@/components/v2";
import type { PrzegladWezla } from "./przeglad-data";

/** PB-34 — zakładka „Przegląd” strony węzła 1:1 z makiety AdminWezel.dc.html. */
const STREFA = "Europe/Warsaw";

function kiedy(iso: string) {
  const d = new Date(iso);
  const dzien = (x: Date) => x.toLocaleDateString("pl-PL", { timeZone: STREFA });
  const godz = d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: STREFA });
  if (dzien(d) === dzien(new Date())) return `dziś ${godz}`;
  return `${d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", timeZone: STREFA })} ${godz}`;
}

const KROPKA_ZADANIA: Record<string, string> = {
  COMPLETED: "bg-data",
  FAILED: "bg-crit",
  RUNNING: "bg-warn",
  QUEUED: "bg-muted-foreground",
  CANCELLED: "bg-muted-foreground",
};
const STAN_ZADANIA: Record<string, string> = { RUNNING: "w toku", QUEUED: "w kolejce", CANCELLED: "anulowane", FAILED: "nieudane" };

function Znacznik({ stan }: { stan: "ok" | "warn" | "crit" | "brak" }) {
  const styl = {
    ok: "bg-data-soft text-data-hi",
    warn: "bg-warn-soft text-warn",
    crit: "bg-[color-mix(in_srgb,var(--crit)_14%,transparent)] text-crit",
    brak: "bg-raised text-muted-foreground",
  }[stan];
  const znak = { ok: "✓", warn: "!", crit: "✕", brak: "?" }[stan];
  const opis = { ok: "w porządku", warn: "ostrzeżenie", crit: "błąd", brak: "brak danych" }[stan];
  return (
    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${styl}`} role="img" aria-label={opis}>
      {znak}
    </span>
  );
}

export function WezelPrzeglad({ p, bazaHref }: { p: PrzegladWezla; bazaHref: string }) {
  const z = p.zgodnosc;
  return (
    <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
      <div className="flex flex-col gap-5">
        <section className={KARTA} aria-labelledby="zgodnosc">
          <NaglowekKarty id="zgodnosc" tytul="Zgodność z manifestem floty">
            <span className="ml-auto">
              {z.rozjazdy > 0 ? (
                <Pigulka ton="warn" className="!text-xs">
                  {z.rozjazdy} {z.rozjazdy === 1 ? "rozjazd" : z.rozjazdy < 5 ? "rozjazdy" : "rozjazdów"}
                </Pigulka>
              ) : z.bezRaportu ? (
                <Pigulka ton="muted" className="!text-xs">
                  węzeł jeszcze nie raportował
                </Pigulka>
              ) : (
                <Pigulka ton="ok" className="!text-xs">
                  wszystko zgodne
                </Pigulka>
              )}
            </span>
          </NaglowekKarty>
          <div className={`${WIERSZ} !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
            <span className="flex-1">Składnik</span>
            <span className="w-[110px] sm:w-[150px]">Manifest</span>
            <span className="w-[110px] sm:w-[150px]">Na węźle</span>
          </div>
          {z.pozycje.map((x) => (
            <div key={x.co} className={WIERSZ}>
              <span className="flex-1">{x.co}</span>
              <span className="w-[110px] font-mono text-[13px] text-muted-foreground sm:w-[150px]">{x.oczekiwane}</span>
              <span className={`w-[110px] break-all font-mono text-[13px] sm:w-[150px] ${x.zgodne === false ? "text-warn" : x.faktyczne ? "" : "text-muted-foreground"}`}>
                {x.faktyczne ?? "brak raportu"}
              </span>
            </div>
          ))}
        </section>

        <section className={KARTA} aria-labelledby="obciazone">
          <NaglowekKarty id="obciazone" tytul="Najbardziej obciążone konta">
            <LinkKarty href={`${bazaHref}?sekcja=konta`}>Wszystkie konta →</LinkKarty>
          </NaglowekKarty>
          {p.obciazone.length === 0 ? (
            <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak próbek zużycia z ostatnich 10 minut.</div>
          ) : (
            p.obciazone.map((k) => (
              <div key={k.id} className={WIERSZ}>
                <Link href={`/customers/${k.klientId}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                  <span className="text-sm font-semibold">{k.domena}</span>
                  <span className="text-[12.5px] text-muted-foreground">
                    {[k.plan, k.klient, k.autoskalowanieCpu ? `autoskalowanie +${k.autoskalowanieCpu}% CPU` : null].filter(Boolean).join(" · ")}
                  </span>
                </Link>
                <span className="hidden w-[180px] sm:block">
                  <Pasek proc={k.proc ?? 0} ton={(k.proc ?? 0) >= 60 ? "warn" : "ok"} />
                </span>
                <span className="w-[50px] text-right font-mono text-[13px]">{k.proc}%</span>
              </div>
            ))
          )}
        </section>
      </div>

      <div className="flex flex-col gap-5">
        <section className={`${KARTA} flex flex-col gap-3.5 p-[18px]`} aria-labelledby="gotowosc">
          <h2 id="gotowosc" className="font-display text-[17px] font-bold">
            Gotowość
          </h2>
          {p.gotowosc.map((g) => (
            <div key={g.co} className="flex items-start gap-3">
              <Znacznik stan={g.stan} />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="font-semibold">{g.co}</span>
                <span className="text-[13px] text-muted-foreground">{g.opis}</span>
              </div>
              {g.naprawa ? (
                <Link
                  href={`${bazaHref}?sekcja=${g.naprawa}`}
                  className="ml-auto inline-flex h-8 shrink-0 items-center rounded-[9px] border border-line-strong px-3 text-[13px] font-semibold hover:border-primary"
                >
                  Napraw
                </Link>
              ) : null}
            </div>
          ))}
        </section>

        <section className={KARTA} aria-labelledby="zadania">
          <NaglowekKarty id="zadania" tytul="Ostatnie zadania">
            <LinkKarty href={`${bazaHref}?sekcja=zadania`}>Wszystkie →</LinkKarty>
          </NaglowekKarty>
          {p.zadania.length === 0 ? (
            <div className={`${WIERSZ} text-sm text-muted-foreground`}>Węzeł nie wykonywał jeszcze zadań.</div>
          ) : (
            p.zadania.map((t) => (
              <div key={t.id} className={WIERSZ}>
                <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${KROPKA_ZADANIA[t.status] ?? "bg-muted-foreground"}`} />
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <span>
                    {t.tekst}
                    {STAN_ZADANIA[t.status] ? <span className="text-muted-foreground"> — {STAN_ZADANIA[t.status]}</span> : null}
                  </span>
                  {t.blad ? <span className="text-[12.5px] text-crit">{t.blad}</span> : null}
                </span>
                <span className="shrink-0 font-mono text-xs text-muted-foreground">{kiedy(t.at)}</span>
              </div>
            ))
          )}
        </section>
      </div>
    </div>
  );
}

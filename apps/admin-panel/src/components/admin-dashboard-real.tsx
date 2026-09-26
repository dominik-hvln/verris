import Link from "next/link";
import { Plus } from "lucide-react";
import type { AdminDashboardOverview } from "@/lib/admin-overview-data";
import { FleetUpdateButton } from "@/app/(dashboard)/nodes/fleet-update-button";
import { Pigulka } from "./admin-shell";
import { clients, plForm, plural } from "@/lib/pl";

/**
 * PB-34 — pulpit admina 1:1 z makiety Main.dc.html („Stan platformy”).
 * Liczby wyłącznie z bazy (API `GET /admin/dashboard/overview`) — nic przykładowego.
 */
const STREFA = "Europe/Warsaw";

// N-20 — szczegół zgłoszenia żyje w panelu obsługi, admin nie ma trasy /tickets/:id.
const obsluga = process.env.NEXT_PUBLIC_STAFF_PANEL_URL?.trim() || "https://staff.verris.pl";
const adres = (href: string) => (href.startsWith("/tickets/") ? new URL(href, obsluga).toString() : href);

const zl = (n: number | string) =>
  Number(n).toLocaleString("pl-PL", { maximumFractionDigits: 0 });

function Slupki({ wartosci }: { wartosci: number[] }) {
  const max = Math.max(...wartosci, 0);
  return (
    <div className="flex h-[34px] items-end gap-1" aria-hidden="true">
      {wartosci.map((v, i) => (
        <span
          key={i}
          className={`flex-1 rounded-[2px] ${i === wartosci.length - 1 ? "bg-data" : "bg-data-3"}`}
          style={{ height: `${max > 0 ? Math.max(8, Math.round((v / max) * 100)) : 8}%` }}
        />
      ))}
    </div>
  );
}

function Pasek({ proc, ton = "ok" }: { proc: number; ton?: "ok" | "warn" }) {
  return (
    <span className="block h-1.5 w-full overflow-hidden rounded-[3px] bg-raised" role="img" aria-label={`${proc}%`}>
      <span className={`block h-full rounded-[3px] ${ton === "warn" ? "bg-warn" : "bg-data"}`} style={{ width: `${Math.max(2, proc)}%` }} />
    </span>
  );
}

const Eyebrow = ({ children }: { children: React.ReactNode }) => (
  <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">{children}</span>
);

function NaglowekKarty({ id, tytul, children }: { id: string; tytul: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 px-[18px] py-4">
      <h2 id={id} className="font-display text-[17px] font-bold">
        {tytul}
      </h2>
      {children}
    </div>
  );
}

const LinkKarty = ({ href, children }: { href: string; children: React.ReactNode }) => (
  <Link href={href} className="ml-auto text-[13px] font-semibold text-data-hi hover:underline">
    {children}
  </Link>
);

const STATUS_USLUGI: Record<string, { t: string; ton: "ok" | "warn" | "crit" | "muted" }> = {
  ACTIVE: { t: "działa", ton: "ok" },
  PROVISIONING: { t: "zakładanie", ton: "warn" },
  PENDING_PAYMENT: { t: "czeka na płatność", ton: "warn" },
  PAST_DUE: { t: "zaległa płatność", ton: "warn" },
  SUSPENDED: { t: "zawieszona", ton: "crit" },
  CANCELED: { t: "anulowana", ton: "muted" },
  EXPIRED: { t: "wygasła", ton: "muted" },
};

function godzina(iso: string) {
  const d = new Date(iso);
  const dzien = (x: Date) => x.toLocaleDateString("pl-PL", { timeZone: STREFA });
  return dzien(d) === dzien(new Date())
    ? d.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: STREFA })
    : d.toLocaleDateString("pl-PL", { day: "2-digit", month: "2-digit", timeZone: STREFA });
}

export function AdminDashboardReal({ o }: { o: AdminDashboardOverview }) {
  const teraz = new Date(o.generatedAt);
  const dzien = teraz.toLocaleDateString("pl-PL", { weekday: "long", day: "numeric", month: "long", timeZone: STREFA });
  const czas = teraz.toLocaleTimeString("pl-PL", { hour: "2-digit", minute: "2-digit", timeZone: STREFA });
  const n = o.naUwadze.length;
  const u = o.uslugi;
  const z = o.zgloszenia;
  const wezlyRazem = o.flota.wezly.length;

  return (
    <div className="flex flex-col gap-[22px]">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-2">
          <Eyebrow>
            {(dzien.charAt(0).toUpperCase() + dzien.slice(1)).replace(",", "")} · {czas}
          </Eyebrow>
          <h1 className="font-display text-[32px] font-extrabold tracking-[-0.03em] lg:text-[40px]">Stan platformy</h1>
          <div className="flex flex-wrap items-center gap-3 text-[15px] text-verris-body">
            {n > 0 ? (
              <Pigulka ton={o.naUwadze.some((x) => x.waga === "crit") ? "crit" : "warn"}>
                {plural(n, "sprawa", "sprawy", "spraw")} {plForm(n, "wymaga", "wymagają", "wymaga")} uwagi
              </Pigulka>
            ) : (
              <Pigulka ton="ok">Nic nie wymaga uwagi</Pigulka>
            )}
            <span className="text-muted-foreground">
              {plural(wezlyRazem, "węzeł", "węzły", "węzłów")} · {clients(o.klienci.razem)} ·{" "}
              {plural(u.wszystkie, "usługa", "usługi", "usług")}
            </span>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2.5">
          <FleetUpdateButton />
          <Link
            href="/nodes/wizard"
            className="inline-flex h-[38px] items-center gap-2 rounded-[9px] border border-primary bg-primary px-3.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-[15px] w-[15px]" strokeWidth={2.4} />
            Dodaj węzeł
          </Link>
        </div>
      </div>

      <section className="grid grid-cols-1 rounded-[10px] border border-line bg-card sm:grid-cols-2 xl:grid-cols-4" aria-label="Wskaźniki">
        <div className="flex flex-col gap-2.5 px-5 py-[18px]">
          <Eyebrow>Klienci</Eyebrow>
          <span className="font-display text-[30px] font-bold tracking-[-0.02em]">{o.klienci.razem.toLocaleString("pl-PL")}</span>
          <Slupki wartosci={o.klienci.dzienne7} />
          <span className={`text-[13px] ${o.klienci.nowi7d > 0 ? "text-data-hi" : "text-muted-foreground"}`}>
            {o.klienci.nowi7d > 0 ? `+${o.klienci.nowi7d} w ostatnich 7 dniach` : "brak nowych w 7 dniach"}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 border-line px-5 py-[18px] max-sm:border-t sm:border-l">
          <Eyebrow>Aktywne usługi</Eyebrow>
          <div>
            <span className="font-display text-[30px] font-bold tracking-[-0.02em]">{u.aktywne.toLocaleString("pl-PL")}</span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">
              hosting {u.hosting} · poczta {u.poczta}
              {u.inne ? ` · inne ${u.inne}` : ""}
            </span>
          </div>
          <div className="mt-3.5">
            <Pasek proc={u.wszystkie ? Math.round((u.aktywne / u.wszystkie) * 100) : 0} />
          </div>
          <span className="text-[13px] text-muted-foreground">
            {u.zakladane} zakładane · {plural(u.zawieszone, "zawieszona", "zawieszone", "zawieszonych")}
          </span>
        </div>
        <div className="flex flex-col gap-2.5 border-line px-5 py-[18px] max-xl:border-t xl:border-l">
          <Eyebrow>Wpływy · {o.wplywy.okresDni} dni</Eyebrow>
          <div>
            <span className="font-display text-[30px] font-bold tracking-[-0.02em]">{zl(o.wplywy.bruttoPln)}</span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">zł</span>
          </div>
          <Slupki wartosci={o.wplywy.dzienne7} />
          <span className="text-[13px] text-muted-foreground">opłacone faktury brutto, bez korekt</span>
        </div>
        <div className="flex flex-col gap-2.5 border-line px-5 py-[18px] max-sm:border-t sm:border-l">
          <Eyebrow>Zgłoszenia</Eyebrow>
          <div>
            <span className="font-display text-[30px] font-bold tracking-[-0.02em]">{z.otwarte}</span>
            <span className="ml-1.5 font-mono text-xs text-muted-foreground">otwarte</span>
          </div>
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {z.poTerminie > 0 ? (
              <Pigulka ton="crit" className="!text-xs">
                {z.poTerminie} po terminie SLA
              </Pigulka>
            ) : (
              <Pigulka ton="ok" className="!text-xs">
                w terminie SLA
              </Pigulka>
            )}
            {z.dzis > 0 ? (
              <Pigulka ton="warn" className="!text-xs">
                {z.dzis} dziś
              </Pigulka>
            ) : null}
          </div>
          <Link href="/tickets" className="text-[13px] font-semibold text-data-hi hover:underline">
            Otwórz skrzynkę →
          </Link>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <section className="rounded-[10px] border border-line bg-card" aria-labelledby="uwaga">
          <NaglowekKarty id="uwaga" tytul="Wymaga uwagi">
            <span className="ml-auto text-[13px] text-muted-foreground">najpilniejsze na górze</span>
          </NaglowekKarty>
          {n === 0 ? (
            <div className="flex items-center gap-3.5 border-t border-line px-[18px] py-[13px] text-sm text-muted-foreground">
              <span className="w-1 self-stretch rounded-sm bg-data" />
              Wszystkie węzły, zgłoszenia i płatności są w porządku.
            </div>
          ) : (
            o.naUwadze.map((s, i) => (
              <div key={`${s.href}-${i}`} className="flex items-center gap-3.5 border-t border-line px-[18px] py-[13px]">
                <span className={`w-1 self-stretch rounded-sm ${s.waga === "crit" ? "bg-crit" : "bg-warn"}`} aria-label={s.waga === "crit" ? "pilne" : "ostrzeżenie"} />
                <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                  <span className="font-semibold">{s.tytul}</span>
                  <span className="text-[13px] text-muted-foreground">{s.opis}</span>
                </div>
                <Link
                  href={adres(s.href)}
                  className="inline-flex h-[34px] shrink-0 items-center rounded-[9px] border border-line-strong px-3.5 text-sm font-semibold hover:border-primary"
                >
                  {s.akcja}
                </Link>
              </div>
            ))
          )}
        </section>

        <section className="rounded-[10px] border border-line bg-card" aria-labelledby="flota">
          <NaglowekKarty id="flota" tytul="Flota">
            <span className="font-mono text-[11px] text-muted-foreground">manifest {o.flota.manifest}</span>
            <LinkKarty href="/nodes">Wszystkie węzły →</LinkKarty>
          </NaglowekKarty>
          <div className="flex items-center gap-3.5 border-t border-line px-[18px] py-2.5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground">
            <span className="w-[110px] sm:w-[150px]">Węzeł</span>
            <span className="flex-1">CPU realne</span>
            <span className="w-[50px] text-right sm:w-[70px]">Konta</span>
            <span className="w-[70px] text-right">Sygnał</span>
          </div>
          {o.flota.wezly.length === 0 ? (
            <div className="border-t border-line px-[18px] py-[13px] text-sm text-muted-foreground">
              Brak węzłów — dodaj pierwszy kreatorem.
            </div>
          ) : (
            o.flota.wezly.map((w) => (
              <Link key={w.id} href={`/nodes/${w.id}`} className="flex items-center gap-3.5 border-t border-line px-[18px] py-[13px] hover:bg-raised">
                <span className="flex w-[110px] min-w-0 shrink-0 items-center gap-2 sm:w-[150px]">
                  <span className={`h-[7px] w-[7px] shrink-0 rounded-full ${w.stan === "crit" ? "bg-crit" : w.stan === "warn" ? "bg-warn" : "bg-data"}`} />
                  <span className="truncate font-mono text-[13px]">{w.nazwa}</span>
                </span>
                <span className="min-w-0 flex-1">
                  {w.poza ? (
                    <span className={`block text-[13px] ${w.stan === "crit" ? "text-crit" : "text-warn"}`} title={w.poza}>{w.poza}</span>
                  ) : w.cpuProc == null ? (
                    <span className="text-[13px] text-muted-foreground">brak próbek</span>
                  ) : (
                    <Pasek proc={w.cpuProc} ton={w.cpuProc >= 60 ? "warn" : "ok"} />
                  )}
                </span>
                <span className="w-[50px] shrink-0 text-right font-mono sm:w-[70px]">{w.konta}</span>
                <span className={`w-[70px] text-right text-[13px] ${w.naZywo ? "text-data-hi" : w.stan === "crit" ? "text-crit" : "text-muted-foreground"}`}>{w.sygnal}</span>
              </Link>
            ))
          )}
        </section>
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        <section className="rounded-[10px] border border-line bg-card" aria-labelledby="zdarzenia">
          <NaglowekKarty id="zdarzenia" tytul="Ostatnie zdarzenia">
            <LinkKarty href="/audit">Dziennik →</LinkKarty>
          </NaglowekKarty>
          {o.zdarzenia.length === 0 ? (
            <div className="border-t border-line px-[18px] py-[13px] text-sm text-muted-foreground">Brak zdarzeń.</div>
          ) : (
            o.zdarzenia.map((e) => (
              <div key={e.id} className="flex items-center gap-3.5 border-t border-line px-[18px] py-[13px]">
                <span className="w-[50px] shrink-0 font-mono text-xs text-muted-foreground">{godzina(e.at)}</span>
                <span className="flex-1 text-sm">
                  {e.tekst}
                  {e.czego ? (
                    <>
                      {" — "}
                      {e.href ? (
                        <Link href={e.href} className="font-bold hover:underline">
                          {e.czego}
                        </Link>
                      ) : (
                        <b>{e.czego}</b>
                      )}
                    </>
                  ) : null}
                  {e.kto ? <span className="text-muted-foreground"> · {e.kto}</span> : null}
                </span>
              </div>
            ))
          )}
        </section>
        <section className="rounded-[10px] border border-line bg-card" aria-labelledby="uslugi">
          <NaglowekKarty id="uslugi" tytul="Nowe usługi">
            <LinkKarty href="/subscriptions">Wszystkie →</LinkKarty>
          </NaglowekKarty>
          {o.noweUslugi.length === 0 ? (
            <div className="border-t border-line px-[18px] py-[13px] text-sm text-muted-foreground">Brak usług.</div>
          ) : (
            o.noweUslugi.map((s) => {
              const st = STATUS_USLUGI[s.status] ?? { t: s.status, ton: "muted" as const };
              const opis = [
                s.plan,
                s.cenaIndywidualna ? `cena indywidualna ${zl(s.cenaIndywidualna)} zł` : s.interval === "YEAR" ? "rocznie" : "miesięcznie",
                s.wezel ?? (s.status === "PROVISIONING" ? "zakładanie" : null),
              ].filter(Boolean);
              return (
                <div key={s.id} className="flex items-center gap-3.5 border-t border-line px-[18px] py-[13px]">
                  <Link href={`/customers/${s.klientId}`} className="flex min-w-0 flex-1 flex-col hover:underline">
                    <span className="truncate text-sm font-semibold">{s.domena ?? s.klient}</span>
                    <span className="truncate text-[12.5px] text-muted-foreground">{opis.join(" · ")}</span>
                  </Link>
                  <Pigulka ton={st.ton} className="!text-xs">
                    {st.t}
                  </Pigulka>
                </div>
              );
            })
          )}
        </section>
      </div>
    </div>
  );
}

import Link from "next/link";
import { TICKET_PRIORITY_PL, TICKET_STATUS_PL, etykieta, uslugaWezla } from "@verris/contracts";
import { KARTA, Kpi, Pigulka, RzadKpi, WIERSZ } from "./v2";
import { plForm } from "@/lib/pl";

/**
 * F3.9 (OP-07) — pulpity per rola z API admin/pulpit/* (apps/api/src/admin-dashboard/pulpity-rol.service.ts):
 * obsługa (moje zgłoszenia i SLA, kolejka), NOC (flota, alerty, kolejki, kopie, przekroczenia), finanse (nieudane
 * płatności, KSeF, do zapłaty, do zaksięgowania). Liczby wyłącznie z API; każdy wiersz prowadzi do miejsca pracy.
 */

const obsluga = process.env.NEXT_PUBLIC_STAFF_PANEL_URL?.trim() || "https://staff.verris.pl";
const zgloszenieHref = (id: string) => new URL(`/tickets/${id}`, obsluga).toString();
const kiedy = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type StanSla = "po-terminie" | "zagrozone" | "w-terminie" | "brak";
type WierszZgl = { id: string; temat: string; status: string; priorytet: string; klient: string | null; termin: string | null; rodzajTerminu: "odpowiedz" | "rozwiazanie" | null; stan: StanSla };
export type PulpitObslugiDane = {
  moje: { otwarte: number; poTerminie: number; zagrozone: number; czekaNaKlienta: number; lista: WierszZgl[] };
  kolejka: { nieprzypisane: number; poTerminie: number; pilne: number; lista: WierszZgl[] };
};

const TON_SLA: Record<StanSla, "crit" | "warn" | "ok" | "muted"> = { "po-terminie": "crit", zagrozone: "warn", "w-terminie": "ok", brak: "muted" };
const TEKST_SLA: Record<StanSla, string> = { "po-terminie": "po terminie", zagrozone: "termin blisko", "w-terminie": "w terminie", brak: "bez terminu" };

function ListaZgloszen({ wiersze, pusto }: { wiersze: WierszZgl[]; pusto: string }) {
  if (!wiersze.length) return <div className={`${WIERSZ} text-sm text-muted-foreground`}>{pusto}</div>;
  return (
    <>
      {wiersze.map((z) => (
        <a key={z.id} href={zgloszenieHref(z.id)} className={`${WIERSZ} hover:bg-raised`} data-zgloszenie={z.id}>
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="truncate font-semibold">{z.temat}</span>
            <span className="text-[12.5px] text-muted-foreground">
              #{z.id.slice(0, 8)} · {z.klient ?? "—"} · {etykieta(TICKET_PRIORITY_PL, z.priorytet)} · {etykieta(TICKET_STATUS_PL, z.status).toLowerCase()}
            </span>
          </span>
          <span className="flex flex-col items-end gap-1 text-right">
            <Pigulka ton={TON_SLA[z.stan]} className="!text-xs">
              {TEKST_SLA[z.stan]}
            </Pigulka>
            {z.termin ? (
              <span className="font-mono text-[11px] text-muted-foreground">
                {z.rodzajTerminu === "odpowiedz" ? "odpowiedź" : "rozwiązanie"} do {kiedy(z.termin)}
              </span>
            ) : null}
          </span>
        </a>
      ))}
    </>
  );
}

export function PulpitObslugi({ d }: { d: PulpitObslugiDane }) {
  return (
    <div className="flex flex-col gap-5" data-pulpit="obsluga">
      <RzadKpi etykieta="Moje zgłoszenia">
        <Kpi etykieta="Moje otwarte" wartosc={d.moje.otwarte} opis={`${d.moje.czekaNaKlienta} ${plForm(d.moje.czekaNaKlienta, "czeka", "czekają", "czeka")} na klienta`} />
        <Kpi etykieta="Po terminie SLA" wartosc={d.moje.poTerminie} opis="pierwsza odpowiedź albo rozwiązanie" />
        <Kpi etykieta="Termin w 2 h" wartosc={d.moje.zagrozone} opis="zajmij się nimi teraz" />
        <Kpi etykieta="Nieprzypisane w kolejce" wartosc={d.kolejka.nieprzypisane} opis={`${d.kolejka.poTerminie} po terminie · ${d.kolejka.pilne} pilnych`} />
      </RzadKpi>
      <section className={KARTA} aria-labelledby="moje-zgl">
        <h2 id="moje-zgl" className="px-[18px] pt-3.5 text-base font-semibold">
          Moje zgłoszenia — najbliższe terminy
        </h2>
        <ListaZgloszen wiersze={d.moje.lista} pusto="Nie masz przypisanych otwartych zgłoszeń." />
      </section>
      <section className={KARTA} aria-labelledby="kolejka-zgl">
        <h2 id="kolejka-zgl" className="flex items-center gap-2 px-[18px] pt-3.5 text-base font-semibold">
          Kolejka bez opiekuna{" "}
          <Link href="/tickets" className="ml-auto text-sm font-normal text-data-hi hover:underline">
            Skrzynka →
          </Link>
        </h2>
        <ListaZgloszen wiersze={d.kolejka.lista} pusto="Wszystkie zgłoszenia mają opiekuna." />
      </section>
    </div>
  );
}

type SprawaUwagi = { waga: "crit" | "warn"; tytul: string; opis: string; akcja: string; href: string };
export type PulpitNocDane = {
  flota: { aktywne: number; serwis: number; offline: number; bezSygnalu: number; przyjmujaKonta: number; uwaga: SprawaUwagi[] };
  alerty: {
    uslugi: { serverId: string; wezel: string; usluga: string }[];
    incydenty: { id: string; tytul: string; powazny: boolean; od: string; wezel: { id: string; nazwa: string } | null }[];
  };
  kolejki: { zakladane: number; zadaniaWToku: number; zadaniaBledyDoba: number; bledy: { id: string; rodzaj: string; kiedy: string | null; wezel: { id: string; nazwa: string }; blad: string | null }[] };
  kopie: { kontaBezSwiezejKopii: number };
  przekroczenia: { kontDoba: number; najgorsze: { serverId: string; wezel: string; domena: string | null; subscriptionId: string | null; razemDoba: number }[] };
};

export function PulpitNoc({ d }: { d: PulpitNocDane }) {
  const alertow = d.alerty.uslugi.length + d.alerty.incydenty.length + d.flota.uwaga.length;
  return (
    <div className="flex flex-col gap-5" data-pulpit="noc">
      <RzadKpi etykieta="Flota">
        <Kpi etykieta="Węzły aktywne" wartosc={d.flota.aktywne} opis={`${d.flota.przyjmujaKonta} przyjmuje konta · ${d.flota.serwis} w serwisie · ${d.flota.offline} offline`} />
        <Kpi etykieta="Bez sygnału" wartosc={d.flota.bezSygnalu} opis="aktywne węzły bez sygnału agenta > 5 min" />
        <Kpi etykieta="Kolejki" wartosc={d.kolejki.zakladane} opis={`zakładanych usług · ${d.kolejki.zadaniaWToku} zadań węzłów w toku · ${d.kolejki.zadaniaBledyDoba} nieudanych w dobie`} />
        <Kpi etykieta="Konta bez świeżej kopii" wartosc={d.kopie.kontaBezSwiezejKopii} opis={`${d.przekroczenia.kontDoba} ${plForm(d.przekroczenia.kontDoba, "konto", "konta", "kont")} z przekroczeniami w dobie`} />
      </RzadKpi>
      <section className={KARTA} aria-labelledby="alerty-noc" data-alerty={alertow}>
        <h2 id="alerty-noc" className="px-[18px] pt-3.5 text-base font-semibold">
          Alerty
        </h2>
        {alertow === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak alertów — usługi działają, węzły odpowiadają.</div> : null}
        {d.alerty.uslugi.map((u) => (
          <Link key={`${u.serverId}-${u.usluga}`} href={`/nodes/${u.serverId}?sekcja=uslugi`} className={`${WIERSZ} hover:bg-raised`} data-alert-usluga={u.usluga}>
            <Pigulka ton="crit" className="!text-xs">
              usługa
            </Pigulka>
            <span className="text-sm">
              <b>{uslugaWezla(u.usluga)?.etykieta ?? u.usluga}</b> nie działa na {u.wezel}
            </span>
          </Link>
        ))}
        {d.alerty.incydenty.map((i) => (
          <Link key={i.id} href={i.wezel ? `/nodes/${i.wezel.id}` : "/status/incidents"} className={`${WIERSZ} hover:bg-raised`}>
            <Pigulka ton={i.powazny ? "crit" : "warn"} className="!text-xs">
              incydent
            </Pigulka>
            <span className="text-sm">
              {i.tytul}
              {i.wezel ? ` · ${i.wezel.nazwa}` : ""} · od {kiedy(i.od)}
            </span>
          </Link>
        ))}
        {d.flota.uwaga.map((s) => (
          <Link key={`${s.href}-${s.tytul}`} href={s.href} className={`${WIERSZ} hover:bg-raised`}>
            <Pigulka ton={s.waga} className="!text-xs">
              węzeł
            </Pigulka>
            <span className="flex flex-col text-sm">
              <b>{s.tytul}</b>
              <span className="text-[12.5px] text-muted-foreground">{s.opis}</span>
            </span>
          </Link>
        ))}
      </section>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={KARTA} aria-labelledby="bledy-zadan">
          <h2 id="bledy-zadan" className="flex items-center px-[18px] pt-3.5 text-base font-semibold">
            Nieudane zadania węzłów (doba)
            <Link href="/provisioning-queue" className="ml-auto text-sm font-normal text-data-hi hover:underline">
              Kolejka →
            </Link>
          </h2>
          {d.kolejki.bledy.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak nieudanych zadań w ostatniej dobie.</div> : null}
          {d.kolejki.bledy.map((z) => (
            <Link key={z.id} href={`/nodes/${z.wezel.id}?sekcja=zadania`} className={`${WIERSZ} hover:bg-raised`}>
              <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(z.kiedy)}</span>
              <span className="flex min-w-0 flex-col text-sm">
                <b className="truncate">
                  {z.rodzaj} · {z.wezel.nazwa}
                </b>
                {z.blad ? <span className="truncate text-[12.5px] text-muted-foreground">{z.blad}</span> : null}
              </span>
            </Link>
          ))}
        </section>
        <section className={KARTA} aria-labelledby="przekroczenia-noc">
          <h2 id="przekroczenia-noc" className="flex items-center px-[18px] pt-3.5 text-base font-semibold">
            Najwięcej przekroczeń limitów (doba)
            <Link href="/nodes/przekroczenia" className="ml-auto text-sm font-normal text-data-hi hover:underline">
              Wszystkie →
            </Link>
          </h2>
          {d.przekroczenia.najgorsze.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Żadne konto nie odbijało się od limitów.</div> : null}
          {d.przekroczenia.najgorsze.map((p) => (
            <Link key={`${p.serverId}-${p.domena}`} href={p.subscriptionId ? `/subscriptions/${p.subscriptionId}` : `/nodes/${p.serverId}?sekcja=konta`} className={`${WIERSZ} hover:bg-raised`}>
              <span className="flex-1 text-sm">
                <b>{p.domena ?? "konto spoza panelu"}</b> · {p.wezel}
              </span>
              <span className="font-mono text-sm">{p.razemDoba}×</span>
            </Link>
          ))}
          <Link href="/nodes/kopie" className={`${WIERSZ} text-sm hover:bg-raised`}>
            Konta bez świeżej kopii: <b>{d.kopie.kontaBezSwiezejKopii}</b> <span className="ml-auto text-data-hi">Kopie floty →</span>
          </Link>
        </section>
      </div>
    </div>
  );
}

export type PulpitFinansowDane = {
  nieudanePlatnosci: { tydzien: number; ucieto: boolean; lista: { id: string; zrodlo: string; kiedy: string; klient: { id: string; email: string } | null; kwota: string; waluta: string; powod: string }[] } | null;
  ksef: { odrzucone: number; doDoslania: number; lista: { id: string; numer: string; blad: string | null; wystawiono: string | null; klient: string }[] };
  doZaplaty: { dokumentow: number; kwota: string; poTerminie: number };
  doZaksiegowania: { wplat: number; najstarsza: string | null };
};

const zl = (k: string) => `${Number(k).toLocaleString("pl-PL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} zł`;

export function PulpitFinansow({ d }: { d: PulpitFinansowDane }) {
  return (
    <div className="flex flex-col gap-5" data-pulpit="finanse">
      <RzadKpi etykieta="Finanse">
        <Kpi etykieta="Nieudane płatności (7 dni)" wartosc={d.nieudanePlatnosci?.tydzien ?? "—"} opis={d.nieudanePlatnosci?.ucieto ? "lista ucięta — zobacz pełną" : "karta, przelew online, auto-doładowanie"} />
        <Kpi etykieta="KSeF odrzucone" wartosc={d.ksef.odrzucone} opis={`${d.ksef.doDoslania} do dosłania (tryb offline)`} />
        <Kpi etykieta="Do zapłaty" wartosc={d.doZaplaty.dokumentow} opis={`${zl(d.doZaplaty.kwota)} · ${d.doZaplaty.poTerminie} po terminie`} />
        <Kpi
          etykieta="Do zaksięgowania"
          wartosc={d.doZaksiegowania.wplat}
          opis={d.doZaksiegowania.najstarsza ? `wpłaty bez faktury z programu księgowego · najstarsza ${kiedy(d.doZaksiegowania.najstarsza)}` : "wpłaty bez faktury z programu księgowego"}
        />
      </RzadKpi>
      <div className="grid gap-5 xl:grid-cols-2">
        <section className={KARTA} aria-labelledby="nieudane-fin">
          <h2 id="nieudane-fin" className="flex items-center px-[18px] pt-3.5 text-base font-semibold">
            Nieudane płatności
            <Link href="/billing/nieudane" className="ml-auto text-sm font-normal text-data-hi hover:underline">
              Wszystkie →
            </Link>
          </h2>
          {!d.nieudanePlatnosci ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Nie udało się wczytać.</div> : null}
          {d.nieudanePlatnosci?.lista.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak nieudanych płatności w 7 dniach.</div> : null}
          {d.nieudanePlatnosci?.lista.map((p) => (
            <Link key={p.id} href={p.klient ? `/customers/${p.klient.id}?sekcja=rozliczenia` : "/billing/nieudane"} className={`${WIERSZ} hover:bg-raised`}>
              <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(p.kiedy)}</span>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <b className="truncate">{p.klient?.email ?? "—"}</b>
                <span className="truncate text-[12.5px] text-muted-foreground">{p.powod}</span>
              </span>
              <span className="font-mono text-sm">{zl(p.kwota)}</span>
            </Link>
          ))}
        </section>
        <section className={KARTA} aria-labelledby="ksef-fin">
          <h2 id="ksef-fin" className="flex items-center px-[18px] pt-3.5 text-base font-semibold">
            Odrzucone przez KSeF
            <Link href="/invoices?ksef=REJECTED" className="ml-auto text-sm font-normal text-data-hi hover:underline">
              Faktury →
            </Link>
          </h2>
          {d.ksef.lista.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>KSeF niczego nie odrzucił.</div> : null}
          {d.ksef.lista.map((f) => (
            <Link key={f.id} href={`/invoices/${f.id}`} className={`${WIERSZ} hover:bg-raised`}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <b className="font-mono">{f.numer}</b>
                <span className="truncate text-[12.5px] text-muted-foreground">
                  {f.klient}
                  {f.blad ? ` · ${f.blad}` : ""}
                </span>
              </span>
            </Link>
          ))}
          <Link href="/invoices/czeka-na-fakture" className={`${WIERSZ} text-sm hover:bg-raised`}>
            Wpłaty do zaksięgowania: <b>{d.doZaksiegowania.wplat}</b> <span className="ml-auto text-data-hi">Czeka na fakturę →</span>
          </Link>
        </section>
      </div>
    </div>
  );
}

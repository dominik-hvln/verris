import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { fetchStaffAccess } from "@/lib/staff-access";
import { accounts, plural } from "@/lib/pl";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Eyebrow, KARTA, Kpi, NaglowekKarty, Pigulka, RzadKpi, WIERSZ } from "@/components/v2";
import { ETYKIETA_STANU, rozmiar, wiek, type KopieFloty, type ProbaOdtworzenia } from "./dane";

export const dynamic = "force-dynamic";

const kiedy = (iso: string) => new Date(iso).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", dateStyle: "short", timeStyle: "short" });
const czas = (s: number) => (s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`);
const DOBA = 24 * 60 * 60 * 1000;
/** Komponent serwerowy renderuje się raz na żądanie — „teraz” to chwila żądania (jak na karcie klienta). */
const chwila = () => Date.now();
const ID = /^[0-9a-zA-Z-]{1,64}$/;

/**
 * F3.3 — „Kopie floty” (NODES_VIEW: admin, NOC): kopia bazy panelu, ostatni przebieg kopii poza serwerem każdego węzła,
 * konta bez świeżej albo z nieudaną kopią, harmonogram i retencja (odczyt; retencję zmienia ADMIN w „Kopie offsite”),
 * ostatnie próby odtworzenia. `?wezel=` zawęża do jednego węzła. Pełna historia prób — tylko ADMIN (trasa ADMIN).
 */
export default async function KopieFlotyPage({ searchParams }: { searchParams?: Promise<{ wezel?: string }> }) {
  const bramka = await bramkaStrony("/nodes/kopie");
  if (bramka) return bramka;
  const q = (await searchParams) ?? {};
  const wezel = q.wezel && ID.test(q.wezel) ? q.wezel : undefined;
  let dane: KopieFloty;
  try {
    dane = await adminApi<KopieFloty>(`/admin/servers/kopie${wezel ? `?wezel=${encodeURIComponent(wezel)}` : ""}`);
  } catch (e) {
    return <BladStrony blad={e} tytul="Kopie floty" powrot={{ href: "/nodes", label: "Węzły" }} />;
  }
  const dostep = await fetchStaffAccess();
  // Historia prób (notatki, liczby wierszy) — tylko ADMIN; błąd nie chowa reszty strony.
  const historia = dostep.isAdmin
    ? await adminApi<ProbaOdtworzenia[]>("/admin/live-readiness/proby-odtworzenia").catch(() => null)
    : null;
  const teraz = chwila();
  const p = dane.podsumowanie;
  const bezSwiezej = p.przeterminowane + p.bezKopii;
  const zawezony = wezel ? dane.wezly[0] : undefined;

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Flota · Kopie</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Kopie floty{zawezony ? ` · ${zawezony.nazwa}` : ""} <Pomoc id="kopie-floty" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Kopia każdego konta poza serwerem, {dane.harmonogram.opis}. Konto bez udanej kopii dłużej niż {dane.progDni}{" "}
          {plural(dane.progDni, "dzień", "dni", "dni")} uruchamia alert.
          {wezel ? (
            <>
              {" "}
              <Link href="/nodes/kopie" className="font-semibold text-data-hi hover:underline">
                Cała flota
              </Link>
            </>
          ) : null}
        </p>
      </header>

      <RzadKpi etykieta="Stan kopii kont">
        <Kpi etykieta="Świeża kopia" wartosc={p.ok} jednostka={`z ${p.kont}`} opis={p.nowe ? `${p.nowe} ${accounts(p.nowe)} czeka na pierwszą` : "konta z kopią z ostatnich dni"} />
        <Kpi etykieta="Nieudane" wartosc={<span className={p.nieudane ? "text-crit" : ""}>{p.nieudane}</span>} opis="ostatni przebieg nie skopiował konta" />
        <Kpi etykieta="Bez świeżej kopii" wartosc={<span className={bezSwiezej ? "text-warn" : ""}>{bezSwiezej}</span>} opis={`${p.bezKopii} bez żadnej · ${p.przeterminowane} starych`} />
        <Kpi etykieta="Kopie klienta na serwerze" wartosc={<span className={p.lokalneNieudane ? "text-warn" : ""}>{p.lokalneNieudane}</span>} opis="nieudane zaplanowane przez klienta" />
      </RzadKpi>

      <section className={KARTA} aria-labelledby="wezly" data-karta="wezly">
        <NaglowekKarty id="wezly" tytul="Węzły — ostatni przebieg" />
        {dane.wezly.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak aktywnych węzłów.</div> : null}
        {dane.wezly.map((w) => {
          const b = w.przebieg;
          const ton = !b ? "crit" : !b.ok ? "crit" : w.nieaktualny ? "warn" : "ok";
          return (
            <div key={w.id} className={`${WIERSZ} flex-wrap items-start`} data-wezel={w.id}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <Link href={`/nodes/${w.id}`} className="font-semibold hover:underline">
                  {w.nazwa}
                </Link>
                <span className="text-[12.5px] text-muted-foreground">
                  {b
                    ? `${kiedy(b.kiedy)}${b.konta !== null ? ` · ${b.konta} ${accounts(b.konta)}` : ""}${b.bajty !== null ? ` · ${rozmiar(b.bajty)}` : ""}${b.czasS !== null ? ` · ${czas(b.czasS)}` : ""}`
                    : "Węzeł nie zgłosił jeszcze przebiegu kopii."}
                </span>
                {b && !b.ok && b.opis ? <span className="text-[12.5px] text-crit [overflow-wrap:anywhere]">{b.opis.slice(0, 300)}</span> : null}
                <span className="text-[12.5px] text-muted-foreground">
                  Konta: {w.konta.ok} świeżych z {w.konta.kont}
                  {w.konta.nieudane ? ` · ${w.konta.nieudane} nieudanych` : ""}
                  {w.konta.bezSwiezej ? ` · ${w.konta.bezSwiezej} bez świeżej` : ""}
                  {w.konta.wlasnaRetencja ? ` · ${w.konta.wlasnaRetencja} z własną retencją` : ""}
                </span>
              </span>
              <Link href={`/nodes/kopie?wezel=${w.id}`} className="text-[13px] font-semibold text-data-hi hover:underline">
                Konta węzła
              </Link>
              <Pigulka ton={ton} className="!text-xs">
                {!b ? "brak przebiegu" : !b.ok ? "nieudany" : w.nieaktualny ? "nieaktualny" : "udany"}
              </Pigulka>
            </div>
          );
        })}
      </section>

      <section className={KARTA} aria-labelledby="konta" data-karta="konta">
        <NaglowekKarty id="konta" tytul="Konta z problemem" />
        {dane.konta.length === 0 ? (
          <div className={`${WIERSZ} text-sm text-muted-foreground`}>Każde konto ma świeżą kopię albo czeka na pierwszą.</div>
        ) : null}
        {dane.konta.map((k) => {
          const e = ETYKIETA_STANU[k.stan];
          return (
            <div key={k.accountId} className={`${WIERSZ} flex-wrap items-start`} data-konto={k.login}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <Link href={`/subscriptions/${k.subscriptionId}?sekcja=kopie`} className="font-semibold hover:underline">
                  {k.domena}
                </Link>
                <span className="text-[12.5px] text-muted-foreground">
                  {k.login} · {k.wezel.nazwa} · ostatnia udana: {k.ostatniaUdana ? `${kiedy(k.ostatniaUdana)} (${wiek(k.ostatniaUdana, teraz)} temu, ${rozmiar(k.rozmiar)})` : "nigdy"}
                  {k.ostatniaNieudana && k.stan === "nieudana" ? ` · nieudana: ${kiedy(k.ostatniaNieudana)}` : ""}
                </span>
                {k.lokalnaNieudana ? (
                  <span className="text-[12.5px] text-warn [overflow-wrap:anywhere]">
                    Kopia klienta na serwerze nie powiodła się{k.lokalnaNieudana.kiedy ? ` (${kiedy(k.lokalnaNieudana.kiedy)})` : ""}: {k.lokalnaNieudana.blad}
                  </span>
                ) : null}
              </span>
              <Pigulka ton={e.ton} className="!text-xs">
                {e.tekst}
              </Pigulka>
            </div>
          );
        })}
        {dane.kontUcietych ? (
          <div className={`${WIERSZ} text-sm text-muted-foreground`}>
            I {dane.kontUcietych} {accounts(dane.kontUcietych)} więcej — zawęź do węzła.
          </div>
        ) : null}
      </section>

      <section className={KARTA} aria-labelledby="polityka" data-karta="polityka">
        <NaglowekKarty id="polityka" tytul="Harmonogram i retencja">
          {dostep.isAdmin ? (
            <Link href="/settings/kopie-offsite" className="ml-auto text-[13px] font-semibold text-data-hi hover:underline">
              Zmień retencję
            </Link>
          ) : null}
        </NaglowekKarty>
        <div className={`${WIERSZ} text-sm`}>
          <span className="flex-1">Harmonogram</span>
          <span className="text-muted-foreground">{dane.harmonogram.opis}, ten sam na każdym węźle</span>
        </div>
        <div className={`${WIERSZ} text-sm`}>
          <span className="flex-1">Retencja poza serwerem</span>
          {dane.offsite.skonfigurowany ? (
            <span className="text-muted-foreground">{dane.offsite.retencjaDni} dni dla floty; klient może wydłużyć w granicach planu</span>
          ) : (
            <Pigulka ton="crit" className="!text-xs">
              kopie poza serwerem nieskonfigurowane
            </Pigulka>
          )}
        </div>
        <div className={`${WIERSZ} text-sm`}>
          <span className="flex-1">Kopia bazy panelu</span>
          {dane.bazaPanelu.obecna ? (
            <span className={dane.bazaPanelu.wiekS > 25 * 3600 ? "text-warn" : "text-muted-foreground"}>
              {kiedy(dane.bazaPanelu.kiedy)} · {rozmiar(dane.bazaPanelu.rozmiar)}
            </span>
          ) : (
            <Pigulka ton="crit" className="!text-xs">
              nie widać kopii
            </Pigulka>
          )}
        </div>
      </section>

      <section className={KARTA} aria-labelledby="proby" data-karta="ostatnie">
        <NaglowekKarty id="proby" tytul="Próby odtworzenia — ostatnia per źródło">
          <Pomoc id="proby-odtworzenia" />
        </NaglowekKarty>
        {dane.proby.length === 0 ? <div className={`${WIERSZ} text-sm text-warn`}>Nie było jeszcze żadnej próby odtworzenia.</div> : null}
        {dane.proby.map((pr) => {
          const stara = teraz - new Date(pr.finishedAt).getTime() > 30 * DOBA;
          return (
            <div key={pr.source} className={WIERSZ} data-zrodlo={pr.source}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <span className="break-all font-mono text-[13px]">{pr.source}</span>
                <span className="text-[12.5px] text-muted-foreground">
                  {kiedy(pr.finishedAt)} · {czas(pr.durationSec)} · {pr.owner}
                  {stara ? " · starsza niż 30 dni" : ""}
                </span>
              </span>
              <Pigulka ton={pr.result === "OK" ? (stara ? "warn" : "ok") : "crit"} className="!text-xs">
                {pr.result === "OK" ? "udana" : "nieudana"}
              </Pigulka>
            </div>
          );
        })}
      </section>

      {historia ? <HistoriaProb proby={historia} /> : null}
    </div>
  );
}

function HistoriaProb({ proby }: { proby: ProbaOdtworzenia[] }) {
  return (
    <section className={KARTA} aria-labelledby="historia" data-karta="historia">
      <NaglowekKarty id="historia" tytul="Historia prób (50 ostatnich)" />
      {proby.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak prób.</div> : null}
      {proby.map((p) => (
        <div key={p.id} className={`${WIERSZ} items-start`}>
          <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(p.finishedAt)}</span>
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <span className="break-all font-mono text-[13px]">{p.objectName}</span>
            <span className="text-[12.5px] text-muted-foreground">
              {czas(p.durationSec)} · {p.owner}
              {p.rowCounts && Object.keys(p.rowCounts).length ? ` · ${Object.entries(p.rowCounts).map(([t, n]) => `${t}: ${n}`).join(", ")}` : ""}
            </span>
            {p.notes ? <span className="text-[12.5px] [overflow-wrap:anywhere]">{p.notes}</span> : null}
          </span>
          <Pigulka ton={p.result === "OK" ? "ok" : "crit"} className="!text-xs">
            {p.result === "OK" ? "udana" : "nieudana"}
          </Pigulka>
        </div>
      ))}
    </section>
  );
}

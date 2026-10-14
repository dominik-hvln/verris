"use client";

import { useState, useTransition } from "react";
import { Checkbox } from "@/components/checkbox";
import { PoleDaty } from "@/components/pole-daty";
import { Pomoc } from "@/components/pomoc";
import { potwierdz } from "@/components/potwierdz";
import { Select } from "@/components/select";
import { adresPodgladuAction, dzialanieTablicyAction, podgladRaportuAction, type DzialanieTablicy } from "../tablica-actions";
import { ETAPY, nazwaEtapu, opisZdarzenia, type ObslugaMigracji, type PodgladRaportu, type PoleChecklisty } from "../tablica-typy";

const POLE = "rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white";
const PRZYCISK = "rounded-lg border px-3 py-1.5 text-xs disabled:opacity-50";
const kiedy = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pl-PL", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Warsaw" }) : "—";
/** ISO → wartość PoleDaty („2026-10-11” albo „2026-10-11T14:30”) w czasie lokalnym przeglądarki. */
const doPola = (iso: string | null, zGodzina = false) => {
  if (!iso) return "";
  const d = new Date(iso);
  const dwa = (n: number) => String(n).padStart(2, "0");
  const dzien = `${d.getFullYear()}-${dwa(d.getMonth() + 1)}-${dwa(d.getDate())}`;
  return zGodzina ? `${dzien}T${dwa(d.getHours())}:${dwa(d.getMinutes())}` : dzien;
};
/** Wartość PoleDaty → ISO (data bez godziny = koniec dnia); puste → null. */
const zPola = (v: string) => {
  if (!v) return null;
  const d = new Date(v.includes("T") ? v : `${v}T23:59:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};

const POLA_TEKSTOWE: { pole: Exclude<PoleChecklisty, "ttl300">; nazwa: string; etap: string; placeholder: string; doKlienta: boolean }[] = [
  { pole: "testTymczasowy", nazwa: "Wynik testu strony na tymczasowym adresie", etap: "przed zmianą DNS", placeholder: "np. PageSpeed 92, TTFB 160 ms, strona i formularz działają", doKlienta: false },
  { pole: "testPrzed", nazwa: "Test wydajności przed (stary hosting)", etap: "do raportu", placeholder: "np. LCP 4,1 s, TTFB 900 ms", doKlienta: true },
  { pole: "testPo", nazwa: "Test wydajności po (Verris)", etap: "do raportu", placeholder: "np. LCP 1,3 s, TTFB 160 ms", doKlienta: true },
  { pole: "optymalizacja", nazwa: "Optymalizacja przeprowadzona", etap: "do raportu", placeholder: "Co zrobiliśmy: cache, obrazy, wersja PHP…", doKlienta: true },
  { pole: "podsumowanie", nazwa: "Podsumowanie dla klienta", etap: "do raportu", placeholder: "Co przenieśliśmy i co klient ma sprawdzić", doKlienta: true },
];

/**
 * D11 — obsługa migracji na karcie zlecenia: etap z warunkami przejścia, terminy, Przerywacz, prowadzący,
 * zgłoszenie, „Sprawdź DNS”, checklisty, raport do klienta jednym kliknięciem i log kontaktów na osi czasu.
 */
export function ObslugaMigracjiPanel({ initial, subscriptionId }: { initial: ObslugaMigracji; subscriptionId?: string }) {
  const [o, setO] = useState(initial);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function wykonaj(dzialanie: DzialanieTablicy, dane: Record<string, unknown>, okText: string, poSukcesie?: () => void) {
    setMsg(null);
    start(async () => {
      const r = await dzialanieTablicyAction<ObslugaMigracji & { dns?: { komunikat: string } }>(o.id, dzialanie, dane);
      if (!r.ok) setMsg({ ok: false, text: r.error });
      else {
        const { dns, ...panel } = r.wynik;
        setO(panel);
        // „Sprawdź DNS” — komunikat o stanie DNS zamiast ogólnego „gotowe”.
        setMsg({ ok: true, text: dns?.komunikat ?? okText });
        poSukcesie?.();
      }
    });
  }

  return (
    <section id="obsluga" className="space-y-4 rounded-xl border border-indigo-500/30 bg-indigo-500/[0.04] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-white">
          Obsługa migracji <Pomoc id="tablica-migracji" />
        </h2>
        <span className="text-xs text-muted-foreground">
          Automat: {o.statusOpis} · DNS: {o.cutoverAt ? `przełączony ${kiedy(o.cutoverAt)}` : "jeszcze nie"}
        </span>
      </div>

      <Etapy o={o} pending={pending} wykonaj={wykonaj} />
      <Terminy o={o} pending={pending} wykonaj={wykonaj} />
      <Checklista o={o} pending={pending} wykonaj={wykonaj} subscriptionId={subscriptionId} />
      <Raport o={o} pending={pending} wykonaj={wykonaj} />
      <Kontakty o={o} pending={pending} wykonaj={wykonaj} />

      {msg ? <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>{msg.text}</p> : null}
    </section>
  );
}

type Props = {
  o: ObslugaMigracji;
  pending: boolean;
  wykonaj: (d: DzialanieTablicy, dane: Record<string, unknown>, ok: string, poSukcesie?: () => void) => void;
};

function Etapy({ o, pending, wykonaj }: Props) {
  const [okno, setOkno] = useState(String(o.oknoPoprawekDni));
  const [cofnijDo, setCofnijDo] = useState("");
  const [powod, setPowod] = useState("");
  const indeks = ETAPY.findIndex((e) => e.etap === o.etap);
  const wczesniejsze = ETAPY.slice(0, indeks);
  return (
    <div className="space-y-2">
      <ol className="flex flex-wrap gap-1.5 text-[11px]" aria-label="Etapy">
        {ETAPY.map((e, i) => (
          <li
            key={e.etap}
            aria-current={e.etap === o.etap ? "step" : undefined}
            className={`rounded-full border px-2.5 py-1 ${
              e.etap === o.etap
                ? "border-indigo-400/60 bg-indigo-500/20 text-white"
                : i < indeks
                  ? "border-emerald-500/30 text-emerald-200"
                  : "border-white/10 text-muted-foreground"
            }`}
          >
            {e.nazwa}
          </li>
        ))}
      </ol>
      {o.etap === "PO_PRZELACZENIU" && o.poprawkiDo ? (
        <p className="text-xs text-muted-foreground">Okno poprawek do {kiedy(o.poprawkiDo)}.</p>
      ) : null}
      {o.dalej ? (
        <div className="space-y-1.5">
          {o.dalej.braki.length > 0 ? (
            <ul className="list-inside list-disc text-xs text-amber-200/90" aria-label="Brakuje do następnego etapu">
              {o.dalej.braki.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">
            {o.etap === "DO_ZMIANY_DNS" ? (
              <button
                type="button"
                disabled={pending}
                onClick={() => wykonaj("sprawdz-dns", {}, "Sprawdzono DNS.")}
                className={`${PRZYCISK} border-sky-500/40 bg-sky-500/10 text-sky-100 hover:bg-sky-500/20`}
              >
                Sprawdź DNS
              </button>
            ) : null}
            {o.dalej.etap === "PO_PRZELACZENIU" ? (
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                Okno poprawek (dni)
                <input value={okno} onChange={(e) => setOkno(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={`${POLE} w-14`} />
              </label>
            ) : null}
            <button
              type="button"
              disabled={pending || o.dalej.braki.length > 0}
              title={o.dalej.braki.join(" · ") || undefined}
              onClick={() =>
                wykonaj(
                  "etap",
                  { etap: o.dalej!.etap, ...(o.dalej!.etap === "PO_PRZELACZENIU" ? { oknoDni: Number(okno) || o.oknoPoprawekDni } : {}) },
                  `Etap: ${o.dalej!.nazwa}.`,
                )
              }
              className={`${PRZYCISK} border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20`}
            >
              Dalej: {o.dalej.nazwa}
            </button>
          </div>
        </div>
      ) : null}
      {wczesniejsze.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2">
          <Select
            aria-label="Cofnij do etapu"
            value={cofnijDo}
            onChange={setCofnijDo}
            placeholder="Cofnij do…"
            options={wczesniejsze.map((e) => ({ value: e.etap, label: e.nazwa }))}
            className={`${POLE} min-w-[10rem]`}
          />
          <input value={powod} onChange={(e) => setPowod(e.target.value)} placeholder="Powód cofnięcia (min. 10 znaków)" className={`${POLE} min-w-[16rem] flex-1`} />
          <button
            type="button"
            disabled={pending || !cofnijDo || powod.trim().length < 10}
            onClick={() => wykonaj("etap", { etap: cofnijDo, powod: powod.trim() }, `Cofnięto do: ${nazwaEtapu(cofnijDo)}.`)}
            className={`${PRZYCISK} border-amber-500/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20`}
          >
            Cofnij
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Terminy({ o, pending, wykonaj }: Props) {
  const [termin, setTermin] = useState(doPola(o.termin, true));
  const [stary, setStary] = useState(doPola(o.wygasaUStaregoAt));
  const [domena, setDomena] = useState(doPola(o.domenaWygasaAt));
  const [przypisany, setPrzypisany] = useState(o.przypisany?.id ?? "");
  const [zgloszenie, setZgloszenie] = useState(o.ticketId ? `#${o.ticketId.slice(0, 8)}` : "");
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold text-white">
        Terminy i prowadzenie <Pomoc id="termin-migracji" />
      </p>
      {o.terminStan ? (
        <p
          className={`text-xs ${o.terminStan.stan === "po-terminie" ? "text-rose-300" : o.terminStan.stan === "blisko" ? "text-amber-200" : "text-muted-foreground"}`}
        >
          {o.terminStan.stan === "po-terminie" ? "Po terminie — " : "Najbliższy termin: "}
          {o.terminStan.opis}, {kiedy(o.terminStan.data)}
        </p>
      ) : null}
      <div className="grid gap-2 md:grid-cols-2">
        <div className="space-y-1 text-[11px] text-muted-foreground">
          Termin migracji (puste = utworzenie + 3 dni: {kiedy(o.terminDomyslny)})
          <PoleDaty zGodzina value={termin} onChange={setTermin} aria-label="Termin migracji" className={POLE} />
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          Hosting u starego dostawcy wygasa
          <PoleDaty value={stary} onChange={setStary} aria-label="Wygaśnięcie u starego dostawcy" className={POLE} />
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          Domena wygasa
          <PoleDaty value={domena} onChange={setDomena} aria-label="Wygaśnięcie domeny" className={POLE} />
        </div>
        <div className="space-y-1 text-[11px] text-muted-foreground">
          Prowadzi
          <Select
            aria-label="Prowadzi"
            value={przypisany}
            onChange={setPrzypisany}
            options={[{ value: "", label: "nikt" }, ...o.operatorzy.map((x) => ({ value: x.id, label: x.email }))]}
            className={`${POLE} w-full`}
          />
        </div>
        <label className="space-y-1 text-[11px] text-muted-foreground">
          Zgłoszenie (#ab12cd34)
          <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} className={`${POLE} w-full`} />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            wykonaj(
              "ustawienia",
              {
                termin: zPola(termin),
                wygasaUStaregoAt: zPola(stary),
                domenaWygasaAt: zPola(domena),
                przypisanyDoId: przypisany || null,
                zgloszenie: zgloszenie.trim() || null,
              },
              "Zapisano terminy i prowadzenie.",
            )
          }
          className={`${PRZYCISK} border-indigo-500/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20`}
        >
          Zapisz
        </button>
        <button
          type="button"
          disabled={pending}
          aria-pressed={o.przerywacz}
          onClick={() => wykonaj("ustawienia", { przerywacz: !o.przerywacz }, o.przerywacz ? "Zdjęto Przerywacz." : "Oznaczono jako Przerywacz.")}
          className={`${PRZYCISK} ${o.przerywacz ? "border-rose-500/50 bg-rose-500/20 text-rose-100" : "border-white/15 text-muted-foreground hover:border-white/30"}`}
        >
          {o.przerywacz ? "Przerywacz — zdejmij" : "Oznacz jako Przerywacz"}
        </button>
        <Pomoc id="przerywacz" />
      </div>
    </div>
  );
}

function Checklista({ o, pending, wykonaj, subscriptionId }: Props & { subscriptionId?: string }) {
  const [teksty, setTeksty] = useState<Record<string, string>>(
    Object.fromEntries(POLA_TEKSTOWE.map((p) => [p.pole, o.checklista[p.pole]?.tekst ?? ""])),
  );
  const ttl = o.checklista.ttl300;
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold text-white">
        Checklista <Pomoc id="checklista-migracji" />
      </p>
      <label className="flex items-center gap-2 text-xs text-white">
        <Checkbox
          checked={!!ttl}
          disabled={pending}
          onChange={(e) => wykonaj("checklista", { pole: "ttl300", wartosc: e.target.checked }, e.target.checked ? "TTL 300 odhaczone." : "TTL 300 odznaczone.")}
        />
        TTL domen zmienione na 300 <span className="text-muted-foreground">(przed zmianą DNS)</span>
        {ttl ? <span className="text-[11px] text-muted-foreground">· {ttl.przez ?? "—"}, {kiedy(ttl.at)}</span> : null}
      </label>
      {POLA_TEKSTOWE.map((p) => {
        const w = o.checklista[p.pole];
        return (
          <div key={p.pole} className="space-y-1">
            <p className="text-[11px] text-muted-foreground">
              <span className={w ? "text-emerald-300" : ""}>{w ? "✓ " : ""}{p.nazwa}</span> ({p.etap}
              {p.doKlienta ? ", trafi do klienta" : ""})
              {w ? ` · ${w.przez ?? "—"}, ${kiedy(w.at)}` : ""}
            </p>
            <div className="flex flex-wrap items-start gap-2">
              <textarea
                aria-label={p.nazwa}
                value={teksty[p.pole]}
                onChange={(e) => setTeksty((t) => ({ ...t, [p.pole]: e.target.value }))}
                placeholder={p.placeholder}
                rows={p.pole === "podsumowanie" || p.pole === "optymalizacja" ? 3 : 1}
                className={`${POLE} min-w-[16rem] flex-1`}
              />
              {p.pole === "testTymczasowy" && subscriptionId ? <PodgladPrzycisk subscriptionId={subscriptionId} /> : null}
              <button
                type="button"
                disabled={pending || (teksty[p.pole] ?? "").trim() === (w?.tekst ?? "")}
                onClick={() => wykonaj("checklista", { pole: p.pole, wartosc: (teksty[p.pole] ?? "").trim() || null }, `Zapisano: ${p.nazwa}.`)}
                className={`${PRZYCISK} border-indigo-500/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20`}
              >
                Zapisz
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Raport({ o, pending, wykonaj }: Props) {
  const [podglad, setPodglad] = useState<PodgladRaportu | null>(null);
  const [blad, setBlad] = useState<string | null>(null);
  const gotowy = o.brakiRaportu.length === 0;
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold text-white">
        Raport pomigracyjny <Pomoc id="raport-pomigracyjny" />
      </p>
      {o.raportWyslanyAt ? <p className="text-xs text-emerald-300">Wysłano do klienta {kiedy(o.raportWyslanyAt)}.</p> : null}
      {!gotowy ? (
        <ul className="list-inside list-disc text-xs text-amber-200/90" aria-label="Brakuje do raportu">
          {o.brakiRaportu.map((b) => (
            <li key={b}>{b}</li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending || !gotowy}
          onClick={async () => {
            setBlad(null);
            const r = await podgladRaportuAction(o.id);
            if (r.ok) setPodglad(r.wynik);
            else setBlad(r.error);
          }}
          className={`${PRZYCISK} border-white/15 text-muted-foreground hover:border-white/30`}
        >
          Podgląd maila
        </button>
        <button
          type="button"
          disabled={pending || !gotowy}
          onClick={async () => {
            const ok = await potwierdz(
              `Wysłać klientowi raport z przeniesienia ${o.domena}? Dostanie podsumowanie, opis optymalizacji i wynik testu przed i po.`,
              { akcja: o.raportWyslanyAt ? "Wyślij ponownie" : "Wyślij raport", tytul: "Raport pomigracyjny" },
            );
            if (ok) wykonaj("raport", {}, "Raport wysłany do klienta.");
          }}
          className={`${PRZYCISK} border-emerald-500/40 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20`}
        >
          {o.raportWyslanyAt ? "Wyślij raport ponownie" : "Wyślij raport"}
        </button>
      </div>
      {blad ? <p className="text-xs text-rose-300">{blad}</p> : null}
      {podglad?.tekst ? (
        <div className="rounded-lg border border-white/10 bg-black/40 p-3 text-xs">
          <p className="font-semibold text-white">{podglad.temat}</p>
          <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap font-sans text-muted-foreground">{podglad.tekst}</pre>
        </div>
      ) : null}
    </div>
  );
}

function Kontakty({ o, pending, wykonaj }: Props) {
  const [kanal, setKanal] = useState<"TELEFON" | "MAIL">("TELEFON");
  const [tresc, setTresc] = useState("");
  const [zgloszenie, setZgloszenie] = useState("");
  const [kiedyBylo, setKiedyBylo] = useState("");
  return (
    <div className="space-y-2 border-t border-white/10 pt-3">
      <p className="text-xs font-semibold text-white">
        Kontakty i oś czasu <Pomoc id="kontakty-migracji" />
      </p>
      <div className="flex flex-wrap items-start gap-2">
        <Select
          aria-label="Kanał kontaktu"
          value={kanal}
          onChange={(v) => setKanal(v as "TELEFON" | "MAIL")}
          options={[
            { value: "TELEFON", label: "Telefon" },
            { value: "MAIL", label: "Mail" },
          ]}
          className={`${POLE} min-w-[7rem]`}
        />
        <textarea
          aria-label="Opis kontaktu"
          value={tresc}
          onChange={(e) => setTresc(e.target.value)}
          rows={2}
          placeholder="Co ustaliliście (klient może to przeczytać w eksporcie danych)"
          className={`${POLE} min-w-[16rem] flex-1`}
        />
        <input aria-label="Zgłoszenie kontaktu" value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} placeholder="#zgłoszenie (opcjonalnie)" className={`${POLE} w-40`} />
        <PoleDaty zGodzina value={kiedyBylo} onChange={setKiedyBylo} aria-label="Kiedy był kontakt" placeholder="teraz" className={POLE} />
        <button
          type="button"
          disabled={pending || tresc.trim().length < 3}
          onClick={() =>
            wykonaj("kontakty", { kanal, tresc: tresc.trim(), zgloszenie: zgloszenie.trim() || null, kiedy: zPola(kiedyBylo) }, "Kontakt zapisany.", () => {
              setTresc("");
              setKiedyBylo("");
            })
          }
          className={`${PRZYCISK} border-indigo-500/40 bg-indigo-500/10 text-indigo-100 hover:bg-indigo-500/20`}
        >
          Dodaj kontakt
        </button>
      </div>
      <ol className="space-y-1.5" aria-label="Oś czasu migracji">
        {o.os.map((w) => (
          <li key={`${w.typ}-${w.id}`} className="rounded-lg border border-white/5 bg-black/20 px-3 py-2 text-xs">
            <span className="text-muted-foreground">{kiedy(w.at)}</span>
            {w.kto ? <span className="text-muted-foreground"> · {w.kto}</span> : null}
            <span className="ml-2 text-white">
              {w.typ === "kontakt"
                ? `${w.kanal === "MAIL" ? "Mail" : "Telefon"}: ${w.tresc}${w.ticketId ? ` (zgłoszenie #${w.ticketId.slice(0, 8)})` : ""}`
                : opisZdarzenia(w.akcja ?? "", w.szczegoly)}
            </span>
          </li>
        ))}
        {o.os.length === 0 ? <li className="text-xs text-muted-foreground">Brak wpisów.</li> : null}
      </ol>
    </div>
  );
}


/** 15.10 — „Otwórz podgląd”: adres <token>.<domena podglądu> (bez adresu węzła), ważny 7 dni. */
function PodgladPrzycisk({ subscriptionId }: { subscriptionId: string }) {
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  return (
    <span className="flex flex-col gap-1">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setBlad(null);
            const r = await adresPodgladuAction(subscriptionId);
            if (!r.ok) return setBlad(r.error);
            window.open(r.wynik.url, "_blank", "noopener,noreferrer");
          })
        }
        className={`${PRZYCISK} border-white/15 text-white hover:bg-white/5`}
      >
        Otwórz podgląd
      </button>
      {blad ? <span className="text-[11px] text-rose-300">{blad}</span> : null}
    </span>
  );
}

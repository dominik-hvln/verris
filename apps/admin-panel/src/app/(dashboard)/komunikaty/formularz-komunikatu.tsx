"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { KOMUNIKAT_LIMIT_NA_MINUTE, nazwaInfrastruktury, trescPromocyjna } from "@verris/contracts";
import { KARTA, PRZYCISK } from "@/components/v2";
import { Select } from "@/components/select";
import { potwierdz } from "@/components/potwierdz";
import { plForm } from "@/lib/pl";
import { podgladKomunikatuAction, zlecKomunikatAction, type PodgladKomunikatu, type Zakres } from "./actions";

const POLE = "w-full rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";
const TRESC_STARTOWA = "Dzień dobry{imie},\n\n(co się dzieje, kogo dotyczy i czego klient może się spodziewać)\n\nPozdrawiamy,\nzespół obsługi Verris";

/**
 * F3.8 (ON-01) — komunikat serwisowy do klientów węzła albo planu: zakres i cel, temat, treść ({imie} wstawiane każdemu),
 * powód do dziennika. Najpierw podgląd (liczba i przykładowi odbiorcy, treść tak, jak ją zobaczy klient), dopiero potem
 * „Wyślij” z potwierdzeniem. Bez treści promocyjnych i nazw infrastruktury — panel ostrzega, API odrzuca.
 */
export function FormularzKomunikatu({
  wezly,
  plany,
  start: poczatek,
}: {
  wezly: { id: string; nazwa: string }[];
  plany: { id: string; nazwa: string }[];
  start: { zakres: Zakres; celId: string };
}) {
  const router = useRouter();
  const [zakres, setZakres] = useState<Zakres>(poczatek.zakres);
  const [celId, setCelId] = useState(poczatek.celId);
  const [temat, setTemat] = useState("");
  const [tresc, setTresc] = useState(TRESC_STARTOWA);
  const [powod, setPowod] = useState("");
  const [podglad, setPodglad] = useState<PodgladKomunikatu | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const cele = zakres === "WEZEL" ? wezly : plany;
  const ostrzezenie = (() => {
    const promo = trescPromocyjna(`${temat}\n${tresc}`);
    if (promo) return `Usuń treść promocyjną („${promo}”) — komunikat serwisowy wychodzi bez zgody marketingowej.`;
    const infra = nazwaInfrastruktury(`${temat}\n${tresc}`);
    return infra ? `Klient nie widzi nazw infrastruktury („${infra}”).` : null;
  })();
  const zmiana = <T,>(f: (v: T) => void) => (v: T) => {
    f(v);
    setPodglad(null);
  };

  const pokaz = () =>
    start(async () => {
      setMsg(null);
      const r = await podgladKomunikatuAction({ zakres, celId, temat, tresc });
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setPodglad(r.wynik);
    });

  const wyslij = async () => {
    if (!podglad) return;
    const n = podglad.odbiorcow;
    const ok = await potwierdz(
      `Wysłać komunikat do ${n} ${plForm(n, "klienta", "klientów", "klientów")} (${podglad.cel.nazwa})? Wysyłka potrwa ok. ${podglad.minutWysylki} min; można ją zatrzymać, ale wysłanych maili się nie cofnie.`,
      { akcja: "Wyślij", niebezpieczne: true },
    );
    if (!ok) return;
    start(async () => {
      setMsg(null);
      const r = await zlecKomunikatAction({ zakres, celId, temat, tresc, powod });
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: "Zlecone — kolejka wysyła maile w tle." });
      setPodglad(null);
      setTemat("");
      setTresc(TRESC_STARTOWA);
      setPowod("");
      router.refresh();
    });
  };

  return (
    <section className={`${KARTA} flex flex-col gap-2.5 p-[18px]`} aria-label="Nowy komunikat" data-formularz-komunikatu>
      <h2 className="font-display text-[17px] font-bold">Nowy komunikat</h2>
      <div className="grid gap-2 md:grid-cols-[1fr_2fr]">
        <Select
          value={zakres}
          onChange={(v) => {
            setZakres(v as Zakres);
            setCelId("");
            setPodglad(null);
          }}
          aria-label="Zakres"
          options={[
            { value: "WEZEL", label: "Klienci węzła" },
            { value: "PLAN", label: "Klienci planu" },
          ]}
        />
        <Select value={celId} onChange={zmiana(setCelId)} aria-label={zakres === "WEZEL" ? "Węzeł" : "Plan"} placeholder={zakres === "WEZEL" ? "Wybierz węzeł" : "Wybierz plan"} options={cele.map((c) => ({ value: c.id, label: c.nazwa }))} />
      </div>
      <input value={temat} onChange={(e) => zmiana(setTemat)(e.target.value)} maxLength={200} placeholder="Temat, np. Przerwa w działaniu poczty — pracujemy nad tym" aria-label="Temat" className={POLE} />
      <textarea value={tresc} onChange={(e) => zmiana(setTresc)(e.target.value)} maxLength={5000} rows={8} aria-label="Treść" className={`${POLE} resize-y`} />
      <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} placeholder="Powód do dziennika (min. 10 znaków), np. numer incydentu" aria-label="Powód" className={POLE} />
      {ostrzezenie ? (
        <p className="text-[13px] text-amber-200" data-ostrzezenie>
          {ostrzezenie}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-akcja="podglad" className={`${PRZYCISK} !h-8 !text-[13px]`} disabled={pending || !celId || !!ostrzezenie || temat.trim().length < 5} onClick={pokaz}>
          Podgląd odbiorców i treści
        </button>
        {podglad ? (
          <button
            type="button"
            data-akcja="wyslij"
            className={`${PRZYCISK} !h-8 !text-[13px] !border-rose-400/40 !text-rose-100`}
            disabled={pending || podglad.odbiorcow === 0 || podglad.przekroczono || powod.trim().length < 10}
            title={powod.trim().length < 10 ? "Najpierw wpisz powód" : undefined}
            onClick={() => void wyslij()}
          >
            Wyślij do {podglad.odbiorcow} {plForm(podglad.odbiorcow, "klienta", "klientów", "klientów")}
          </button>
        ) : null}
        {msg ? (
          <span role="status" className={`text-[13px] ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.tekst}
          </span>
        ) : null}
      </div>
      {podglad ? (
        <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]" data-podglad>
          <div className="flex flex-col gap-1 text-[13px]">
            <b>
              {podglad.odbiorcow} {plForm(podglad.odbiorcow, "odbiorca", "odbiorców", "odbiorców")} · {podglad.cel.nazwa}
            </b>
            <span className="text-muted-foreground">
              Wysyłka ok. {podglad.minutWysylki} min ({KOMUNIKAT_LIMIT_NA_MINUTE} maili na minutę). Właściciele usług, bez kont zespołu.
            </span>
            {podglad.przekroczono ? <span className="text-rose-300">Za dużo odbiorców w jednym komunikacie — podziel zakres.</span> : null}
            <ul className="mt-1 flex flex-col gap-0.5 font-mono text-xs">
              {podglad.przyklad.map((p) => (
                <li key={p.id}>
                  {p.email}
                  {p.nazwa ? ` — ${p.nazwa}` : ""}
                </li>
              ))}
              {podglad.odbiorcow > podglad.przyklad.length ? <li className="text-muted-foreground">… i {podglad.odbiorcow - podglad.przyklad.length} więcej</li> : null}
            </ul>
          </div>
          <pre className="max-h-[360px] overflow-auto whitespace-pre-wrap rounded-lg bg-black/30 p-3 text-xs text-neutral-200">{podglad.podgladTekst}</pre>
        </div>
      ) : null}
    </section>
  );
}

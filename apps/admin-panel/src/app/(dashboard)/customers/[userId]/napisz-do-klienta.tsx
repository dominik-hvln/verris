"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SZABLONY_MAILI_OBSLUGI, nazwaInfrastruktury, szablonMailaObslugi, trescPromocyjna, wypelnijSzablon } from "@verris/contracts";
import { KARTA, PRZYCISK } from "@/components/v2";
import { Select } from "@/components/select";
import { Pomoc } from "@/components/pomoc";
import { potwierdz } from "@/components/potwierdz";
import { wyslijMailObslugiAction } from "./mail-obslugi-actions";

const POLE = "w-full rounded-[9px] border border-line-strong bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary";

/**
 * F3.8 (ON-03) — „Napisz do klienta” na karcie klienta (zakładka Komunikacja): szablon, usługa (pole {domena}), treść do
 * poprawienia, opcjonalnie numer zgłoszenia (mail w jego wątku). Wiadomość serwisowa: od obsługi, bez nazwiska, bez treści
 * promocyjnych — panel ostrzega od razu, API i tak odrzuci. Po wysłaniu mail jest w historii obok.
 */
export function NapiszDoKlienta({ userId, imie, domeny }: { userId: string; imie: string | null; domeny: string[] }) {
  const router = useRouter();
  const id = useId();
  const [szablon, setSzablon] = useState(SZABLONY_MAILI_OBSLUGI[0].id);
  const [domena, setDomena] = useState(domeny[0] ?? "");
  const wypelnij = (sId: string, d: string) => {
    const s = szablonMailaObslugi(sId) ?? SZABLONY_MAILI_OBSLUGI[0];
    return { temat: wypelnijSzablon(s.temat, { domena: d, imie }), tresc: wypelnijSzablon(s.tresc, { domena: d, imie }) };
  };
  const [temat, setTemat] = useState(() => wypelnij(SZABLONY_MAILI_OBSLUGI[0].id, domeny[0] ?? "").temat);
  const [tresc, setTresc] = useState(() => wypelnij(SZABLONY_MAILI_OBSLUGI[0].id, domeny[0] ?? "").tresc);
  const [zgloszenie, setZgloszenie] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string } | null>(null);
  const [pending, start] = useTransition();

  const zmien = (sId: string, d: string) => {
    setSzablon(sId);
    setDomena(d);
    const w = wypelnij(sId, d);
    setTemat(w.temat);
    setTresc(w.tresc);
  };
  const promo = trescPromocyjna(`${temat}\n${tresc}`);
  // Mail do jednego klienta — jego adres IP może paść w treści (API sprawdza też adresy węzłów).
  const infra = nazwaInfrastruktury(`${temat}\n${tresc}`, { adresyIp: false });
  const ostrzezenie = promo
    ? `Usuń treść promocyjną („${promo}”) — mail serwisowy wychodzi bez zgody marketingowej.`
    : infra
      ? `Klient nie widzi nazw infrastruktury („${infra}”).`
      : null;

  const wyslij = async () => {
    if (!(await potwierdz("Wysłać ten mail do klienta? Wyjdzie od obsługi Verris, a odpowiedź wróci do zgłoszeń.", { akcja: "Wyślij" }))) return;
    start(async () => {
      setMsg(null);
      const r = await wyslijMailObslugiAction(userId, { szablon, temat, tresc, zgloszenie });
      if (!r.ok) return setMsg({ ok: false, tekst: r.error });
      setMsg({ ok: true, tekst: "Wysłano — mail jest w historii obok." });
      router.refresh();
    });
  };

  return (
    <section className={`${KARTA} flex flex-col gap-2.5 p-[18px]`} aria-labelledby={`${id}-n`} data-karta="napisz">
      <h2 id={`${id}-n`} className="flex items-center gap-1.5 font-display text-[17px] font-bold">
        Napisz do klienta <Pomoc id="mail-do-klienta" />
      </h2>
      <div className="grid gap-2 md:grid-cols-2">
        <Select value={szablon} onChange={(v) => zmien(v, domena)} aria-label="Szablon" options={SZABLONY_MAILI_OBSLUGI.map((s) => ({ value: s.id, label: s.nazwa }))} />
        {domeny.length ? (
          <Select value={domena} onChange={(v) => zmien(szablon, v)} aria-label="Usługa" options={domeny.map((d) => ({ value: d, label: d }))} />
        ) : (
          <span className="self-center text-[13px] text-muted-foreground">Klient nie ma usług z domeną.</span>
        )}
      </div>
      <input value={temat} onChange={(e) => setTemat(e.target.value)} maxLength={200} aria-label="Temat" className={POLE} />
      <textarea value={tresc} onChange={(e) => setTresc(e.target.value)} maxLength={5000} rows={8} aria-label="Treść" className={`${POLE} resize-y`} />
      <input value={zgloszenie} onChange={(e) => setZgloszenie(e.target.value)} maxLength={64} placeholder="Numer zgłoszenia (opcjonalnie, np. #ab12cd34)" aria-label="Numer zgłoszenia" className={POLE} />
      {ostrzezenie ? (
        <p className="text-[13px] text-amber-200" data-ostrzezenie>
          {ostrzezenie}
        </p>
      ) : null}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" data-akcja="wyslij-mail" disabled={pending || !!ostrzezenie || temat.trim().length < 5 || tresc.trim().length < 20} onClick={() => void wyslij()} className={`${PRZYCISK} !h-8 !text-[13px]`}>
          {pending ? "Wysyłam…" : "Wyślij mail"}
        </button>
        {msg ? (
          <span role="status" className={`text-[13px] ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
            {msg.tekst}
          </span>
        ) : null}
      </div>
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { TICKET_STATUS_PL } from "@verris/contracts";
import { Select } from "@/components/select";
import { Checkbox } from "@/components/checkbox";
import { staffBulk } from "@/lib/ticket-actions";
import type { AgentOption } from "@/lib/tickets-data";
import { plForm } from "@/lib/pl";

/** Id formularza, do którego należą pola wyboru wierszy skrzynki (atrybut `form`, wiersze są poza formularzem). */
export const FORMULARZ_MASOWY = "akcje-masowe";
const POLE = "h-[34px] rounded-lg border border-line-strong bg-card px-2.5 text-[13px] text-foreground";

/** Pole wyboru wiersza skrzynki — należy do formularza akcji masowych. */
export function ZaznaczZgloszenie({ id, temat }: { id: string; temat: string }) {
  return <Checkbox name="ids" value={id} form={FORMULARZ_MASOWY} aria-label={`Zaznacz: ${temat}`} className="h-[18px] w-[18px]" />;
}

/**
 * F3.7 — akcje masowe w skrzynce: zaznaczone zgłoszenia (najwyżej 50 — tyle co strona) → przypisz, tag ±, stan.
 * Każde zgłoszenie przechodzi przez tę samą logikę co pojedyncza zmiana (API), całość jednym wpisem w dzienniku.
 * Zamknięcie wysyła klientom podziękowanie z prośbą o ocenę — dlatego przed wykonaniem pytamy w pasku.
 */
export function AkcjeMasowe({ agenci }: { agenci: AgentOption[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [akcja, setAkcja] = useState<"przypisz" | "tag" | "stan">("przypisz");
  const [kto, setKto] = useState("");
  const [tag, setTag] = useState("");
  const [tryb, setTryb] = useState<"dodaj" | "usun">("dodaj");
  const [stan, setStan] = useState("IN_PROGRESS");
  const [potwierdz, setPotwierdz] = useState<string[] | null>(null);
  const [wynik, setWynik] = useState<{ ok: boolean; tekst: string } | null>(null);

  const zaznaczone = (form: HTMLFormElement) => new FormData(form).getAll("ids").map(String);
  const wykonaj = (ids: string[]) =>
    start(async () => {
      setPotwierdz(null);
      const r = await staffBulk({
        ids,
        akcja,
        ...(akcja === "przypisz" ? { assignedToId: kto || null } : akcja === "tag" ? { tag, tryb } : { status: stan }),
      });
      if ("error" in r) setWynik({ ok: false, tekst: r.error });
      else {
        const czesci = [`Zmieniono ${r.zmienione} ${plForm(r.zmienione, "zgłoszenie", "zgłoszenia", "zgłoszeń")}`];
        if (r.bezZmian) czesci.push(`bez zmian ${r.bezZmian}`);
        if (r.bledy.length) czesci.push(`błędy: ${r.bledy.map((b) => `#${b.id.slice(0, 8)} — ${b.blad}`).join("; ")}`);
        setWynik({ ok: !r.bledy.length, tekst: czesci.join(" · ") });
        router.refresh();
      }
    });

  return (
    <form
      id={FORMULARZ_MASOWY}
      aria-label="Akcje masowe"
      data-akcje="masowe"
      className="flex flex-wrap items-center gap-2 rounded-[10px] border border-line bg-card px-3 py-2"
      onSubmit={(e) => {
        e.preventDefault();
        const ids = zaznaczone(e.currentTarget);
        if (!ids.length) {
          setWynik({ ok: false, tekst: "Zaznacz zgłoszenia na liście." });
          return;
        }
        setWynik(null);
        setPotwierdz(ids);
      }}
    >
      <label className="flex items-center gap-2 text-[13px] text-muted-foreground">
        <Checkbox
          aria-label="Zaznacz wszystkie na stronie"
          onChange={(e) => {
            for (const el of document.querySelectorAll<HTMLInputElement>(`input[name="ids"][form="${FORMULARZ_MASOWY}"]`)) el.checked = e.target.checked;
          }}
        />
        Zaznaczone:
      </label>
      <Select
        aria-label="Akcja"
        value={akcja}
        onChange={(v) => setAkcja(v as typeof akcja)}
        className={POLE}
        options={[
          { value: "przypisz", label: "przypisz do…" },
          { value: "tag", label: "tag…" },
          { value: "stan", label: "zmień stan…" },
        ]}
      />
      {akcja === "przypisz" ? (
        <Select
          aria-label="Opiekun"
          value={kto}
          onChange={setKto}
          className={POLE}
          options={[{ value: "", label: "bez opiekuna" }, ...agenci.map((a) => ({ value: a.id, label: [a.firstName, a.lastName].filter(Boolean).join(" ") || a.email }))]}
        />
      ) : null}
      {akcja === "tag" ? (
        <>
          <Select aria-label="Dodaj czy usuń" value={tryb} onChange={(v) => setTryb(v as typeof tryb)} className={POLE} options={[{ value: "dodaj", label: "dodaj" }, { value: "usun", label: "usuń" }]} />
          <input aria-label="Tag" value={tag} maxLength={32} onChange={(e) => setTag(e.target.value)} placeholder="tag" className={`${POLE} w-[140px] outline-none focus:border-data`} />
        </>
      ) : null}
      {akcja === "stan" ? (
        <Select
          aria-label="Stan"
          value={stan}
          onChange={setStan}
          className={POLE}
          options={["OPEN", "IN_PROGRESS", "WAITING_CUSTOMER", "CLOSED"].map((s) => ({ value: s, label: TICKET_STATUS_PL[s] ?? s }))}
        />
      ) : null}
      <button type="submit" disabled={pending || (akcja === "tag" && !tag.trim())} className="inline-flex h-[34px] items-center rounded-[9px] border border-line-strong bg-card px-3 text-[13px] font-semibold hover:border-primary disabled:opacity-50">
        Wykonaj
      </button>
      {potwierdz ? (
        <span className="flex flex-wrap items-center gap-2 text-[13px]" data-masowe="potwierdzenie">
          <b>
            {potwierdz.length} {plForm(potwierdz.length, "zgłoszenie", "zgłoszenia", "zgłoszeń")}
            {akcja === "stan" && stan === "CLOSED" ? " — klienci dostaną podziękowanie z prośbą o ocenę" : ""}. Na pewno?
          </b>
          <button type="button" disabled={pending} onClick={() => wykonaj(potwierdz)} className="inline-flex h-8 items-center rounded-[9px] border border-primary bg-primary px-3 text-[12.5px] font-semibold text-primary-foreground disabled:opacity-50">
            Tak, wykonaj
          </button>
          <button type="button" onClick={() => setPotwierdz(null)} className="text-[12.5px]">
            Anuluj
          </button>
        </span>
      ) : null}
      {wynik ? (
        <span role="status" className={`text-[12.5px] ${wynik.ok ? "text-data-hi" : "text-crit"}`}>
          {wynik.tekst}
        </span>
      ) : null}
    </form>
  );
}

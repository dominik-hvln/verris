"use client";

import { useState, useTransition } from "react";
import { potwierdz } from "@/components/potwierdz";
import { Pomoc } from "@/components/pomoc";
import { Select } from "@/components/select";
import { PoleDaty } from "@/components/pole-daty";
import { POLE } from "@/components/kolejka-poczty";
import { korektaSaldaAction, wplataPrzelewemAction, type WynikRozliczen } from "../../billing/rozliczenia-actions";

const MIN_POWOD = 10;
const przycisk = "rounded-md border border-white/10 bg-white/5 px-2.5 py-1 text-xs text-neutral-200 hover:text-white disabled:opacity-50";
const etykieta = "text-xs text-neutral-400";
/** Kwota z pola formularza: przecinek albo kropka, najwyżej dwa miejsca po przecinku. */
export function kwotaZPola(v: string): number | null {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  if (!/^\d{1,6}(\.\d{1,2})?$/.test(t)) return null;
  const n = Number(t);
  return n > 0 && n <= 100_000 ? n : null;
}
const nowyKlucz = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `k-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
const dzisiaj = () => new Date().toISOString().slice(0, 10);

/**
 * F3.6 — operacje Finansów na portfelu klienta (BILLING_MANAGE: L4, Finanse): „Zaksięguj przelew” (wpłata z wyciągu,
 * referencja chroni przed podwójnym zaksięgowaniem) i „Korekta salda” (±, z powodem; klucz formularza chroni przed
 * podwójnym kliknięciem). Klient widzi wpisy jako „obsługa Verris (zgłoszenie #…)”.
 */
export function PortfelOperacje({
  userId,
  saldo,
  proformyDoZaplaty = [],
}: {
  userId: string;
  saldo: string;
  /** K4 — proformy WYSTAWIONE: przelew może je opłacić (kwota musi być równa kwocie proformy). */
  proformyDoZaplaty?: Array<{ id: string; numer: string; kwota: string }>;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; tekst: string; gdzie: "wplata" | "korekta" } | null>(null);

  const [kwotaW, setKwotaW] = useState("");
  const [tytul, setTytul] = useState("");
  const [referencja, setReferencja] = useState("");
  const [dataW, setDataW] = useState(dzisiaj);
  const [zglW, setZglW] = useState("");
  const [proformaId, setProformaId] = useState("");
  const proforma = proformyDoZaplaty.find((p) => p.id === proformaId) ?? null;

  const [kierunek, setKierunek] = useState<"plus" | "minus">("plus");
  const [kwotaK, setKwotaK] = useState("");
  const [powod, setPowod] = useState("");
  const [zglK, setZglK] = useState("");
  const [klucz, setKlucz] = useState(nowyKlucz);

  const wplata = kwotaZPola(kwotaW);
  const korekta = kwotaZPola(kwotaK);
  const wplataOk = wplata !== null && tytul.trim().length >= 3 && referencja.trim().length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(dataW);
  const korektaOk = korekta !== null && powod.trim().length >= MIN_POWOD;

  const pokaz = (gdzie: "wplata" | "korekta", r: WynikRozliczen) => setMsg(r.ok ? { ok: true, tekst: r.komunikat, gdzie } : { ok: false, tekst: r.error, gdzie });
  const brakPolaczenia = { ok: false as const, error: "Nie udało się połączyć z panelem." };

  const zaksieguj = async () => {
    if (!wplataOk || wplata === null) return;
    const doProformy = proforma ? ` jako zapłatę proformy ${proforma.numer}` : "";
    if (!(await potwierdz(`Zaksięgować przelew ${wplata.toFixed(2)} zł (${referencja.trim()}) na portfel klienta${doProformy}? Klient dostanie kredyty i potwierdzenie mailem.`, { akcja: "Zaksięguj" }))) return;
    start(async () => {
      setMsg(null);
      const r = await wplataPrzelewemAction(userId, { kwota: wplata, tytul: tytul.trim(), referencja: referencja.trim(), dataWplaty: dataW, zgloszenie: zglW, proformaId: proformaId || undefined }).catch(() => brakPolaczenia);
      pokaz("wplata", r);
      if (r.ok) {
        setKwotaW("");
        setTytul("");
        setReferencja("");
        setProformaId("");
      }
    });
  };

  const wybierzProforme = (id: string) => {
    setProformaId(id);
    const p = proformyDoZaplaty.find((x) => x.id === id);
    if (p) {
      setKwotaW(p.kwota.replace(".", ","));
      if (!tytul.trim()) setTytul(p.numer);
    }
  };

  const zapiszKorekte = async () => {
    if (!korektaOk || korekta === null) return;
    const znak = kierunek === "plus" ? "+" : "−";
    if (!(await potwierdz(`Korekta salda ${znak}${korekta.toFixed(2)} K (saldo teraz ${saldo} K)? Klient zobaczy „Korekta salda — obsługa Verris”.`, { akcja: "Zapisz korektę", niebezpieczne: kierunek === "minus" }))) return;
    start(async () => {
      setMsg(null);
      const r = await korektaSaldaAction(userId, { kierunek, kwota: korekta, powod: powod.trim(), zgloszenie: zglK, klucz }).catch(() => brakPolaczenia);
      pokaz("korekta", r);
      if (r.ok) {
        setKwotaK("");
        setPowod("");
        setKlucz(nowyKlucz());
      }
    });
  };

  const komunikat = (gdzie: "wplata" | "korekta") =>
    msg?.gdzie === gdzie ? (
      <p role="status" className={`text-xs ${msg.ok ? "text-emerald-300" : "text-rose-300"}`}>
        {msg.tekst}
      </p>
    ) : null;

  return (
    <div className="grid gap-5 border-t border-line px-[18px] py-4 lg:grid-cols-2" data-portfel-operacje="">
      <section id="wplata" className="scroll-mt-24 space-y-2" data-sekcja="wplata">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          Zaksięguj przelew <Pomoc id="wplata-przelewem" />
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className={etykieta}>Kwota (zł)</span>
            <input value={kwotaW} onChange={(e) => setKwotaW(e.target.value)} inputMode="decimal" placeholder="123,45" disabled={pending} className={POLE} data-pole="kwota-wplaty" />
          </label>
          <div className="block space-y-1">
            <label htmlFor="wplata-data" className={etykieta}>
              Data wpływu
            </label>
            <PoleDaty id="wplata-data" value={dataW} onChange={setDataW} className={POLE} />
          </div>
        </div>
        {proformyDoZaplaty.length > 0 ? (
          <div className="block space-y-1">
            <label htmlFor="wplata-proforma" className={etykieta}>
              Zapłata proformy
            </label>
            <Select
              id="wplata-proforma"
              value={proformaId}
              onChange={wybierzProforme}
              disabled={pending}
              options={[{ value: "", label: "— bez proformy —" }, ...proformyDoZaplaty.map((p) => ({ value: p.id, label: `${p.numer} · ${p.kwota} zł` }))]}
            />
          </div>
        ) : null}
        <label className="block space-y-1">
          <span className={etykieta}>Tytuł przelewu</span>
          <input value={tytul} onChange={(e) => setTytul(e.target.value)} maxLength={140} disabled={pending} className={POLE} data-pole="tytul" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block space-y-1">
            <span className={etykieta}>Referencja z wyciągu</span>
            <input value={referencja} onChange={(e) => setReferencja(e.target.value)} maxLength={100} disabled={pending} className={`${POLE} font-mono`} data-pole="referencja" />
          </label>
          <label className="block space-y-1">
            <span className={etykieta}>Zgłoszenie klienta</span>
            <input value={zglW} onChange={(e) => setZglW(e.target.value)} maxLength={64} placeholder="#ab12cd34" disabled={pending} className={`${POLE} font-mono`} />
          </label>
        </div>
        <button type="button" data-akcja="zaksieguj" className={przycisk} disabled={pending || !wplataOk} title={wplataOk ? undefined : "Kwota, tytuł (min. 3 znaki) i referencja (min. 4 znaki)"} onClick={() => void zaksieguj()}>
          Zaksięguj przelew
        </button>
        {komunikat("wplata")}
      </section>

      <section id="korekta" className="scroll-mt-24 space-y-2" data-sekcja="korekta">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-white">
          Korekta salda <Pomoc id="korekta-salda" />
        </h3>
        <div className="grid grid-cols-2 gap-2">
          <div className="block space-y-1">
            <label htmlFor="korekta-kierunek" className={etykieta}>
              Kierunek
            </label>
            <Select
              id="korekta-kierunek"
              value={kierunek}
              onChange={(v) => setKierunek(v === "minus" ? "minus" : "plus")}
              disabled={pending}
              options={[
                { value: "plus", label: "Dopisz (+)" },
                { value: "minus", label: "Odejmij (−)" },
              ]}
            />
          </div>
          <label className="block space-y-1">
            <span className={etykieta}>Kwota (K)</span>
            <input value={kwotaK} onChange={(e) => setKwotaK(e.target.value)} inputMode="decimal" placeholder="10,00" disabled={pending} className={POLE} data-pole="kwota-korekty" />
          </label>
        </div>
        <label className="block space-y-1">
          <span className={etykieta}>Powód do dziennika (min. {MIN_POWOD} znaków)</span>
          <input value={powod} onChange={(e) => setPowod(e.target.value)} maxLength={500} disabled={pending} className={POLE} data-pole="powod" />
        </label>
        <label className="block space-y-1">
          <span className={etykieta}>Zgłoszenie klienta</span>
          <input value={zglK} onChange={(e) => setZglK(e.target.value)} maxLength={64} placeholder="#ab12cd34" disabled={pending} className={`${POLE} font-mono`} />
        </label>
        <button type="button" data-akcja="korekta" className={przycisk} disabled={pending || !korektaOk} title={korektaOk ? undefined : "Kwota i powód (min. 10 znaków)"} onClick={() => void zapiszKorekte()}>
          Zapisz korektę
        </button>
        {komunikat("korekta")}
      </section>
    </div>
  );
}

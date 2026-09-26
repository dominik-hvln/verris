"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Select } from "@/components/select";

/** Odpowiedź GET /admin/custom-terms/user/:id (PB-27 / PB-28). */
export interface PodgladWarunkow {
  billingOutside: boolean;
  plany: { id: string; nazwa: string; ukryty: boolean; miesiecznie: string | null; rocznie: string | null }[];
  okres: { od: string; do: string };
  uslugi: {
    id: string;
    status: string;
    interval: "MONTH" | "YEAR";
    domena: string | null;
    plan: string | null;
    cenaCennik: string | null;
    cenaIndywidualna: string | null;
    rabatAutoskalowaniaPct: number;
    notatka: string | null;
    pozaVerris: boolean;
    odnowienie: string | null;
  }[];
  autoskalowaniePoza: { subscriptionId: string; bloki: number; kwota: string }[];
}

type Wynik = { ok: true } | { ok: false; error: string };

export interface AkcjeWarunkow {
  zaloz: (userId: string, dto: Record<string, unknown>) => Promise<Wynik>;
  ustaw: (subscriptionId: string, dto: Record<string, unknown>) => Promise<Wynik>;
  poza: (userId: string, dto: { wlaczone: boolean; powod: string }) => Promise<Wynik>;
}

const pole = "mt-1.5 w-full rounded-lg border border-white/10 bg-black/60 px-3 py-2 text-sm text-white";
const etykieta = "text-[10px] font-bold uppercase tracking-wider text-neutral-500";
const przycisk =
  "inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-3 py-2 text-sm font-semibold text-white hover:bg-cyan-600 disabled:opacity-50";
const okres = (i: string) => (i === "YEAR" ? "rok" : "mies.");

/** „12,5” i „12.5” → 12.5; puste → null (cena z cennika). */
function kwota(v: string): number | null | "zle" {
  const t = v.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : "zle";
}

/**
 * PB-27 / PB-28 — indywidualne warunki klienta w panelu admina i obsługi:
 * rozliczenie całego konta poza Verris, własna cena i rabat autoskalowania per usługa,
 * zakładanie usługi przez operatora oraz zestawienie autoskalowania do własnej faktury.
 */
export function WarunkiIndywidualne({ userId, dane, akcje }: { userId: string; dane: PodgladWarunkow; akcje: AkcjeWarunkow }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [blad, setBlad] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [powodPoza, setPowodPoza] = useState("");
  const [edytowana, setEdytowana] = useState<string | null>(null);
  const [cena, setCena] = useState("");
  const [rabat, setRabat] = useState("0");
  const [powodWarunkow, setPowodWarunkow] = useState("");

  const [plan, setPlan] = useState(dane.plany[0]?.id ?? "");
  const [interval, setInterval] = useState<"MONTH" | "YEAR">("MONTH");
  const [domena, setDomena] = useState("");
  const [nowaCena, setNowaCena] = useState("");
  const [nowyRabat, setNowyRabat] = useState("0");
  const [powodNowej, setPowodNowej] = useState("");

  const wykonaj = (fn: () => Promise<Wynik>, komunikat: string, poSukcesie?: () => void) => {
    setBlad(null);
    setOk(null);
    start(async () => {
      const r = await fn();
      if (!r.ok) {
        setBlad(r.error);
        return;
      }
      setOk(komunikat);
      poSukcesie?.();
      router.refresh();
    });
  };

  const rabatLiczba = (v: string) => {
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 && n <= 100 ? n : null;
  };

  const zapiszWarunki = (subscriptionId: string) => {
    const c = kwota(cena);
    const r = rabatLiczba(rabat);
    if (c === "zle") return setBlad("Cena musi być liczbą (np. 29,99) albo pusta = cennik.");
    if (r === null) return setBlad("Rabat na autoskalowanie to liczba całkowita 0–100.");
    if (powodWarunkow.trim().length < 3) return setBlad("Podaj powód (min. 3 znaki) — trafi do audytu.");
    wykonaj(
      () => akcje.ustaw(subscriptionId, { individualPrice: c, autoscalingDiscountPct: r, powod: powodWarunkow.trim() }),
      "Warunki zapisane — obowiązują od najbliższego odnowienia.",
      () => setEdytowana(null),
    );
  };

  const zalozUsluge = () => {
    const c = kwota(nowaCena);
    const r = rabatLiczba(nowyRabat);
    if (!plan) return setBlad("Wybierz plan.");
    if (c === "zle") return setBlad("Cena musi być liczbą (np. 29,99) albo pusta = cennik.");
    if (r === null) return setBlad("Rabat na autoskalowanie to liczba całkowita 0–100.");
    if (powodNowej.trim().length < 3) return setBlad("Podaj powód (min. 3 znaki) — trafi do audytu.");
    wykonaj(
      () =>
        akcje.zaloz(userId, {
          planId: plan,
          interval,
          domain: domena.trim() || undefined,
          individualPrice: c,
          autoscalingDiscountPct: r,
          powod: powodNowej.trim(),
        }),
      dane.billingOutside
        ? "Usługa założona bez obciążenia (rozliczenie poza Verris) — trwa zakładanie konta na serwerze."
        : "Usługa założona — pierwszy okres pobrany z portfela klienta, trwa zakładanie konta na serwerze.",
      () => {
        setDomena("");
        setNowaCena("");
        setNowyRabat("0");
        setPowodNowej("");
      },
    );
  };

  const wybranyPlan = dane.plany.find((p) => p.id === plan);
  const cennikNowej = interval === "YEAR" ? wybranyPlan?.rocznie : wybranyPlan?.miesiecznie;
  const domenaUslugi = (id: string) => dane.uslugi.find((u) => u.id === id)?.domena ?? id.slice(0, 8);

  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 p-6 space-y-6" aria-labelledby="warunki-naglowek">
      <div>
        <h2 id="warunki-naglowek" className="text-sm font-bold uppercase tracking-wide text-white">
          Indywidualne warunki i rozliczenie
        </h2>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Każda zmiana trafia do audytu z autorem i powodem. Klient widzi swoją cenę w panelu; nie widzi notatek.
        </p>
      </div>

      <div className="rounded-xl border border-white/10 p-4 space-y-3">
        <p className="text-sm text-white">
          Rozliczenie poza Verris:{" "}
          <strong className={dane.billingOutside ? "text-amber-300" : "text-neutral-300"}>
            {dane.billingOutside ? "włączone" : "wyłączone"}
          </strong>
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {dane.billingOutside
            ? "System nie pobiera opłat, nie blokuje za brak płatności i nie wystawia faktur. Okresy przedłużają się same. Klient nie widzi portfela ani płatności, a nowe usługi zamawia u Ciebie. Autoskalowanie działa bez pobierania — zużycie poniżej, do Twojej faktury."
            : "Po włączeniu wszystkie usługi klienta przechodzą na rozliczenie poza Verris: bez obciążeń portfela, przypomnień o płatności, blokad za brak płatności i faktur z systemu."}
        </p>
        <label className="block">
          <span className={etykieta}>Powód (do audytu)</span>
          <input value={powodPoza} onChange={(e) => setPowodPoza(e.target.value)} disabled={pending} className={pole} />
        </label>
        <button
          type="button"
          className={przycisk}
          disabled={pending || powodPoza.trim().length < 3}
          onClick={() =>
            wykonaj(
              () => akcje.poza(userId, { wlaczone: !dane.billingOutside, powod: powodPoza.trim() }),
              dane.billingOutside ? "Klient wraca do rozliczeń w Verris (portfel)." : "Rozliczenie poza Verris włączone.",
              () => setPowodPoza(""),
            )
          }
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {dane.billingOutside ? "Wyłącz — wróć do portfela" : "Włącz rozliczenie poza Verris"}
        </button>
      </div>

      <div className="space-y-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">Usługi klienta</h3>
        {dane.uslugi.length === 0 ? (
          <p className="text-sm text-muted-foreground">Klient nie ma aktywnych usług.</p>
        ) : (
          <ul className="divide-y divide-white/10 rounded-xl border border-white/10">
            {dane.uslugi.map((u) => (
              <li key={u.id} className="p-3 space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium text-white">{u.domena ?? u.plan ?? "Usługa"}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.plan ?? "—"} · cennik {u.cenaCennik ?? "—"} / {okres(u.interval)} · cena klienta{" "}
                      <strong className="text-white">{u.cenaIndywidualna ?? "z cennika"}</strong> · rabat autoskalowania{" "}
                      <strong className="text-white">{u.rabatAutoskalowaniaPct}%</strong>
                      {u.pozaVerris ? " · poza Verris" : ""}
                      {u.odnowienie ? ` · odnowienie ${new Date(u.odnowienie).toLocaleDateString("pl-PL")}` : ""}
                    </p>
                    {u.notatka ? <p className="text-xs text-neutral-400">Powód: {u.notatka}</p> : null}
                  </div>
                  <button
                    type="button"
                    className="text-xs font-semibold text-cyan-300 underline underline-offset-2 hover:text-cyan-200"
                    onClick={() => {
                      setEdytowana(edytowana === u.id ? null : u.id);
                      setCena(u.cenaIndywidualna ?? "");
                      setRabat(String(u.rabatAutoskalowaniaPct));
                      setPowodWarunkow("");
                    }}
                    aria-expanded={edytowana === u.id}
                  >
                    {edytowana === u.id ? "Anuluj" : "Zmień warunki"}
                  </button>
                </div>
                {edytowana === u.id ? (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="block">
                      <span className={etykieta}>Cena za {okres(u.interval)} (puste = cennik)</span>
                      <input inputMode="decimal" value={cena} onChange={(e) => setCena(e.target.value)} className={pole} placeholder={u.cenaCennik ?? ""} />
                    </label>
                    <label className="block">
                      <span className={etykieta}>Rabat na autoskalowanie (%)</span>
                      <input inputMode="numeric" value={rabat} onChange={(e) => setRabat(e.target.value)} className={pole} />
                    </label>
                    <label className="block">
                      <span className={etykieta}>Powód (do audytu)</span>
                      <input value={powodWarunkow} onChange={(e) => setPowodWarunkow(e.target.value)} className={pole} />
                    </label>
                    <div className="sm:col-span-3">
                      <button type="button" className={przycisk} disabled={pending} onClick={() => zapiszWarunki(u.id)}>
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Zapisz warunki
                      </button>
                    </div>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-xl border border-white/10 p-4 space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">Załóż usługę klientowi</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <span className={etykieta}>Plan</span>
            <Select
              aria-label="Plan"
              value={plan}
              onChange={setPlan}
              wrapperClassName="mt-1.5"
              options={dane.plany.map((p) => ({
                value: p.id,
                label: `${p.nazwa}${p.ukryty ? " (ukryty)" : ""} — ${p.miesiecznie ?? "—"}/mies. · ${p.rocznie ?? "—"}/rok`,
              }))}
            />
          </div>
          <div>
            <span className={etykieta}>Okres</span>
            <Select
              aria-label="Okres rozliczenia"
              value={interval}
              onChange={(v) => setInterval(v as "MONTH" | "YEAR")}
              wrapperClassName="mt-1.5"
              options={[
                { value: "MONTH", label: "Miesięczny" },
                { value: "YEAR", label: "Roczny" },
              ]}
            />
          </div>
          <label className="block">
            <span className={etykieta}>Domena (hosting)</span>
            <input value={domena} onChange={(e) => setDomena(e.target.value)} className={pole} placeholder="np. firma-klienta.pl" />
          </label>
          <label className="block">
            <span className={etykieta}>Cena za {okres(interval)} (puste = cennik {cennikNowej ?? "—"})</span>
            <input inputMode="decimal" value={nowaCena} onChange={(e) => setNowaCena(e.target.value)} className={pole} />
          </label>
          <label className="block">
            <span className={etykieta}>Rabat na autoskalowanie (%)</span>
            <input inputMode="numeric" value={nowyRabat} onChange={(e) => setNowyRabat(e.target.value)} className={pole} />
          </label>
          <label className="block">
            <span className={etykieta}>Powód (do audytu)</span>
            <input value={powodNowej} onChange={(e) => setPowodNowej(e.target.value)} className={pole} />
          </label>
        </div>
        <p className="text-xs text-muted-foreground">
          {dane.billingOutside
            ? "Klient rozliczany poza Verris — usługa ruszy bez obciążenia."
            : "Pierwszy okres zostanie pobrany z portfela klienta; przy braku środków usługa nie ruszy."}
        </p>
        <button type="button" className={przycisk} disabled={pending} onClick={zalozUsluge}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Załóż usługę
        </button>
      </div>

      {dane.billingOutside || dane.autoskalowaniePoza.length > 0 ? (
        <div className="space-y-2">
          <h3 className="text-xs font-bold uppercase tracking-wide text-neutral-400">
            Autoskalowanie do Twojej faktury ({new Date(dane.okres.od).toLocaleDateString("pl-PL")} –{" "}
            {new Date(dane.okres.do).toLocaleDateString("pl-PL")})
          </h3>
          {dane.autoskalowaniePoza.length === 0 ? (
            <p className="text-sm text-muted-foreground">W tym miesiącu bez zużycia ponad pakiet.</p>
          ) : (
            <ul className="text-sm text-white space-y-1">
              {dane.autoskalowaniePoza.map((a) => (
                <li key={a.subscriptionId} className="tabular-nums">
                  {domenaUslugi(a.subscriptionId)}: <strong>{a.kwota} zł</strong> wg cennika autoskalowania, po rabacie ({a.bloki} bloków po 15 min)
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {blad ? <p className="text-sm text-rose-300" role="alert">{blad}</p> : null}
      {ok ? <p className="text-sm text-cyan-300" role="status">{ok}</p> : null}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Select } from "@/components/select";
import { wczytajSekcjeKontaAction, zlecDziennikPocztyAction } from "./konto-klienta-actions";
import {
  BladSekcji,
  SEKCJE_KONTA,
  WidokSekcjiKonta,
  type DaneSekcji,
  type ParametrySekcji,
  type SekcjaKonta,
} from "./konto-klienta-widok";

type Stan = { wynik?: DaneSekcji; blad?: string; parametry: ParametrySekcji };
type WynikAkcji = { ok: true; wynik: DaneSekcji } | { ok: false; error: string };

/** Akcja serwera może się nie udać sama (sieć, restart panelu) — wtedy komunikat w sekcji, a nie wywrócona karta. */
async function bezpiecznie(akcja: () => Promise<WynikAkcji>): Promise<WynikAkcji> {
  try {
    return await akcja();
  } catch {
    return { ok: false, error: "Nie udało się połączyć z panelem. Spróbuj ponownie za chwilę." };
  }
}

/** Domeny do przełącznika — z odpowiedzi sekcji (DNS, PHP, logi zwracają listę domen konta). */
function domenySekcji(w?: DaneSekcji): string[] {
  if (!w) return [];
  if (w.sekcja === "dns" || w.sekcja === "php" || w.sekcja === "logi") return w.dane.domeny;
  return [];
}

function wybranaDomena(w?: DaneSekcji): string {
  if (!w) return "";
  if (w.sekcja === "dns" || w.sekcja === "logi") return w.dane.domain ?? "";
  if (w.sekcja === "php") return w.dane.domena;
  return "";
}

/**
 * PB-42 — konto klienta oczami obsługi: domeny, DNS, poczta, bazy, PHP, SSL, cron, logi WWW i poczty.
 * Każda zakładka czyta serwer dopiero po kliknięciu (wejście na kartę nie woła węzła), każdy odczyt
 * trafia do dziennika. Błąd jednej sekcji nie psuje reszty karty.
 */
export function KontoKlientaPanel({ subscriptionId }: { subscriptionId: string }) {
  const [aktywna, setAktywna] = useState<SekcjaKonta | null>(null);
  const [stany, setStany] = useState<Partial<Record<SekcjaKonta, Stan>>>({});
  const [pending, start] = useTransition();
  const [adresPoczty, setAdresPoczty] = useState("");

  const wczytaj = (sekcja: SekcjaKonta, parametry: ParametrySekcji) => {
    setAktywna(sekcja);
    start(async () => {
      const res = await bezpiecznie(() => wczytajSekcjeKontaAction(subscriptionId, sekcja, parametry));
      setStany((s) => ({
        ...s,
        [sekcja]: res.ok ? { wynik: res.wynik, parametry } : { blad: res.error, parametry, wynik: s[sekcja]?.wynik },
      }));
    });
  };

  /** Logi poczty: zlecenie świeżego odczytu z serwera (obsługa nie musi prosić klienta ani się pod niego podszywać). */
  const zlecDziennik = () => {
    start(async () => {
      const res = await bezpiecznie(() => zlecDziennikPocztyAction(subscriptionId, adresPoczty));
      setStany((s) => ({
        ...s,
        "logi-poczty": res.ok ? { wynik: res.wynik, parametry: {} } : { blad: res.error, parametry: {}, wynik: s["logi-poczty"]?.wynik },
      }));
    });
  };

  const otworz = (sekcja: SekcjaKonta) => {
    if (stany[sekcja]?.wynik) return setAktywna(sekcja);
    wczytaj(sekcja, sekcja === "logi" ? { type: "error", lines: 200 } : {});
  };

  const stan = aktywna ? stany[aktywna] : undefined;
  const domeny = domenySekcji(stan?.wynik);
  const przycisk = (aktywny: boolean) =>
    `rounded-md border px-2.5 py-1 text-xs ${aktywny ? "border-cyan-400/60 bg-cyan-500/15 text-cyan-100" : "border-white/10 bg-white/5 text-neutral-300 hover:text-white"}`;

  return (
    <section className="rounded-2xl border border-white/10 bg-black/35 p-5">
      <h2 className="text-sm font-semibold text-white">Konto klienta</h2>
      <p className="text-xs text-muted-foreground">
        Podgląd konfiguracji prosto z serwera, bez logowania na konto klienta. Tylko odczyt; każde otwarcie sekcji zapisuje się w dzienniku.
      </p>

      <div role="tablist" className="mt-4 flex flex-wrap gap-1.5">
        {SEKCJE_KONTA.map((s) => (
          <button
            key={s.klucz}
            type="button"
            role="tab"
            aria-selected={aktywna === s.klucz}
            onClick={() => otworz(s.klucz)}
            disabled={pending}
            className={`${przycisk(aktywna === s.klucz)} disabled:opacity-60`}
          >
            {s.etykieta}
          </button>
        ))}
      </div>

      {aktywna ? (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {domeny.length > 1 ? (
              <Select
                value={wybranaDomena(stan?.wynik)}
                onChange={(d) => wczytaj(aktywna, { ...stan?.parametry, domain: d })}
                options={domeny.map((d) => ({ value: d, label: d }))}
                disabled={pending}
                wrapperClassName="w-64"
              />
            ) : null}
            {aktywna === "logi" ? (
              <>
                {(["error", "access"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    disabled={pending}
                    onClick={() => wczytaj("logi", { ...stan?.parametry, type: t })}
                    className={przycisk((stan?.parametry.type ?? "error") === t)}
                  >
                    {t === "error" ? "Błędy" : "Dostęp"}
                  </button>
                ))}
                {[200, 500, 1000].map((n) => (
                  <button
                    key={n}
                    type="button"
                    disabled={pending}
                    onClick={() => wczytaj("logi", { ...stan?.parametry, lines: n })}
                    className={przycisk((stan?.parametry.lines ?? 200) === n)}
                  >
                    {n} linii
                  </button>
                ))}
              </>
            ) : null}
            {aktywna === "logi-poczty" ? (
              <>
                <input
                  type="email"
                  value={adresPoczty}
                  onChange={(e) => setAdresPoczty(e.target.value)}
                  placeholder="adres e-mail (opcjonalnie)"
                  aria-label="Zawęź dziennik do adresu e-mail"
                  disabled={pending}
                  className="w-64 rounded-md border border-white/10 bg-black/40 px-2.5 py-1 text-xs text-neutral-200 placeholder:text-neutral-500"
                />
                <button type="button" disabled={pending} onClick={zlecDziennik} className={`${przycisk(false)} disabled:opacity-60`}>
                  Wczytaj z serwera
                </button>
              </>
            ) : null}
            <button
              type="button"
              disabled={pending}
              onClick={() => wczytaj(aktywna, stan?.parametry ?? {})}
              className="ml-auto rounded-md border border-white/10 px-2.5 py-1 text-xs text-neutral-300 hover:text-white disabled:opacity-60"
            >
              {pending ? "Wczytuję…" : "Odśwież"}
            </button>
          </div>
          {stan?.blad ? <BladSekcji komunikat={stan.blad} /> : null}
          {stan?.wynik ? <WidokSekcjiKonta wynik={stan.wynik} /> : pending ? <p className="text-xs text-muted-foreground">Wczytuję z serwera…</p> : null}
        </div>
      ) : null}
    </section>
  );
}

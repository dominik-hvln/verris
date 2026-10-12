"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Karta } from "@/components/ticket-client-aside";
import { staffZamknijZlecenieDodatku } from "@/lib/ticket-actions";
import type { ZlecenieDodatku } from "@/lib/tickets-data";

type Wynik = "ZREALIZOWANO" | "ODMOWA";

const STAN: Record<string, string> = {
  QUEUED: "czeka na realizację",
  DONE: "zrealizowane",
  REFUNDED: "odmowa — opłata zwrócona",
};
const kwotaPl = (a: string) => `${Number(a).toFixed(2).replace(".", ",")} zł`;
const kiedy = (d: string) =>
  new Date(d).toLocaleString("pl-PL", { timeZone: "Europe/Warsaw", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/**
 * M-33 — zlecenie dodatku (dedykowane IP, konfiguracja przez specjalistę) na stronie jego zgłoszenia „Dodatek: …”.
 * Dwa przyciski z potwierdzeniem: „Zrealizowano” (notatka dla klienta opcjonalna) i „Odmowa ze zwrotem” (powód
 * obowiązkowy, pełna kwota wraca na portfel klienta). Oba teksty klient zobaczy w zgłoszeniu i w historii dodatków.
 * Uprawnienia pilnuje API: realizacja — SUBSCRIPTIONS_MANAGE (L2+), odmowa ze zwrotem — także BILLING_MANAGE (L4).
 */
export function TicketDodatek({
  ticketId,
  zlecenia,
  mozeRealizowac,
  mozeZwrocic,
}: {
  ticketId: string;
  zlecenia: ZlecenieDodatku[];
  mozeRealizowac: boolean;
  mozeZwrocic: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [tekst, setTekst] = useState("");
  const [potwierdzam, setPotwierdzam] = useState<{ id: string; wynik: Wynik } | null>(null);
  const [komunikat, setKomunikat] = useState<{ ok: boolean; tekst: string } | null>(null);
  const poleId = useId();
  if (zlecenia.length === 0) return null;

  const t = tekst.trim();
  const zamknij = (id: string, wynik: Wynik) =>
    start(async () => {
      setKomunikat(null);
      const r = await staffZamknijZlecenieDodatku(ticketId, id, wynik, t);
      setPotwierdzam(null);
      if ("error" in r) setKomunikat({ ok: false, tekst: r.error });
      else {
        setTekst("");
        setKomunikat({ ok: true, tekst: r.note });
        router.refresh();
      }
    });

  const PRZYCISK = "inline-flex h-8 items-center rounded-[9px] border px-2.5 text-[12.5px] font-semibold disabled:opacity-50";
  return (
    <Karta>
      <div className="flex flex-col gap-2 px-4 py-3.5" data-karta="dodatek">
        <h2 className="font-display text-[15px] font-bold">Zlecenie dodatku</h2>
        {zlecenia.map((z) => {
          const czeka = z.status === "QUEUED";
          return (
            <div key={z.id} className="flex flex-col gap-2" data-zlecenie={z.id} data-stan={z.status}>
              <p className="text-[13px]">
                <b>{z.name}</b> · {kwotaPl(z.amount)} · {STAN[z.status] ?? z.status}
                {z.zamknietoAt ? ` · ${kiedy(z.zamknietoAt)}` : ""}
              </p>
              {z.notatka ? <p className="text-[12.5px] text-muted-foreground">„{z.notatka}”</p> : null}
              {czeka && (mozeRealizowac || mozeZwrocic) ? (
                <>
                  <label htmlFor={poleId} className="text-[12.5px] font-semibold">
                    Notatka dla klienta / powód odmowy (zobaczy ją klient)
                  </label>
                  <textarea
                    id={poleId}
                    rows={2}
                    value={tekst}
                    maxLength={1000}
                    onChange={(e) => setTekst(e.target.value)}
                    placeholder="np. Przydzielono IP 203.0.113.10"
                    className="resize-y rounded-lg border border-line-strong bg-card px-2.5 py-1.5 text-[13px] text-foreground outline-none focus:border-data"
                  />
                  <p className="text-[12px] text-muted-foreground">
                    Adres IP przydzielony klientowi możesz podać. Nazwy ani adresu serwera — nie. Przy odmowie powód jest obowiązkowy (min. 10 znaków).
                  </p>
                  {potwierdzam?.id === z.id ? (
                    <div className="flex flex-col gap-2 rounded-lg bg-raised px-2.5 py-2" role="group" aria-label="Potwierdzenie">
                      <p className="text-[12.5px]">
                        {potwierdzam.wynik === "ODMOWA"
                          ? `Odmówić realizacji i zwrócić ${kwotaPl(z.amount)} na portfel klienta? Klient dostanie powód w zgłoszeniu. Tego nie da się cofnąć.`
                          : `Zamknąć zlecenie jako zrealizowane? Klient dostanie informację${t ? " z notatką" : ""} w zgłoszeniu.`}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-akcja="potwierdz"
                          disabled={pending}
                          onClick={() => zamknij(z.id, potwierdzam.wynik)}
                          className={`${PRZYCISK} ${potwierdzam.wynik === "ODMOWA" ? "border-crit/40 text-crit" : "border-ok/40 text-ok"} bg-card`}
                        >
                          {potwierdzam.wynik === "ODMOWA" ? "Tak, odmów i zwróć" : "Tak, zrealizowano"}
                        </button>
                        <button type="button" data-akcja="anuluj" disabled={pending} onClick={() => setPotwierdzam(null)} className={`${PRZYCISK} border-line-strong bg-card`}>
                          Anuluj
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {mozeRealizowac ? (
                        <button
                          type="button"
                          data-akcja="zrealizowano"
                          disabled={pending}
                          onClick={() => setPotwierdzam({ id: z.id, wynik: "ZREALIZOWANO" })}
                          className={`${PRZYCISK} border-ok/40 bg-card text-ok`}
                        >
                          Zrealizowano
                        </button>
                      ) : null}
                      {mozeZwrocic ? (
                        <button
                          type="button"
                          data-akcja="odmowa"
                          disabled={pending || t.length < 10}
                          title={t.length < 10 ? "Najpierw wpisz powód (min. 10 znaków)" : undefined}
                          onClick={() => setPotwierdzam({ id: z.id, wynik: "ODMOWA" })}
                          className={`${PRZYCISK} border-crit/40 bg-[color-mix(in_srgb,var(--crit)_10%,transparent)] text-crit`}
                        >
                          Odmowa ze zwrotem
                        </button>
                      ) : (
                        <p className="text-[12px] text-muted-foreground">Odmowę ze zwrotem na portfel robi kierownik zmiany (L4).</p>
                      )}
                    </div>
                  )}
                </>
              ) : czeka ? (
                <p className="text-[12px] text-muted-foreground">Zlecenie zamyka specjalista (L2+) — Twoja rola tego nie robi.</p>
              ) : null}
            </div>
          );
        })}
        {komunikat ? (
          <p role={komunikat.ok ? "status" : "alert"} className={`text-[13px] ${komunikat.ok ? "text-ok" : "text-crit"}`}>
            {komunikat.tekst}
          </p>
        ) : null}
      </div>
    </Karta>
  );
}

import Link from "next/link";
import { WALLET_TX_STATUS_PL, etykieta, etykietaWpisuPortfela } from "@verris/contracts";
import { formatCredits } from "@/lib/credits";
import { Pomoc } from "@/components/pomoc";
import { NieWczytano } from "@/components/nie-wczytano";
import { Pigulka, WIERSZ } from "@/components/v2";
import { ETAP, KANAL, kiedy, kiedyHarmonogram, opisProgow, type RuchyPortfela, type WindykacjaKlienta } from "../../billing/rozliczenia-dane";
import { ZwrotPaynowButton } from "./zwrot-paynow-button";

export const RUCHY_NA_STRONE = 25;
const kwota = (v: string) => formatCredits(v);

/**
 * F3.6 — rejestr ruchów portfela klienta (GET admin/rozliczenia/klienci/:id/portfel, BILLING_VIEW): data, operacja,
 * kanał i referencja, faktura, kwota i saldo po — ze stronicowaniem (`?portfel=N`). Bez eksportu (to EXPORT_DATA).
 */
export function RejestrPortfela({ userId, ruchy, strona, wolnoFaktura }: { userId: string; ruchy: RuchyPortfela; strona: number; wolnoFaktura: boolean }) {
  const baza = `/customers/${userId}`;
  const stron = Math.max(1, Math.ceil(ruchy.total / RUCHY_NA_STRONE));
  const href = (s: number) => `${baza}?sekcja=rozliczenia${s > 1 ? `&portfel=${s}` : ""}#portfel`;
  return (
    <div data-rejestr-portfela="">
      {ruchy.subkonto ? <div className={`${WIERSZ} text-sm text-amber-300`}>Subkonto — portfel jest na koncie właściciela.</div> : null}
      <div className={`${WIERSZ} !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
        <span className="w-[92px] shrink-0">Kiedy</span>
        <span className="flex-1">Operacja</span>
        <span className="w-[90px] text-right">Kwota</span>
        <span className="hidden w-[90px] text-right sm:block">Saldo po</span>
      </div>
      {ruchy.wiersze.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak operacji.</div> : null}
      {ruchy.wiersze.map((w) => (
        <div key={w.id} className={WIERSZ} data-ruch={w.type}>
          <span className="w-[92px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(w.createdAt)}</span>
          <span className="flex min-w-0 flex-1 flex-col text-sm">
            <span>{etykietaWpisuPortfela(w.type, w.amount)}</span>
            <span className="text-[12.5px] text-muted-foreground">
              {[w.description, w.paymentProvider ? (KANAL[w.paymentProvider] ?? w.paymentProvider) : null, w.paymentRef, w.status !== "COMPLETED" ? etykieta(WALLET_TX_STATUS_PL, w.status) : null]
                .filter(Boolean)
                .join(" · ")}
              {w.faktura ? (
                <>
                  {" · "}
                  {wolnoFaktura ? (
                    <Link href={`/invoices/${w.faktura.id}`} className="font-mono hover:underline">
                      {w.faktura.number}
                    </Link>
                  ) : (
                    <span className="font-mono">{w.faktura.number}</span>
                  )}
                </>
              ) : null}
            </span>
          </span>
          <span className={`w-[90px] text-right font-mono text-[13px] ${Number(w.amount) < 0 ? "" : "text-data-hi"}`}>{kwota(w.amount)}</span>
          <span className="hidden w-[90px] text-right font-mono text-[12.5px] text-muted-foreground sm:block">{kwota(w.balanceAfter)}</span>
          {w.type === "TOPUP" && w.paymentProvider === "PAYNOW" && Number(w.paynowDoZwrotu ?? 0) > 0 ? <ZwrotPaynowButton userId={userId} walletTxId={w.id} /> : null}
        </div>
      ))}
      {stron > 1 ? (
        <div className={`${WIERSZ} justify-end text-xs text-muted-foreground`}>
          {strona > 1 ? (
            <Link href={href(strona - 1)} className="hover:underline">
              ← nowsze
            </Link>
          ) : null}
          <span>
            {strona} / {stron} · {ruchy.total} operacji
          </span>
          {strona < stron ? (
            <Link href={href(strona + 1)} className="hover:underline">
              starsze →
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * F3.6 — „Przypomnienia i zawieszenia” na karcie klienta (GET admin/rozliczenia/klienci/:id/windykacja, BILLING_VIEW):
 * co harmonogram zrobi z każdą usługą i kiedy, oraz kiedy klient dostał przypomnienia. Tylko odczyt.
 */
export function WindykacjaKlientaKarta({ dane, teraz }: { dane: WindykacjaKlienta | undefined | null; teraz: number }) {
  return (
    <section id="windykacja" className="scroll-mt-24 rounded-[10px] border border-line bg-card" aria-labelledby="windykacja-naglowek" data-sekcja="windykacja">
      <h2 id="windykacja-naglowek" className="flex items-center gap-1.5 px-[18px] pt-4 font-display text-[17px] font-bold">
        Przypomnienia i zawieszenia <Pomoc id="windykacja" />
      </h2>
      {dane === undefined ? (
        <div className="p-[18px]">
          <NieWczytano co="przypomnień i zawieszeń" />
        </div>
      ) : dane === null ? (
        <p className="px-[18px] py-3 text-[13px] text-muted-foreground">Wymaga BILLING_VIEW.</p>
      ) : (
        <>
          <p className="px-[18px] pb-2 pt-1 text-[12.5px] text-muted-foreground">{opisProgow(dane.progi)}</p>
          {dane.uslugi.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak aktywnych usług.</div> : null}
          {dane.uslugi.map((s) => {
            const etap = ETAP[s.etap];
            return (
              <div key={s.id} className={WIERSZ} data-etap={s.etap}>
                <span className="flex min-w-0 flex-1 flex-col text-sm">
                  <Link href={`/subscriptions/${s.id}`} className="truncate font-semibold hover:underline">
                    {s.usluga}
                  </Link>
                  <span className="text-[12.5px] text-muted-foreground">
                    {s.etap === "odnowienie" ? `próba obciążenia: ${kiedyHarmonogram(s.probaOdnowienia, teraz)} · ` : ""}
                    {s.etap === "zawieszona"
                      ? s.wygasniecie
                        ? `wygaśnie: ${kiedyHarmonogram(s.wygasniecie, teraz)} · `
                        : ""
                      : s.zawieszenie
                        ? `zawieszenie bez zapłaty: ${kiedyHarmonogram(s.zawieszenie, teraz)} · `
                        : ""}
                    {s.uwaga}
                  </span>
                </span>
                {s.brakuje && Number(s.brakuje) > 0 ? <span className="font-mono text-[12.5px] text-warn">brakuje {s.brakuje} K</span> : null}
                <Pigulka ton={etap.ton} className="!text-xs">
                  {etap.t}
                </Pigulka>
              </div>
            );
          })}
          <div className={`${WIERSZ} !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>Wysłane przypomnienia i kroki (90 dni)</div>
          {dane.przypomnienia.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Brak przypomnień w ostatnich 90 dniach.</div> : null}
          {dane.przypomnienia.map((p) => (
            <div key={p.id} className={WIERSZ} data-przypomnienie={p.akcja}>
              <span className="w-[120px] shrink-0 font-mono text-xs text-muted-foreground">{kiedy(p.kiedy)}</span>
              <span className="flex-1 text-sm">
                {p.etykieta}
                {p.brakuje ? <span className="text-muted-foreground"> · brakowało {p.brakuje} K</span> : null}
              </span>
            </div>
          ))}
        </>
      )}
    </section>
  );
}

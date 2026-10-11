import Link from "next/link";
import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { BladStrony } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { Eyebrow, KARTA, Pigulka, WIERSZ } from "@/components/v2";
import { ETAP, kiedyHarmonogram, opisProgow, type WindykacjaFloty } from "../rozliczenia-dane";

export const dynamic = "force-dynamic";

/** Komponent serwerowy renderuje się raz na żądanie — „teraz” to chwila żądania. */
const chwila = () => Date.now();

/**
 * F3.6 — „Przypomnienia i zawieszenia” (BILLING_VIEW, odczyt): usługi zaległe, zawieszone za brak płatności i aktywne
 * z portfela, którym w ciągu 7 dni zabraknie na odnowienie — z datą zawieszenia albo wygaśnięcia. Progi są zaszyte
 * w harmonogramach (decyzja 29.09) — strona tylko je pokazuje.
 */
export default async function WindykacjaPage() {
  const bramka = await bramkaStrony("/billing/windykacja");
  if (bramka) return bramka;
  let dane: WindykacjaFloty;
  try {
    dane = await adminApi<WindykacjaFloty>("/admin/rozliczenia/windykacja");
  } catch (e) {
    return <BladStrony blad={e} tytul="Przypomnienia i zawieszenia" powrot={{ href: "/billing", label: "Portfel i płatności" }} />;
  }
  const teraz = chwila();

  return (
    <div className="flex flex-col gap-5">
      <header className="flex flex-col gap-1.5">
        <Eyebrow>Finanse · Windykacja</Eyebrow>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Przypomnienia i zawieszenia <Pomoc id="windykacja" />
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground" data-progi>
          {opisProgow(dane.progi)} Progi są w kodzie — tu tylko podgląd.
        </p>
      </header>

      <section className={KARTA} aria-label="Usługi zagrożone zawieszeniem" data-lista="windykacja">
        <div className={`${WIERSZ} !border-t-0 !py-[9px] font-mono text-[10.5px] uppercase tracking-[0.1em] text-muted-foreground`}>
          <span className="flex-1">Klient i usługa</span>
          <span className="w-[130px]">Etap</span>
          <span className="w-[120px] text-right">Brakuje</span>
          <span className="w-[200px]">Co i kiedy</span>
        </div>
        {dane.wiersze.length === 0 ? <div className={`${WIERSZ} text-sm text-muted-foreground`}>Nikomu nie grozi zawieszenie za brak płatności.</div> : null}
        {dane.wiersze.map((w) => {
          const etap = ETAP[w.etap];
          const zdarzenie =
            w.etap === "zawieszona"
              ? `wygaśnie: ${kiedyHarmonogram(w.wygasniecie, teraz)}`
              : `zawieszenie: ${kiedyHarmonogram(w.zawieszenie, teraz)}`;
          return (
            <div key={w.id} className={WIERSZ} data-etap={w.etap}>
              <span className="flex min-w-0 flex-1 flex-col text-sm">
                <Link href={`/customers/${w.userId}?sekcja=rozliczenia#windykacja`} className="truncate font-semibold hover:underline">
                  {w.email ?? w.userId.slice(0, 8)}
                </Link>
                <Link href={`/subscriptions/${w.id}`} className="truncate text-[12.5px] text-muted-foreground hover:underline">
                  {w.usluga}
                </Link>
              </span>
              <span className="w-[130px]">
                <Pigulka ton={etap.ton} className="!text-xs">
                  {etap.t}
                </Pigulka>
              </span>
              <span className="w-[120px] text-right font-mono text-[13px]">{w.brakuje && Number(w.brakuje) > 0 ? `${w.brakuje} K` : "—"}</span>
              <span className="flex w-[200px] flex-col text-[12.5px]">
                <span>{zdarzenie}</span>
                <span className="text-muted-foreground">{w.uwaga}</span>
              </span>
            </div>
          );
        })}
      </section>
      {dane.ucieto ? <p className="text-xs text-amber-300">Lista ucięta do 300 usług.</p> : null}
    </div>
  );
}

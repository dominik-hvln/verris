import { bramkaStrony } from "@/lib/bramka-strony";
import { adminApi } from "@/lib/api";
import { Eyebrow } from "@/components/v2";
import { Pomoc } from "@/components/pomoc";
import { PrzekroczeniaLimitow, type Przekroczenia } from "@/components/przekroczenia-limitow";

export const dynamic = "force-dynamic";

// Czas żądania (strona dynamiczna) — reguła purity nie przepuszcza Date.now() w ciele komponentu.
const chwila = () => Date.now();

/**
 * F2.6 — „Przekroczenia limitów” floty (NODES_VIEW, NOC): konta, które w dobie albo w 7 dni odbijały się od limitów
 * zasobów (faulty z raportów agentów węzłów), od najgorszego; z linkiem do „Zasobów i diagnozy 508” na karcie usługi.
 */
export default async function PrzekroczeniaLimitowStrona() {
  const bramka = await bramkaStrony("/nodes/przekroczenia");
  if (bramka) return bramka;
  const dane = await adminApi<Przekroczenia>("/admin/servers/przekroczenia").catch((e: unknown) => (e instanceof Error ? e.message : "błąd"));
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <Eyebrow>Flota · Węzły</Eyebrow>
        <h1 className="flex items-center gap-2 text-[32px] lg:text-[34px]">
          Przekroczenia limitów <Pomoc id="przekroczenia-limitow" />
        </h1>
        <p className="text-sm text-muted-foreground">
          Odbicia kont od limitów CPU, procesów wejściowych (EP), procesów (NPROC), pamięci i I/O · raport węzła co ok. 10 min
        </p>
      </div>
      {typeof dane === "string" ? (
        <div className="rounded-[10px] border border-crit/30 bg-crit/10 px-4 py-3 text-sm text-crit">Nie udało się pobrać przekroczeń: {dane}</div>
      ) : (
        <PrzekroczeniaLimitow dane={dane} teraz={chwila()} zWezlem />
      )}
    </div>
  );
}

import Link from "next/link";
import { PanelFetchError, PanelPageHeader } from "@/components/panel";
import { pobierzPostepBetaAction } from "./beta-actions";
import { ListaTestowBeta } from "./lista-testow";

export const dynamic = "force-dynamic";

/** PB-26 — „Testy (beta)”: scenariusze do odhaczenia i uwagi testera; QR z przewodnika PDF prowadzi tutaj. */
export default async function TestyBetaPage() {
  const postep = await pobierzPostepBetaAction().catch((e: unknown) => e as Error);
  return (
    <div className="mx-auto flex w-full max-w-[880px] flex-col gap-6">
      <PanelPageHeader
        title="Testy (beta)"
        description="Scenariusze testów przed startem. Odhaczaj kroki i dopisuj uwagi — zapisują się na Twoim koncie, a my widzimy postęp na bieżąco."
      />
      {postep instanceof Error ? (
        <PanelFetchError message={postep.message} />
      ) : !postep.tester ? (
        <section className="rounded-[10px] border border-line bg-card px-5 py-4 text-[14px] text-muted-foreground">
          <p className="m-0">
            Ta strona jest dla osób zaproszonych do testów. Masz kod z zaproszenia? Wpisz go w{" "}
            <Link href="/dashboard/billing" className="font-semibold text-data-hi hover:underline">Płatności → Kod promocyjny</Link>, a lista pojawi się tutaj.
          </p>
        </section>
      ) : (
        <ListaTestowBeta poczatkowy={postep} />
      )}
    </div>
  );
}

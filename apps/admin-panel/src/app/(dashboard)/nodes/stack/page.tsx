import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { BladStrony } from "@/components/blad-strony";
import { adminApi } from "@/lib/api";
import type { WidokStosu } from "./actions";
import { WersjeStosu } from "./wersje-stosu";

export const dynamic = "force-dynamic";

/** PB-33 — manifest stosu floty w panelu + wyrównanie istniejących węzłów falą. */
export default async function WersjeStosuPage() {
  let dane: WidokStosu;
  try {
    dane = await adminApi<WidokStosu>("/admin/stack-manifest");
  } catch (e) {
    return <BladStrony blad={e} tytul="Wersje stosu floty" powrot={{ href: "/nodes", label: "Węzły" }} />;
  }
  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <Link href="/nodes" className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-indigo-400">
        <ArrowLeft className="h-3.5 w-3.5" /> Węzły
      </Link>
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Wersje stosu floty</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Jeden manifest dla wszystkich węzłów. Nowe węzły instalują go od razu. Istniejące dostają go w ciągu minuty, a
          oprogramowanie zmieniasz przyciskiem „Wyrównaj flotę”: najpierw węzeł kanarkowy, potem pozostałe po jednym.
        </p>
      </header>
      <WersjeStosu start={dane} />
    </div>
  );
}

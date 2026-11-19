import { bramkaStrony } from "@/lib/bramka-strony";
import { BladStrony, wynik } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { fetchUstawieniaMarki } from "./actions";
import { KreatorMarkiForm } from "./kreator-marki-form";

export const dynamic = "force-dynamic";

/** Paczka 130 — Admin → Wiedza i AI → Kreator marki (API: admin/kreator-marki/* — tylko ADMIN). */
export default async function KreatorMarkiPage() {
  const bramka = await bramkaStrony("/settings/kreator-marki");
  if (bramka) return bramka;
  const w = await wynik(fetchUstawieniaMarki());
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Kreator marki" powrot={{ href: "/", label: "Pulpit" }} />;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Kreator marki <Pomoc id="kreator-marki" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Logo i materiały marki w panelu klienta: kto ma dostęp, co jest w cenie hostingu, ile kosztuje Pakiet marki i druga marka, które
          modele AI pracują nad znakami. Zmiany działają od zapisu – bez wdrożenia.
        </p>
      </header>
      <KreatorMarkiForm initial={w.dane} />
    </div>
  );
}

import { bramkaStrony } from "@/lib/bramka-strony";
import { BladStrony, wynik } from "@/components/blad-strony";
import { Pomoc } from "@/components/pomoc";
import { fetchPodsumowanieKreatora, fetchUstawieniaKreatora } from "./actions";
import { KreatorForm } from "./kreator-form";
import { PodsumowanieKreatoraPanel } from "./podsumowanie";

export const dynamic = "force-dynamic";

/** Paczka 123 — Admin → Wiedza i AI → Kreator stron (API: admin/kreator/* — tylko ADMIN). */
export default async function KreatorStronPage() {
  const bramka = await bramkaStrony("/settings/kreator");
  if (bramka) return bramka;
  // Podsumowanie nie rzuca — błąd pokazuje sama sekcja, konfiguracja działa.
  const [w, podsumowanie] = await Promise.all([wynik(fetchUstawieniaKreatora()), fetchPodsumowanieKreatora()]);
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Kreator stron" powrot={{ href: "/", label: "Pulpit" }} />;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          Kreator stron <Pomoc id="kreator-stron" />
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Verris Kreator w panelu klienta: kto ma do niego dostęp, które modele AI piszą strony, skąd klienci biorą zdjęcia i ile to
          kosztuje w tym miesiącu. Zmiany działają od zapisu – bez wdrożenia.
        </p>
      </header>
      <KreatorForm initial={w.dane} magazyn={podsumowanie?.magazyn ?? null} />
      <PodsumowanieKreatoraPanel dane={podsumowanie} />
    </div>
  );
}

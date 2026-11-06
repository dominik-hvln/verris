import { bramkaStrony } from "@/lib/bramka-strony";
import { fetchAsystentWww, fetchKosztyAi, fetchUstawieniaAi } from './actions';
import { UstawieniaAiForm } from './ustawienia-ai-form';
import { AsystentWwwForm } from './asystent-www-form';
import { KosztyAiPanel } from './koszty-ai';
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = 'force-dynamic';

export default async function UstawieniaAiPage() {
  const bramka = await bramkaStrony("/settings/ai");
  if (bramka) return bramka;
  // fetchAsystentWww nie rzuca — błąd odczytu pokazuje sama sekcja, reszta strony działa.
  const [w, asystentWww] = await Promise.all([wynik(Promise.all([fetchUstawieniaAi(), fetchKosztyAi()])), fetchAsystentWww()]);
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Asystent AI" powrot={{ href: "/", label: "Pulpit" }} />;
  const [ustawienia, koszty] = w.dane;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Asystent AI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dwa poziomy: szybki (czat i podpowiedzi) oraz analiza (prognozy zasobów, szkice odpowiedzi obsługi).
          Nowszy model to zmiana tutaj – bez wdrożenia.
        </p>
      </header>
      <UstawieniaAiForm initial={ustawienia} />
      <AsystentWwwForm initial={asystentWww} znaneModele={ustawienia.znaneModele} />
      <KosztyAiPanel koszty={koszty} />
    </div>
  );
}

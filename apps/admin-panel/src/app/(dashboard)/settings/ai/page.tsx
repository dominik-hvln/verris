import { fetchKosztyAi, fetchUstawieniaAi } from './actions';
import { UstawieniaAiForm } from './ustawienia-ai-form';
import { KosztyAiPanel } from './koszty-ai';
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = 'force-dynamic';

export default async function UstawieniaAiPage() {
  const w = await wynik(Promise.all([fetchUstawieniaAi(), fetchKosztyAi()]));
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Asystent AI" powrot={{ href: "/", label: "Pulpit" }} />;
  const [ustawienia, koszty] = w.dane;
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Asystent AI</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dwa poziomy: szybki (czat i podpowiedzi) oraz analiza (prognozy zasobów, szkice odpowiedzi obsługi).
          Nowszy model to zmiana tutaj — bez wdrożenia.
        </p>
      </header>
      <UstawieniaAiForm initial={ustawienia} />
      <KosztyAiPanel koszty={koszty} />
    </div>
  );
}

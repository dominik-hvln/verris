import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchKosztyAi, fetchUstawieniaAi } from './actions';
import { UstawieniaAiForm } from './ustawienia-ai-form';
import { KosztyAiPanel } from './koszty-ai';

export const dynamic = 'force-dynamic';

export default async function UstawieniaAiPage() {
  const [ustawienia, koszty] = await Promise.all([fetchUstawieniaAi(), fetchKosztyAi()]);
  return (
    <div className="space-y-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-emerald-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ustawienia konta
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-white">Asystent AI</h1>
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

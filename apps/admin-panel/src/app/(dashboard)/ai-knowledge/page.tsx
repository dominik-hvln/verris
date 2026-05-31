import { AlertCircle, Brain } from "lucide-react";
import type { AiKnowledgeDocSummaryDto, AiStatusDto } from "@verris/contracts";
import { fetchAiStatus, listKnowledgeDocs } from "./data";
import { KnowledgeManager } from "./knowledge-manager";
import { StaffAssistant } from "./staff-assistant";

export const dynamic = "force-dynamic";

export default async function AiKnowledgePage() {
  let docs: AiKnowledgeDocSummaryDto[] = [];
  let error: string | null = null;
  let status: AiStatusDto | null = null;
  try {
    [docs, status] = await Promise.all([listKnowledgeDocs(), fetchAiStatus()]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header className="flex items-start gap-3">
        <div className="rounded-2xl border border-violet-400/20 bg-violet-400/10 p-3 text-violet-200">
          <Brain className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white">Baza wiedzy AI</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Dodawaj dokumenty, FAQ, polityki i instrukcje do „pamięci" asystenta. Chatbot w panelu
            klienta oraz asystent zespołu odpowiadają na podstawie tej wiedzy (RAG). Treści są dzielone
            na fragmenty i indeksowane — im więcej rzetelnych materiałów, tym lepsze odpowiedzi.
          </p>
        </div>
      </header>

      {status && !status.configured ? (
        <div className="flex items-center gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Dostawca AI nie jest skonfigurowany (AI_API_KEY). Możesz dodawać dokumenty, ale asystent
          zacznie odpowiadać dopiero po włączeniu integracji.
        </div>
      ) : null}

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" /> Nie udało się pobrać bazy wiedzy: {error}
        </div>
      ) : (
        <>
          <KnowledgeManager initialDocs={docs} embeddings={Boolean(status?.embeddings)} />
          {status?.configured ? <StaffAssistant /> : null}
        </>
      )}
    </div>
  );
}

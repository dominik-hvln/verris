import { staffGetCannedResponses } from "@/lib/tickets-data";

export const dynamic = "force-dynamic";

export default async function StaffKnowledgePage() {
  let responses: Awaited<ReturnType<typeof staffGetCannedResponses>> = [];
  let error: string | null = null;
  try {
    responses = await staffGetCannedResponses();
  } catch (e) {
    error = e instanceof Error ? e.message : "Nie udało się pobrać bazy wiedzy.";
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white">Knowledge Base</h1>
        <p className="text-sm text-muted-foreground">Szablony odpowiedzi (canned responses) z API ticketów.</p>
      </header>
      {error ? (
        <p className="text-sm text-rose-300">{error}</p>
      ) : responses.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-12 text-center text-muted-foreground">
          Brak szablonów odpowiedzi.
        </div>
      ) : (
        <div className="space-y-3">
          {responses.map((r) => (
            <div key={r.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
              <p className="text-white font-medium">{r.title}</p>
              <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{r.body}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

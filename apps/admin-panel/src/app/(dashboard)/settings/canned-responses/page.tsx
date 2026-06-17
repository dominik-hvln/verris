import { MessageSquare } from "lucide-react";
import { fetchCanned } from "./actions";
import { CannedClient } from "./canned-client";

export const dynamic = "force-dynamic";

export default async function CannedResponsesPage() {
  const rows = await fetchCanned();
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <header>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <MessageSquare className="h-6 w-6 text-emerald-300" /> Szablony odpowiedzi (BOK)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gotowe odpowiedzi dla wsparcia. Przypisz temat, aby agent widział je przy zgłoszeniach
          danego rodzaju (szablony bez tematu są globalne).
        </p>
      </header>
      <CannedClient rows={rows} />
    </div>
  );
}

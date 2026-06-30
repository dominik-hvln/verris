import { AlertCircle, Mail } from "lucide-react";
import { listCampaigns, type CampaignRow } from "./data";
import { MarketingClient } from "./marketing-client";

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  let rows: CampaignRow[] = [];
  let error: string | null = null;
  try {
    rows = await listCampaigns();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Mail className="h-7 w-7 text-indigo-400" />
          Newsletter / mailing
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Twórz i wysyłaj mailingi do klientów. Lista odbiorców buduje się automatycznie z osób, które
          wyraziły zgodę marketingową — segment „Zgoda na newsletter" obejmuje wszystkich z aktywnym
          opt-inem (z rejestracji lub ustawień konta). Każdy mail ma automatyczny nagłówek
          List-Unsubscribe i respektuje wypisy (RODO).
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nie udało się pobrać kampanii: {error}
        </div>
      ) : (
        <MarketingClient rows={rows} />
      )}
    </div>
  );
}

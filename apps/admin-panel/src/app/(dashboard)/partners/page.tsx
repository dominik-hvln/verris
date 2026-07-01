import { AlertCircle, Handshake } from "lucide-react";
import { getPartnerConfig, listPartnerPayouts, type PartnerConfig, type AdminPayout } from "./data";
import { PartnersClient } from "./partners-client";

export const dynamic = "force-dynamic";

export default async function PartnersPage() {
  let config: PartnerConfig | null = null;
  let payouts: AdminPayout[] = [];
  let error: string | null = null;
  try {
    [config, payouts] = await Promise.all([getPartnerConfig(), listPartnerPayouts("REQUESTED")]);
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Handshake className="h-7 w-7 text-emerald-400" />
          Program partnerski
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Zasady prowizji dla partnerów (afiliacja) oraz kolejka wypłat na konto bankowe do zatwierdzenia.
          Prowizje naliczają się automatycznie od realnych płatności poleconych klientów.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nie udało się pobrać danych: {error}
        </div>
      ) : config ? (
        <PartnersClient config={config} payouts={payouts} />
      ) : null}
    </div>
  );
}

import { AlertCircle, Handshake } from "lucide-react";
import { listResellers, type ResellerRow } from "./data";
import { ResellersClient } from "./resellers-client";

export const dynamic = "force-dynamic";

export default async function ResellersPage() {
  let rows: ResellerRow[] = [];
  let error: string | null = null;
  try {
    rows = await listResellers();
  } catch (err) {
    error = err instanceof Error ? err.message : "Nieznany błąd";
  }

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
          <Handshake className="h-7 w-7 text-emerald-400" />
          Resellerzy (white-label)
        </h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-3xl">
          Włącz program white-label dla wybranego klienta — ustal narzut (markup) i nazwę marki.
          Klienci pozyskani jego linkiem zostaną do niego przypisani, a ceny detaliczne policzą się automatycznie.
        </p>
      </header>

      {error ? (
        <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          Nie udało się pobrać resellerów: {error}
        </div>
      ) : (
        <ResellersClient rows={rows} />
      )}
    </div>
  );
}

import { MessageSquare } from "lucide-react";
import { fetchCanned } from "./actions";
import { CannedClient } from "./canned-client";
import { wynik } from "@/components/blad-strony";
import { NieWczytano } from "@/components/nie-wczytano";

export const dynamic = "force-dynamic";

export default async function CannedResponsesPage() {
  const rows = await wynik(fetchCanned());
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <header>
        <h1 className="flex items-center gap-2 text-[28px] lg:text-[34px]">
          <MessageSquare className="h-6 w-6 text-emerald-300" /> Szablony odpowiedzi (BOK)
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Gotowe odpowiedzi dla wsparcia. Przypisz temat, aby agent widział je przy zgłoszeniach
          danego rodzaju (szablony bez tematu są globalne).
        </p>
      </header>
      {rows.ok ? <CannedClient rows={rows.dane} /> : <NieWczytano co="szablonów odpowiedzi" />}
    </div>
  );
}

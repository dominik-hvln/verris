import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { NewEmailPlanForm } from "./new-email-plan-form";

export const dynamic = "force-dynamic";

export default function NewEmailPlanPage() {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700 max-w-5xl">
      <div className="flex items-center gap-3 text-sm">
        <Link
          href="/plans"
          className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2 py-1 text-xs text-neutral-300 hover:bg-white/10"
        >
          <ChevronLeft className="h-3 w-3" />
          Plany
        </Link>
        <span className="text-muted-foreground">/</span>
        <span className="text-xs text-white/70">nowy plan poczty</span>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">Nowy plan poczty</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Uproszczony formularz dla produktu e-mail — bez limitów hostingowych (CPU/RAM/IO/EP).
          Rozliczenie z portfela; Stripe (jeśli skonfigurowany) zsynchronizuje się automatycznie.
        </p>
      </header>

      <NewEmailPlanForm />
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminPlan } from "../data";
import { PlanEditForm } from "./plan-edit-form";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPlanEditPage({ params }: PageProps) {
  const { id } = await params;
  let plan;
  try {
    plan = await getAdminPlan(id);
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound();
    throw e;
  }

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
        <span className="font-mono text-xs text-white/70">{plan.slug}</span>
      </div>

      <header>
        <h1 className="text-2xl font-bold tracking-tight text-white">
          Edycja planu: {plan.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zmiany w cenach i Price ID są walidowane przeciwko Stripe API. Audit
          log zachowuje pełny diff zmian.
        </p>
      </header>

      <PlanEditForm plan={plan} />
    </div>
  );
}

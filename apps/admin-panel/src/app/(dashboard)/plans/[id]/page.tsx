import { bramkaStrony } from "@/lib/bramka-strony";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getAdminPlan } from "../data";
import { PlanEditForm } from "./plan-edit-form";
import { BladStrony } from "@/components/blad-strony";
import { fetchStaffAccess } from "@/lib/staff-access";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminPlanEditPage({ params }: PageProps) {
  const bramka = await bramkaStrony("/plans/[id]");
  if (bramka) return bramka;
  const { id } = await params;
  // D1 — plany i ceny zmienia tylko administrator (PATCH admin/plans — @Roles(ADMIN)); PLANS_MANAGE to podgląd.
  const edycja = (await fetchStaffAccess()).isAdmin;
  let plan;
  try {
    plan = await getAdminPlan(id);
  } catch (e) {
    if ((e as { status?: number }).status === 404) notFound();
    return <BladStrony blad={e} tytul="Plan" powrot={{ href: "/plans", label: "Plany" }} />;
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
        <h1 className="text-[28px] lg:text-[34px]">
          {edycja ? "Edycja planu" : "Plan"}: {plan.name}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Zmiany w cenach i Price ID są walidowane przeciwko Stripe API. Audit
          log zachowuje pełny diff zmian.
        </p>
      </header>

      {edycja ? (
        <PlanEditForm plan={plan} />
      ) : (
        <>
          <p role="note" className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100" data-tylko-podglad="">
            Podgląd. Plany i ceny zmienia administrator.
          </p>
          <fieldset disabled className="contents">
            <PlanEditForm plan={plan} />
          </fieldset>
        </>
      )}

      {/* Wysyłka pakietów obejmuje wszystkie plany i węzły — jest w Operacjach floty (10.10). */}
      <p className="text-sm text-muted-foreground">
        Nowe limity trafią do kont po wysłaniu pakietów:{" "}
        <Link href="/nodes/stack#pakiety" className="font-semibold text-foreground underline-offset-2 hover:underline">
          Operacje floty → Pakiety DirectAdmina
        </Link>
      </p>
    </div>
  );
}

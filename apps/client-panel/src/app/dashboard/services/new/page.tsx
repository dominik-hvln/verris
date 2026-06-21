import Link from 'next/link';
import { ArrowLeft, ShieldAlert } from 'lucide-react';
import type { PlanDto } from '@verris/contracts';
import { ApiError } from '@/lib/api';
import { listPublicPlans, getTrialOffer, type TrialOffer } from '../data';
import { Suspense } from 'react';
import { OrderFlow } from './order-flow';

export default async function NewServicePage() {
  let plans: PlanDto[] = [];
  let loadError: string | null = null;
  const offer: TrialOffer = await getTrialOffer();
  try {
    plans = await listPublicPlans();
  } catch (err) {
    loadError =
      err instanceof ApiError
        ? `Nie udało się pobrać katalogu planów (${err.status}).`
        : err instanceof Error
          ? err.message
          : 'Nieznany błąd';
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-500 max-w-5xl">
      <div className="flex items-center gap-4">
        <Link
          href="/dashboard/services"
          className="p-3 border border-white/5 rounded-2xl bg-[#0a0a0a] hover:bg-[#121212] transition-colors text-neutral-400 hover:text-white"
        >
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-3xl font-extrabold text-white">Zamów nową usługę</h1>
          <p className="text-neutral-400 mt-2">
            Wybierz plan i sposób płatności — konto na serwerze utworzymy automatycznie po
            opłaceniu.
          </p>
        </div>
      </div>

      {loadError ? (
        <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-6 text-rose-200 flex items-start gap-3">
          <ShieldAlert className="h-5 w-5 mt-0.5" />
          <div>
            <p className="font-semibold">Wystąpił problem</p>
            <p className="text-sm text-rose-200/80 mt-1">{loadError}</p>
          </div>
        </div>
      ) : plans.length === 0 ? (
        <EmptyPlans />
      ) : (
        <Suspense fallback={null}>
          <OrderFlow plans={plans} offer={offer} />
        </Suspense>
      )}
    </div>
  );
}

function EmptyPlans() {
  return (
    <div className="rounded-[24px] border border-white/10 bg-white/[0.02] p-10 text-center">
      <h3 className="text-xl font-bold text-white">Brak dostępnych planów</h3>
      <p className="mt-2 text-neutral-400">
        Administrator nie opublikował jeszcze planów hostingowych. Spróbuj ponownie później.
      </p>
    </div>
  );
}

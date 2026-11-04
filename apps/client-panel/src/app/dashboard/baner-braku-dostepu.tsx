'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { ClientNavContext } from '@/lib/client-nav-access';
import { PARAM_BRAK_DOSTEPU, komunikatBrakuDostepu } from '@/lib/brak-dostepu';

/**
 * P3-08 — komunikat po przekierowaniu ze strony bez uprawnienia (middleware albo layout dopisują `?brak_dostepu=`).
 * Wcześniej subkonto trafiało na pulpit bez słowa i nie wiedziało, czemu „Faktury” nie działają.
 */
export function BanerBrakuDostepu({ navCtx }: { navCtx: ClientNavContext | null }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const tresc = navCtx ? komunikatBrakuDostepu(params.get(PARAM_BRAK_DOSTEPU), navCtx) : null;
  if (!tresc) return null;
  return (
    <div role="alert" className="mb-4 flex items-start justify-between gap-3 rounded-[7px] border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
      <span>{tresc}</span>
      <button
        type="button"
        onClick={() => router.replace(pathname)}
        className="shrink-0 rounded-[7px] border border-line px-2 py-0.5 text-xs font-semibold text-muted-foreground hover:bg-raised"
      >
        Zamknij
      </button>
    </div>
  );
}

import { Share2 } from 'lucide-react';
import { FeatureNotAvailable } from '@/components/feature-not-available';
import { isClientFeatureEnabled } from '@/lib/client-features';
import { ReferralProgramClient } from './referral-program-client';

export const dynamic = 'force-dynamic';

export default function ReferralProgramPage() {
  if (!isClientFeatureEnabled('referral')) {
    return (
      <FeatureNotAvailable
        title="Program partnerski"
        description="Program partnerski nie jest jeszcze aktywny w panelu. Możesz korzystać z hostingu i portfela bez ograniczeń."
      />
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Share2 className="h-8 w-8 text-emerald-400" />
          Program partnerski
        </h1>
        <p className="text-neutral-400 mt-2 text-sm">
          Poleć Verris znajomym — po akceptacji zgłoszenia otrzymasz link i punkty EKO za rejestracje.
        </p>
      </header>
      <ReferralProgramClient />
    </div>
  );
}

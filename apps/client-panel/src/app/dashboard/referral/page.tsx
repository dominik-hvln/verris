import { FeatureNotAvailable } from '@/components/feature-not-available';
import { czyModul } from '@/lib/feature-flags-core';
import { pobierzFlagiAction } from '@/lib/feature-flags-action';
import { ReferralProgramClient } from './referral-program-client';
import { PanelPageHeader } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function ReferralProgramPage() {
  // N-12: przełącznik build-time + flaga operatora.
  if (!czyModul(await pobierzFlagiAction(), 'modul.referral')) {
    return (
      <FeatureNotAvailable
        title="Program partnerski"
        description="Program partnerski nie jest jeszcze aktywny w panelu. Możesz korzystać z hostingu i portfela bez ograniczeń."
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PanelPageHeader
        title="Program partnerski"
        description="Poleć Verris znajomym — po akceptacji zgłoszenia dostaniesz link i punkty EKO za rejestracje."
      />
      <ReferralProgramClient />
    </div>
  );
}

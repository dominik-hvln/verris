import { Share2 } from 'lucide-react';
import { ReferralProgramClient } from './referral-program-client';

export const dynamic = 'force-dynamic';

export default function ReferralProgramPage() {
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

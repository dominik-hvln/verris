import { ResellerClient } from './reseller-client';
import { PanelPageHeader } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default function ResellerPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PanelPageHeader
        title="Reseller (white-label)"
        description="Sprzedawaj hosting pod własną marką: Twoi klienci rejestrują się z Twojego linku, a Ty ustalasz narzut do ceny hurtowej."
      />
      <ResellerClient />
    </div>
  );
}

import { Users } from 'lucide-react';
import { ResellerClient } from './reseller-client';

export const dynamic = 'force-dynamic';

export default function ResellerPage() {
  return (
    <div className="space-y-8 max-w-5xl">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <Users className="h-8 w-8 text-emerald-400" />
          Reseller (white-label)
        </h1>
        <p className="text-neutral-400 mt-2 text-sm max-w-2xl">
          Sprzedawaj hosting pod własną marką. Twoi klienci rejestrują się z Twojego linku, a Ty
          ustalasz narzut do ceny hurtowej i widzisz ich usługi w jednym miejscu.
        </p>
      </header>
      <ResellerClient />
    </div>
  );
}

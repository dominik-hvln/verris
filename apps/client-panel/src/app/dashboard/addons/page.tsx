import { Sparkles } from 'lucide-react';
import { PanelPageHeader, PanelCard, PanelFetchError } from '@/components/panel';
import { fetchAddons } from './addons-actions';
import { AddonsClient } from './addons-client';

export const dynamic = 'force-dynamic';

export default async function AddonsPage() {
  const overview = await fetchAddons();
  return (
    <div className="space-y-4">
      <PanelPageHeader
        icon={<Sparkles className="h-6 w-6 text-amber-300" />}
        title="Dodatki"
        description="Jednorazowe usługi dodatkowe — opłacane z portfela."
      />
      <PanelCard>
        {!overview ? (
          <PanelFetchError message="Nie udało się pobrać katalogu dodatków." />
        ) : (
          <AddonsClient overview={overview} />
        )}
      </PanelCard>
    </div>
  );
}

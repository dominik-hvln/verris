import { Server } from 'lucide-react';
import { PanelCard, PanelPageHeader } from '@/components/panel';
import { fetchSshKeys, fetchVpsAvailability, fetchVpsInstances, fetchVpsPlans } from './vps-actions';
import { VpsClient } from './vps-client';
import { FeatureNotAvailable } from '@/components/feature-not-available';
import { pobierzFlagiAction } from '@/lib/feature-flags-action';

export const dynamic = 'force-dynamic';

export default async function VpsPage() {
  // Włącza API per konto (FEATURE_VPS / FEATURE_VPS_TYLKO_KONTA); bez tego API i tak odmawia (403).
  if ((await pobierzFlagiAction()).vps !== true) {
    return (
      <FeatureNotAvailable
        title="VPS / Cloud"
        description="Serwery VPS nie są jeszcze w ofercie. Hosting, poczta i portfel działają bez zmian."
      />
    );
  }
  const [available, plans, instances, sshKeys] = await Promise.all([
    fetchVpsAvailability(),
    fetchVpsPlans(),
    fetchVpsInstances(),
    fetchSshKeys(),
  ]);

  return (
    <div className="space-y-4">
      <PanelPageHeader
        icon={<Server className="h-6 w-6 text-violet-300" />}
        title="VPS / Cloud"
        description="Serwery VPS uruchamiane w chmurze — pełen root, rozliczenie z portfela."
      />
      <PanelCard>
        <VpsClient available={available} plans={plans} instances={instances} sshKeys={sshKeys} />
      </PanelCard>
    </div>
  );
}

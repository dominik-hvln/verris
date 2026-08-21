import { Server } from 'lucide-react';
import { PanelCard, PanelPageHeader } from '@/components/panel';
import { fetchSshKeys, fetchVpsAvailability, fetchVpsInstances, fetchVpsPlans } from './vps-actions';
import { VpsClient } from './vps-client';

export const dynamic = 'force-dynamic';

export default async function VpsPage() {
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

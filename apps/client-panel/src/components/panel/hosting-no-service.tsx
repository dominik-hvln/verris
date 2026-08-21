import { PanelCard } from './panel-shell';

export function HostingNoServiceState({ serviceId }: { serviceId?: string }) {
  return (
    <PanelCard>
      <p className="text-sm text-muted-foreground">
        {serviceId
          ? 'Nie znaleziono usługi o podanym identyfikatorze.'
          : 'Brak aktywnej usługi hostingowej. Zamów lub aktywuj usługę, aby korzystać z tej sekcji.'}
      </p>
    </PanelCard>
  );
}

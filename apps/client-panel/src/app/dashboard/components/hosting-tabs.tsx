import type { ReactNode } from 'react';
import { PageHeaderRow } from '@/components/panel';

/**
 * Nagłówek stron narzędzi hostingu poza widokiem usługi (dziś: Migracje).
 * Dawny pasek zakładek (DNS, Bazy, Pliki…) usunięty w PB-16: te sekcje żyją w widoku usługi,
 * a stare adresy przekierowują — pasek prowadził więc do przekierowań i przewijał się w bok.
 */
export function HostingPageWrapper({
  title,
  description,
  children,
  actions,
}: {
  title: string;
  description: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <PageHeaderRow title={title} description={description} actions={actions} />
      {children}
    </div>
  );
}

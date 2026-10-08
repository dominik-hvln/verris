import Link from 'next/link';
import { HostingPageWrapper } from '../../components/hosting-tabs';
import { getProsbaOZgodeMigracji } from '../../hosting-tools-data';
import { PanelCard, PanelFetchError } from '@/components/panel';
import type { ProsbaOZgode } from '../types';
import { ZgodaMigracji } from './zgoda-migracji';

export const dynamic = 'force-dynamic';

/**
 * PB-45 — zgoda na migrację przygotowaną przez obsługę. Wejście z linku w mailu (`token`) albo z banera
 * w Migracjach (bez tokenu — wystarcza zalogowany właściciel usługi).
 */
export default async function ZgodaMigracjiPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string; id?: string; token?: string }>;
}) {
  const { serviceId, id, token } = await searchParams;
  let prosba: ProsbaOZgode | null = null;
  let blad: string | null = null;
  if (!serviceId || !id) {
    blad = 'Link jest niekompletny — otwórz go jeszcze raz z maila albo przejdź do zakładki Migracje.';
  } else {
    try {
      prosba = await getProsbaOZgodeMigracji(serviceId, id, token);
    } catch (e) {
      blad = e instanceof Error ? e.message : 'Nie udało się pobrać prośby o zgodę na migrację.';
    }
  }

  return (
    <HostingPageWrapper
      title="Zgoda na migrację"
      description="Nasz zespół przygotował przeniesienie Twojej strony. Sprawdź, co przenosimy, i zdecyduj."
    >
      {prosba && serviceId ? (
        <ZgodaMigracji serviceId={serviceId} prosba={prosba} token={token} />
      ) : (
        <PanelCard className="space-y-3">
          <PanelFetchError message={blad ?? 'Nie udało się pobrać prośby o zgodę na migrację.'} />
          <Link
            href={serviceId ? `/dashboard/migrations?serviceId=${encodeURIComponent(serviceId)}` : '/dashboard/migrations'}
            className="text-sm text-cyan-300 underline"
          >
            Przejdź do Migracji
          </Link>
        </PanelCard>
      )}
    </HostingPageWrapper>
  );
}

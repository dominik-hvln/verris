import { ExternalLink, Repeat } from 'lucide-react';
import { HostingPageWrapper } from '../components/hosting-tabs';
import { getHostingMigrationTimeline, resolveServiceForHostingPages } from '../hosting-tools-data';
import { ExternalMigrationForm } from './external-migration-form';
import { HostingNoServiceState, PanelCard } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  const timeline = service ? await getHostingMigrationTimeline(service.id) : null;

  return (
    <HostingPageWrapper
      title="Migracje"
      description="Zleć przeniesienie strony ze starego hostingu — bezpiecznie i z postępem na bieżąco."
      currentTab="migrations"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <div className="space-y-6">
          <PanelCard accent className="text-sm leading-relaxed text-amber-100/90">
            <p className="mb-2 font-semibold">Jak działa zlecenie migracji</p>
            <ul className="list-inside list-disc space-y-1 text-xs text-amber-100/80">
              <li>
                Po wysłaniu formularza tworzymy <strong>zgłoszenie</strong> i zapisujemy dane dostępu w
                zaszyfrowanym schowku.
              </li>
              <li>Operator prowadzi migrację plików, baz MySQL i skrzynek e-mail.</li>
              <li>
                Otrzymasz e-mail z <strong>postępem</strong>. Do podmiany DNS stara strona działa bez
                przerwy.
              </li>
            </ul>
          </PanelCard>
          <PanelCard className="space-y-4">
            <h2 className="font-semibold text-white">Zlecenie migracji (FTP / MySQL / IMAP)</h2>
            <p className="text-xs text-neutral-500">
              Po wysłaniu otrzymasz numer zgłoszenia. Hasła są odczytywane wyłącznie podczas transferu i
              zapisywane w audycie.
            </p>
            <ExternalMigrationForm serviceId={service.id} />
          </PanelCard>
          <PanelCard className="space-y-4">
            <h2 className="font-semibold text-white">Oś zdarzeń migracji</h2>
            {timeline && timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.map((row) => (
                  <article
                    key={row.id}
                    className="space-y-1 rounded-xl border border-white/10 bg-white/[0.02] p-4"
                  >
                    <p className="flex items-center gap-2 text-sm font-medium text-white">
                      <Repeat className="h-4 w-4 text-cyan-300" aria-hidden />
                      {row.type}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(row.createdAt).toLocaleString('pl-PL')}
                    </p>
                    {row.details?.ticketId ? (
                      <p className="flex items-center gap-2 text-xs text-neutral-300">
                        Zgłoszenie: {String(row.details.ticketId)}
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" aria-hidden />
                      </p>
                    ) : null}
                  </article>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Brak zgłoszeń migracji dla tej usługi.</p>
            )}
          </PanelCard>
        </div>
      )}
    </HostingPageWrapper>
  );
}

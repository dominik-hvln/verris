import { ExternalLink, Repeat } from 'lucide-react';
import { HostingTabs } from '../components/hosting-tabs';
import { getHostingMigrationTimeline, resolveServiceForHostingPages } from '../hosting-tools-data';
import { ExternalMigrationForm } from './external-migration-form';

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
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Migracje</h1>
        <p className="text-neutral-400 text-sm md:text-base">
          Zlecenie migracji ze starego hostingu — formularz zapisuje zaszyfrowany pakiet
          źródeł, a transfer plików SFTP/rsync jest kolejkowany do compute-node worker.
        </p>
      </header>

      <HostingTabs currentTab="migrations" serviceId={service?.id} />

      {!service ? (
        <div className="rounded-2xl border border-white/10 bg-black/30 p-6 text-sm text-muted-foreground">
          {serviceId ? 'Nie znaleziono usługi o podanym identyfikatorze.' : 'Brak aktywnej usługi hostingowej.'}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5 text-sm text-amber-100/90 leading-relaxed">
            <p className="font-semibold mb-1">Jak działa zlecenie migracji</p>
            <ul className="list-disc list-inside space-y-1 text-amber-100/80 text-xs">
              <li>
                Po wysłaniu formularza tworzymy <strong>ticket techniczny</strong> i zapisujemy
                Twoje dane dostępu w zaszyfrowanym schowku (KMS).
              </li>
              <li>
                Operator widzi kolejkę migracji, a pierwszy krok plikowy wykonuje worker na
                właściwym węźle. Bazy MySQL i IMAP są obsługiwane w tej samej kolejce.
              </li>
              <li>
                Otrzymasz e-mail z <strong>postępem</strong> i potwierdzeniem zakończenia. Aż do
                podmiany DNS Twoja stara strona działa bez przerwy.
              </li>
              <li>
                Sekrety są odsłaniane wyłącznie przez audytowany endpoint staff lub
                autoryzowany node agent.
              </li>
            </ul>
          </div>
          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <h2 className="text-white font-semibold">Zlecenie migracji (FTP / MySQL / IMAP)</h2>
            <p className="text-xs text-neutral-500">
              Po wysłaniu formularza otrzymasz numer ticketu — to bezpieczny kanał komunikacji
              z operatorem migracji. Twoje hasło zostanie odczytane wyłącznie w chwili
              wykonywania transferu i zapisane w audicie.
            </p>
            <ExternalMigrationForm serviceId={service.id} />
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/30 p-6 space-y-4">
            <h2 className="text-white font-semibold">Oś zdarzeń migracji</h2>
            {timeline && timeline.length > 0 ? (
              <div className="space-y-3">
                {timeline.map((row) => (
                  <div key={row.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-4 space-y-1">
                    <p className="text-sm text-white font-medium flex items-center gap-2">
                      <Repeat className="h-4 w-4 text-cyan-300" />
                      {row.type}
                    </p>
                    <p className="text-xs text-neutral-500">{new Date(row.createdAt).toLocaleString('pl-PL')}</p>
                    {row.details?.ticketId ? (
                      <p className="text-xs text-neutral-300 flex items-center gap-2">
                        Ticket: {String(row.details.ticketId)}
                        <ExternalLink className="h-3.5 w-3.5 opacity-70" />
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-neutral-500">Brak zgłoszeń migracji dla tej usługi.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


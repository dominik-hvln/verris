import { HostingPageWrapper } from '../components/hosting-tabs';
import {
  getHostingMigrationBundles,
  resolveServiceForHostingPages,
} from '../hosting-tools-data';
import { MigrationsClient } from './migrations-client';
import { HostingNoServiceState, PanelCard } from '@/components/panel';
import type { MigrationBundleSummary } from './types';

export const dynamic = 'force-dynamic';

export default async function MigrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ serviceId?: string }>;
}) {
  const { serviceId } = await searchParams;
  const service = await resolveServiceForHostingPages(serviceId);
  let bundles: MigrationBundleSummary[] = [];
  if (service) {
    bundles = await getHostingMigrationBundles(service.id).catch(() => []);
  }

  return (
    <HostingPageWrapper
      title="Migracje"
      description="Przenieś stronę, bazy i pocztę ze starego hostingu — automatycznie i z postępem na żywo."
      currentTab="migrations"
      serviceId={service?.id}
    >
      {!service ? (
        <HostingNoServiceState serviceId={serviceId} />
      ) : (
        <div className="space-y-6">
          <PanelCard className="text-sm leading-relaxed">
            <p className="mb-3 font-semibold text-white">Twoje dane są u nas bezpieczne</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <SafetyPoint
                title="Hasła szyfrujemy i kasujemy"
                desc="Dane dostępowe trafiają do zaszyfrowanego sejfu (AES-256). Używamy ich wyłącznie podczas transferu, a po zakończeniu migracji automatycznie je usuwamy — nie zostają u nas na stałe."
              />
              <SafetyPoint
                title="Pełna kontrola i wgląd"
                desc="Każdy dostęp do Twoich danych przez nasz zespół jest zapisywany w dzienniku. Postęp widzisz na żywo, a migrację możesz w każdej chwili anulować jednym kliknięciem."
              />
              <SafetyPoint
                title="Zero przestojów"
                desc="Twoja obecna strona działa bez przerwy przez cały czas. Przełączenie na nowy hosting (DNS) wykonujesz sam(a) na końcu, dopiero gdy wszystko sprawdzisz."
              />
              <SafetyPoint
                title="Ty decydujesz, my wykonujemy"
                desc="Przenosimy tylko to, co wskażesz: pliki, wybrane bazy i skrzynki. Nie modyfikujemy niczego u starego dostawcy — jedynie odczytujemy dane do skopiowania."
              />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Szczegóły przetwarzania i powierzenia danych opisują{' '}
              <a href="/legal/privacy" className="text-cyan-300 hover:underline">Polityka prywatności</a>,{' '}
              <a href="/legal/dpa" className="text-cyan-300 hover:underline">Umowa powierzenia (DPA)</a> oraz{' '}
              <a href="/legal/terms" className="text-cyan-300 hover:underline">Regulamin</a>. Pytania w sprawie
              danych: <a href="mailto:rodo@verris.pl" className="text-cyan-300 hover:underline">rodo@verris.pl</a>.
            </p>
          </PanelCard>
          <MigrationsClient serviceId={service.id} bundles={bundles} />
        </div>
      )}
    </HostingPageWrapper>
  );
}

function SafetyPoint({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="flex gap-2.5 rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <span className="mt-0.5 text-cyan-300" aria-hidden>
        {/* prosta ikona tarczy */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          <path d="m9 12 2 2 4-4" />
        </svg>
      </span>
      <div>
        <p className="text-xs font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{desc}</p>
      </div>
    </div>
  );
}

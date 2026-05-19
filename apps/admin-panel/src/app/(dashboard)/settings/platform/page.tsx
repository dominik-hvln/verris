import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { fetchPlatformSettings } from './actions';
import { PlatformSettingsForm } from './platform-settings-form';

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const settings = await fetchPlatformSettings();

  return (
    <div className="space-y-8">
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-emerald-400"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Ustawienia konta
      </Link>
      <header>
        <h1 className="text-2xl font-bold text-white">Ustawienia platformy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Progi EKO, sesje bez ruchu i przeliczniki widoczne w panelu klienta.
        </p>
      </header>
      <PlatformSettingsForm initial={settings} />
    </div>
  );
}

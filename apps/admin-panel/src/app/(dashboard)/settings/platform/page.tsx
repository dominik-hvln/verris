import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import {
  fetchPlatformSettings,
  fetchTrialOffer,
  fetchMonitoringSettings,
  fetchSlaCreditPolicy,
  fetchSlaPodglad,
  fetchWhoisPrivacyPrice,
  fetchSslProducts,
} from './actions';
import { SlaPreview } from './sla-preview';
import { PlatformSettingsForm } from './platform-settings-form';
import { TrialOfferSettingsForm } from './trial-offer-form';
import { MonitoringSettingsForm } from './monitoring-settings-form';
import { SlaCreditsForm } from './sla-credits-form';
import { WhoisPrivacyForm } from './whois-privacy-form';
import { SslPricesForm } from './ssl-prices-form';
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const w = await wynik(
    Promise.all([fetchPlatformSettings(), fetchTrialOffer(), fetchMonitoringSettings(), fetchSlaCreditPolicy(), fetchSlaPodglad(), fetchWhoisPrivacyPrice(), fetchSslProducts()]),
  );
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Ustawienia platformy" powrot={{ href: "/settings", label: "Ustawienia" }} />;
  const [settings, trialOffer, monitoring, slaCredits, slaPodglad, whois, ssl] = w.dane;

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
        <h1 className="text-[28px] lg:text-[34px]">Ustawienia platformy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Progi EKO, sesje bez ruchu i przeliczniki widoczne w panelu klienta.
        </p>
      </header>
      <PlatformSettingsForm initial={settings} />
      <TrialOfferSettingsForm initial={trialOffer} />
      <MonitoringSettingsForm initial={monitoring} />
      <WhoisPrivacyForm initial={whois.whoisPrivacyPrice} />
      <SslPricesForm dane={ssl} />
      <SlaCreditsForm initial={slaCredits} />
      <SlaPreview data={slaPodglad} />
    </div>
  );
}

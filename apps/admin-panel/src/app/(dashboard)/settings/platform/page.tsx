import {
  fetchPlatformSettings,
  fetchTrialOffer,
  fetchMonitoringSettings,
  fetchSlaCreditPolicy,
  fetchSlaPodglad,
} from './actions';
import { SlaPreview } from './sla-preview';
import { PlatformSettingsForm } from './platform-settings-form';
import { TrialOfferSettingsForm } from './trial-offer-form';
import { MonitoringSettingsForm } from './monitoring-settings-form';
import { SlaCreditsForm } from './sla-credits-form';
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = 'force-dynamic';

export default async function PlatformSettingsPage() {
  const w = await wynik(
    Promise.all([fetchPlatformSettings(), fetchTrialOffer(), fetchMonitoringSettings(), fetchSlaCreditPolicy(), fetchSlaPodglad()]),
  );
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Ustawienia platformy" powrot={{ href: "/", label: "Pulpit" }} />;
  const [settings, trialOffer, monitoring, slaCredits, slaPodglad] = w.dane;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Ustawienia platformy</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Progi EKO, sesje bez ruchu, okres próbny, monitoring i kredyty SLA. Ceny ukrycia WHOIS i certyfikatów SSL: Oferta → Domeny i SSL.
        </p>
      </header>
      <PlatformSettingsForm initial={settings} />
      <TrialOfferSettingsForm initial={trialOffer} />
      <MonitoringSettingsForm initial={monitoring} />
      <SlaCreditsForm initial={slaCredits} />
      <SlaPreview data={slaPodglad} />
    </div>
  );
}

import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';
import { ProactiveHints } from './proactive-hints';
import { getOnboardingSnapshot } from './onboarding-data';
import { OnboardingWizard } from './onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [snapshot, onboarding] = await Promise.all([
    getDashboardSnapshot(),
    getOnboardingSnapshot(),
  ]);
  return (
    <div className="space-y-6">
      <OnboardingWizard snapshot={onboarding} />
      <ProactiveHints />
      <DashboardHome snapshot={snapshot} />
    </div>
  );
}

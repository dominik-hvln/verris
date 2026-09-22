import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';
import { getOnboardingSnapshot } from './onboarding-data';
import { OnboardingWizard } from './onboarding-wizard';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [snapshot, onboarding] = await Promise.all([
    getDashboardSnapshot(),
    getOnboardingSnapshot(),
  ]);
  return (
    <DashboardHome snapshot={snapshot} aside={<OnboardingWizard snapshot={onboarding} />} />
  );
}

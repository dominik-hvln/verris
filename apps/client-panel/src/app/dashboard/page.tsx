import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';
import { getOnboardingSnapshot } from './onboarding-data';
import { OnboardingWizard } from './onboarding-wizard';
import { fetchSidebarUser } from './sidebar-actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [snapshot, onboarding, user] = await Promise.all([
    getDashboardSnapshot(),
    getOnboardingSnapshot(),
    fetchSidebarUser(),
  ]);
  return (
    <DashboardHome
      snapshot={snapshot}
      aside={<OnboardingWizard snapshot={onboarding} hidden={user?.onboardingHidden ?? false} />}
    />
  );
}

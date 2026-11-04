import { clientNavContextFromSidebar } from '@/lib/client-nav-access';
import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';
import { getOnboardingSnapshot } from './onboarding-data';
import { OnboardingWizard } from './onboarding-wizard';
import { fetchSidebarUser } from './sidebar-actions';
import { pobierzStanBetyAction } from './beta/beta-actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [snapshot, onboarding, user, beta] = await Promise.all([
    getDashboardSnapshot(),
    getOnboardingSnapshot(),
    fetchSidebarUser(),
    pobierzStanBetyAction(),
  ]);
  return (
    <DashboardHome
      snapshot={snapshot}
      zaproszenieBety={beta.zaproszenie}
      aside={<OnboardingWizard key="pierwsze-kroki" snapshot={onboarding} hidden={user?.onboardingHidden ?? false} navCtx={clientNavContextFromSidebar(user)} />}
    />
  );
}

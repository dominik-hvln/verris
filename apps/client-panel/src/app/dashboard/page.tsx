import { clientNavContextFromSidebar } from '@/lib/client-nav-access';
import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';
import { getOnboardingSnapshot } from './onboarding-data';
import { OnboardingWizard } from './onboarding-wizard';
import { fetchSidebarUser } from './sidebar-actions';
import { pobierzPostepBetaAction, pobierzStanBetyAction } from './beta/beta-actions';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [snapshot, onboarding, user, beta] = await Promise.all([
    getDashboardSnapshot(),
    getOnboardingSnapshot(),
    fetchSidebarUser(),
    pobierzStanBetyAction(),
  ]);
  // Kafelek „Testy (beta)” — tylko tester pyta o postęp; błąd API = brak kafelka (pulpit działa bez niego).
  const postepBety = beta.tester ? await pobierzPostepBetaAction().catch(() => null) : null;
  return (
    <DashboardHome
      snapshot={snapshot}
      zaproszenieBety={beta.zaproszenie}
      postepBety={postepBety}
      aside={<OnboardingWizard key="pierwsze-kroki" snapshot={onboarding} hidden={user?.onboardingHidden ?? false} navCtx={clientNavContextFromSidebar(user)} />}
    />
  );
}

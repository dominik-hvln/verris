import { DashboardHome } from './dashboard-home';
import { getDashboardSnapshot } from './dashboard-data';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const snapshot = await getDashboardSnapshot();
  return <DashboardHome snapshot={snapshot} />;
}

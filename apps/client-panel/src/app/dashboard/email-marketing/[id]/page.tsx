import { fetchOverview, fetchLists, fetchCampaigns } from '../actions';
import { EmailMarketingClient } from './email-marketing-client';

export const dynamic = 'force-dynamic';

export default async function EmailMarketingServicePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [overview, lists, campaigns] = await Promise.all([
    fetchOverview(id),
    fetchLists(id),
    fetchCampaigns(id),
  ]);

  if (!overview.ok) {
    return (
      <div className="rounded-2xl border border-rose-400/30 bg-rose-400/10 px-4 py-3 text-sm text-rose-200">
        Nie udało się załadować usługi email-marketingu: {overview.error}
      </div>
    );
  }

  return (
    <EmailMarketingClient
      subscriptionId={id}
      initialOverview={overview.data}
      initialLists={lists.ok ? lists.data : []}
      initialCampaigns={campaigns.ok ? campaigns.data : []}
    />
  );
}

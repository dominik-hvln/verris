import { ApiTokensClient } from './api-tokens-client';
import { WebhooksClient } from './webhooks-client';
import { PanelPageHeader } from '@/components/panel';
import { headers } from 'next/headers';
import { getAuthToken } from '@/lib/auth';
import { fetchSessionProfile } from '@/lib/session-profile';

export const dynamic = 'force-dynamic';

export default async function ApiTokensPage() {
  const token = await getAuthToken();
  const session = token ? await fetchSessionProfile(token, (await headers()).get('x-forwarded-for')) : null;
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PanelPageHeader
        title="API i integracje"
        description="Tokeny dostępu do publicznego API Verris i webhooki — do CI/CD, Terraform i własnych skryptów. Działają tylko w obrębie Twojego konta."
      />
      <ApiTokensClient mozeTworzyc={!session?.isSubaccount} />
      <WebhooksClient />
    </div>
  );
}

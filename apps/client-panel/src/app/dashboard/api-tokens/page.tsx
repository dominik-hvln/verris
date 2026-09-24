import { ApiTokensClient } from './api-tokens-client';
import { WebhooksClient } from './webhooks-client';
import { PanelPageHeader } from '@/components/panel';

export const dynamic = 'force-dynamic';

export default function ApiTokensPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-6">
      <PanelPageHeader
        title="API i integracje"
        description="Tokeny dostępu do publicznego API Verris i webhooki — do CI/CD, Terraform i własnych skryptów. Działają tylko w obrębie Twojego konta."
      />
      <ApiTokensClient />
      <WebhooksClient />
    </div>
  );
}

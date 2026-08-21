import { KeyRound } from 'lucide-react';
import { ApiTokensClient } from './api-tokens-client';

export const dynamic = 'force-dynamic';

export default function ApiTokensPage() {
  return (
    <div className="space-y-8 max-w-4xl">
      <header>
        <h1 className="text-3xl font-bold text-white flex items-center gap-2">
          <KeyRound className="h-8 w-8 text-emerald-400" />
          API i integracje
        </h1>
        <p className="text-neutral-400 mt-2 text-sm max-w-2xl">
          Twórz tokeny dostępu do publicznego API Verris, aby zintegrować swoje usługi z własnymi
          narzędziami (CI/CD, Terraform, skrypty). Token nadaje tylko wybrane uprawnienia i działa
          wyłącznie w obrębie Twojego konta.
        </p>
      </header>
      <ApiTokensClient />
    </div>
  );
}

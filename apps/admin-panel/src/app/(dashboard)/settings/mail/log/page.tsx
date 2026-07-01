import { ScrollText } from 'lucide-react';
import { EmailLogClient } from './email-log-client';

export const metadata = { title: 'Dziennik poczty — admin Verris' };

export default function EmailLogPage() {
  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <ScrollText className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-2xl font-bold text-white">Dziennik poczty (EmailLog)</h1>
          <p className="text-sm text-muted-foreground">
            Historia wysyłek: status, provider i błędy. Filtruj po statusie lub temacie.
          </p>
        </div>
      </div>
      <EmailLogClient />
    </div>
  );
}

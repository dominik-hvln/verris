import { bramkaStrony } from "@/lib/bramka-strony";
import { ScrollText } from 'lucide-react';
import { EmailLogClient } from './email-log-client';

export const metadata = { title: 'Dziennik poczty — admin Verris' };

export default async function EmailLogPage() {
  const bramka = await bramkaStrony("/settings/mail/log");
  if (bramka) return bramka;
  return (
    <div className="space-y-6 p-8">
      <div className="flex items-center gap-3">
        <ScrollText className="h-8 w-8 text-amber-400" />
        <div>
          <h1 className="text-[28px] lg:text-[34px]">Dziennik poczty (EmailLog)</h1>
          <p className="text-sm text-muted-foreground">
            Historia wysyłek: status, provider i błędy. Filtruj po statusie lub temacie.
          </p>
        </div>
      </div>
      <EmailLogClient />
    </div>
  );
}

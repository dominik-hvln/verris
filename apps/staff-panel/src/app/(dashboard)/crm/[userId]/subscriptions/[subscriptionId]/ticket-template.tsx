'use client';

import { useState } from 'react';

const TEMPLATE = `Dzień dobry,

potwierdzamy zmianę planu hostingowego na Twojej usłudze.

- Usługa: {{domain}}
- Poprzedni plan: {{fromPlan}}
- Nowy plan: {{toPlan}}
- Rozliczenie proporcjonalne: {{billingNote}}

Limity zasobów (CPU, RAM, dysk) zostały zaktualizowane. Jeśli korzystałeś z autoskalowania, delty zostały zresetowane — możesz je ponownie włączyć w panelu.

W razie pytań odpowiedz na ten ticket.

Pozdrawiamy,
Zespół Verris`;

export function PlanChangeTicketTemplate({
  domain,
  fromPlan,
  toPlan,
}: {
  domain: string;
  fromPlan: string;
  toPlan: string;
}) {
  const [copied, setCopied] = useState(false);
  const text = TEMPLATE.replace('{{domain}}', domain)
    .replace('{{fromPlan}}', fromPlan)
    .replace('{{toPlan}}', toPlan)
    .replace(
      '{{billingNote}}',
      'zgodnie z podglądem w systemie (dopłata lub uznanie na portfel)',
    );

  return (
    <div className="rounded-xl border border-white/10 bg-black/25 p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-neutral-500">
        Szablon odpowiedzi (ticket)
      </p>
      <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">
        {text}
      </pre>
      <button
        type="button"
        className="mt-2 text-xs text-cyan-400 hover:text-cyan-300"
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        }}
      >
        {copied ? 'Skopiowano' : 'Kopiuj do schowka'}
      </button>
    </div>
  );
}

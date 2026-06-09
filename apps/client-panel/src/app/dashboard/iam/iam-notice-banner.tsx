'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';

const NOTICES: Record<string, string> = {
  'permissions-saved': 'Uprawnienia subkonta zostały zapisane.',
  'member-disabled': 'Subkonto zostało wyłączone. Operator nie może się ponownie zalogować.',
  'invite-sent': 'Zaproszenie zostało wysłane.',
  'invite-revoked': 'Zaproszenie zostało odwołane.',
};

export function IamNoticeBanner() {
  const searchParams = useSearchParams();
  const notice = searchParams.get('notice');
  const message = notice ? NOTICES[notice] : null;
  if (!message) return null;

  return (
    <div className="flex items-start justify-between gap-4 rounded-2xl border border-eko/40 bg-eko-bg/80 px-4 py-3 text-sm text-eko-foreground">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-accent" aria-hidden />
        <p>{message}</p>
      </div>
      <Link
        href="/dashboard/iam"
        className="shrink-0 text-xs text-accent underline hover:text-verris-tip"
      >
        Zamknij
      </Link>
    </div>
  );
}

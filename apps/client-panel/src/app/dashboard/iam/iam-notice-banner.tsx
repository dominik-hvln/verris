'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

const NOTICES: Record<string, string> = {
  'permissions-saved': 'Uprawnienia subkonta zostały zapisane.',
  'member-disabled': 'Subkonto zostało wyłączone. Operator nie może się ponownie zalogować.',
  'invite-sent': 'Zaproszenie zostało wysłane.',
  'invite-revoked': 'Zaproszenie zostało odwołane.',
};

export function IamNoticeBanner({ blad }: { blad?: string | null }) {
  const searchParams = useSearchParams();
  const notice = searchParams.get('notice');
  if (notice === 'blad' && blad) {
    return (
      <div role="alert" className="flex items-start gap-2 rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
        <p>{blad}</p>
      </div>
    );
  }
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

'use client';

import { useSearchParams } from 'next/navigation';
import { CheckCircle2, Info } from 'lucide-react';

export function LoginNotices() {
  const searchParams = useSearchParams();
  const invite = searchParams.get('invite');
  const reason = searchParams.get('reason');

  if (invite === 'accepted') {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-2">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        Subkonto aktywowane. Zaloguj się nowym hasłem.
      </div>
    );
  }

  if (reason === 'session-ended') {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-sky-200 bg-sky-500/10 border border-sky-500/20 rounded-xl mb-2">
        <Info className="h-5 w-5 shrink-0" />
        Sesja wygasła lub konto zostało wyłączone. Zaloguj się ponownie.
      </div>
    );
  }

  if (searchParams.get('notice') === 'password-reset') {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-2">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        Hasło zostało zmienione. Możesz się zalogować.
      </div>
    );
  }

  if (searchParams.get('notice') === 'email-verified') {
    return (
      <div className="flex items-center gap-3 p-4 text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl mb-2">
        <CheckCircle2 className="h-5 w-5 shrink-0" />
        E-mail potwierdzony. Możesz się zalogować.
      </div>
    );
  }

  return null;
}

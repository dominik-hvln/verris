import { AlertTriangle } from 'lucide-react';
import { hostingFetchErrorMessage } from '@/lib/client-hosting-messages';
import { cx } from './cx';

export function PanelFetchError({
  message,
  className,
}: {
  message: string;
  className?: string;
}) {
  return (
    <p className={cx('flex items-start gap-2 text-sm text-amber-300', className)}>
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <span>{hostingFetchErrorMessage(message)}</span>
    </p>
  );
}

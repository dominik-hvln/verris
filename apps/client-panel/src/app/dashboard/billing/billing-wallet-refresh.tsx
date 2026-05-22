'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Po powrocie ze Stripe odświeża layout (badge portfela w topbarze). */
export function BillingWalletRefresh({ status }: { status?: string }) {
  const router = useRouter();

  useEffect(() => {
    if (status !== 'success') return;
    router.refresh();
    const interval = window.setInterval(() => router.refresh(), 5000);
    const stop = window.setTimeout(() => window.clearInterval(interval), 30000);
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stop);
    };
  }, [status, router]);

  return null;
}

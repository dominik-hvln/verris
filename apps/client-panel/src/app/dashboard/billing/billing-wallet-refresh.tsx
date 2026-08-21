'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { trackStripeCheckoutSuccess } from '@/lib/analytics-events';

/** Po powrocie ze Stripe odświeża layout (badge portfela w topbarze). */
export function BillingWalletRefresh({ status }: { status?: string }) {
  const router = useRouter();
  const tracked = useRef(false);

  useEffect(() => {
    if (status !== 'success') return;
    // GA4: powrót ze Stripe Checkout — raz na wejście (router.refresh()
    // re-renderuje ten komponent, ref chroni przed duplikatami).
    if (!tracked.current) {
      tracked.current = true;
      trackStripeCheckoutSuccess();
    }
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

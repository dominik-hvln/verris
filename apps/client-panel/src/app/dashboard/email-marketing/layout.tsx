import { notFound } from 'next/navigation';
import { clientFeatures } from '@/lib/client-features';

/** E-mail marketing ukryty do ukończenia (2026-09-28) — wejście z adresu kończy się 404. */
export default function EmailMarketingLayout({ children }: { children: React.ReactNode }) {
  if (!clientFeatures.emailMarketing) notFound();
  return children;
}

import { redirect } from 'next/navigation';

/** @deprecated Użyj /dashboard/domains/buy */
export default function RegistrarRedirectPage() {
  redirect('/dashboard/domains/buy');
}

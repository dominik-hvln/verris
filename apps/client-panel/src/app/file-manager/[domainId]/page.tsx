import { redirect } from 'next/navigation';

/**
 * Legacy URL from the old file-manager screen: redirect to the current DA-backed view.
 */
export default async function LegacyFileManagerPage() {
  redirect('/dashboard/file-manager');
}

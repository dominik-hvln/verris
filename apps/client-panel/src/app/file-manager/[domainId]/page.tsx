import { redirect } from 'next/navigation';

/**
 * Stary URL z mockowaną listą plików — przekierowanie na prawdziwy widok (link do DA).
 */
export default async function LegacyFileManagerPage() {
  redirect('/dashboard/file-manager');
}

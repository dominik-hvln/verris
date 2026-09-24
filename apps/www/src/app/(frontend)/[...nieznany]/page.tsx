import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { metadata as metadane404 } from '../not-found';

/** Tytuł karty i noindex — metadane z not-found.tsx nie działają, gdy 404 rzuca strona przez notFound(). */
export const metadata: Metadata = metadane404;

/** Nieznane adresy trafiają do `not-found.tsx` tej grupy (z nagłówkiem i stopką strony), nie do domyślnego 404 Next.js. */
export default function Nieznany() {
  notFound();
}

import { notFound } from 'next/navigation';

/** Nieznane adresy trafiają do `not-found.tsx` tej grupy (z nagłówkiem i stopką strony), nie do domyślnego 404 Next.js. */
export default function Nieznany() {
  notFound();
}

import { redirect } from 'next/navigation';

// Pomoc = baza wiedzy pod pomoc.verris.pl (KbPublicController). /pomoc przekierowuje tam.
export default function Page() {
  redirect('https://pomoc.verris.pl');
}

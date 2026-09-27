import Link from 'next/link';
import { cookies, headers } from 'next/headers';
import { CIASTECZKO_BLEDU_IAM } from '../dashboard/iam/constants';
import { acceptInviteAction, infoZaproszenia, przyjmijWlasnymKontemAction } from '../dashboard/iam/actions';
import { getAuthToken } from '@/lib/auth';
import { fetchSessionProfile } from '@/lib/session-profile';
import { AUTH_INPUT, AUTH_PRZYCISK, AuthShell } from '@/components/auth-shell';

const LINK = 'font-semibold text-foreground underline underline-offset-4 hover:text-accent';

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; notice?: string }>;
}) {
  const { token = '', notice } = await searchParams;
  const tresc = notice === 'blad' ? (await cookies()).get(CIASTECZKO_BLEDU_IAM)?.value : undefined;
  const komunikat = tresc ? (
    <p role="alert" className="mx-8 mt-6 rounded-xl border border-rose-500/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">{tresc}</p>
  ) : null;
  const info = await infoZaproszenia(token);
  // PB-20 — adres ma już konto Verris: przyjęcie z własnego konta, bez nowego loginu.
  if (info?.maKonto) {
    const auth = await getAuthToken();
    const sesja = auth ? await fetchSessionProfile(auth, (await headers()).get('x-forwarded-for')) : null;
    const toSamoKonto = sesja?.email?.toLowerCase() === info.email.toLowerCase();
    return (
      <AuthShell>
        <div className="border-b border-border p-8 pb-6">
          <h1 className="font-display text-xl font-bold text-foreground">Dostęp do konta {info.ownerEmail}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {info.ownerEmail} udostępnia Ci {info.wybraneUslugi ? 'wybrane usługi swojego konta' : 'swoje konto'}. Adres{' '}
            <b className="text-foreground">{info.email}</b> ma już konto Verris — przyjmiesz zaproszenie ze swojego konta i będziesz przełączać się między kontami w menu bocznym.
          </p>
        </div>
        {komunikat}
        <div className="p-8">
          {toSamoKonto ? (
            <form action={przyjmijWlasnymKontemAction}>
              <input type="hidden" name="token" value={token} />
              <button className={AUTH_PRZYCISK}>Przyjmij zaproszenie</button>
            </form>
          ) : (
            <div className="space-y-4 text-sm">
              <p className="text-muted-foreground">
                {sesja ? `Jesteś zalogowany jako ${sesja.email}. Zaloguj się na konto ${info.email}` : `Zaloguj się na konto ${info.email}`}, a potem otwórz ponownie link z maila.
              </p>
              <Link href="/login" className={AUTH_PRZYCISK}>
                Przejdź do logowania
              </Link>
            </div>
          )}
        </div>
      </AuthShell>
    );
  }
  return (
    <AuthShell
      stopka={
        <>
          Masz już aktywne konto?{' '}
          <Link href="/login" className={LINK}>
            Przejdź do logowania
          </Link>
        </>
      }
    >
      <div className="border-b border-border p-8 pb-6">
        <h1 className="font-display text-xl font-bold text-foreground">Aktywacja subkonta</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {info?.ownerEmail ? `${info.ownerEmail} zaprasza Cię do swojego konta. ` : ''}Ustaw swoje dane i hasło.
        </p>
      </div>
      {komunikat}
      <form action={acceptInviteAction} className="space-y-5 p-8">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <label htmlFor="firstName" className="text-sm font-semibold text-verris-body">Imię</label>
          <input id="firstName" name="firstName" required autoComplete="given-name" className={AUTH_INPUT} />
        </div>
        <div className="space-y-2">
          <label htmlFor="lastName" className="text-sm font-semibold text-verris-body">Nazwisko</label>
          <input id="lastName" name="lastName" required autoComplete="family-name" className={AUTH_INPUT} />
        </div>
        <div className="space-y-2">
          <label htmlFor="password" className="text-sm font-semibold text-verris-body">Hasło</label>
          <input id="password" name="password" required minLength={8} type="password" autoComplete="new-password" className={AUTH_INPUT} />
        </div>
        <button className={AUTH_PRZYCISK}>Aktywuj subkonto</button>
      </form>
    </AuthShell>
  );
}

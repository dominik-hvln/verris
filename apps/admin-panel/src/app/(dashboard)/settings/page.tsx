import { TwoFactorSection } from "./two-factor-section";
import { PasskeySection } from "./security/passkey-section";
import { BreakGlassSection } from "./security/break-glass-section";

export const dynamic = "force-dynamic";

/**
 * Twoje konto — całe bezpieczeństwo logowania na jednej stronie: 2FA, passkey, kody break-glass
 * (10.10; wcześniej 2FA tu, passkey i break-glass na /settings/security, a obok drugi spis ustawień).
 * `?enroll=1` — po logowaniu bez passkeya (login/page.tsx).
 */
export default async function TwojeKontoPage({ searchParams }: { searchParams: Promise<{ enroll?: string }> }) {
  const sp = await searchParams;
  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Twoje konto</h1>
        <p className="mt-1 text-sm text-muted-foreground">Logowanie: weryfikacja dwuetapowa, passkey i kody awaryjne.</p>
      </header>
      <TwoFactorSection />
      <PasskeySection enrollHint={sp?.enroll === "1"} />
      <BreakGlassSection />
    </div>
  );
}

import { TwoFactorSection } from "./two-factor-section";

export const dynamic = "force-dynamic";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ustawienia konta admina</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bezpieczeństwo Twojego konta administratora.
        </p>
      </header>
      <TwoFactorSection />
      <p className="text-sm text-muted-foreground space-x-4">
        <a href="/settings/live-readiness" className="text-emerald-400 hover:text-emerald-300 underline">
          Gotowość do startu LIVE
        </a>
        <a href="/settings/security" className="text-emerald-400 hover:text-emerald-300 underline">
          Bezpieczeństwo (passkey, break-glass)
        </a>
        <a href="/settings/company" className="text-emerald-400 hover:text-emerald-300 underline">
          Firma i faktury (KSeF)
        </a>
        <a href="/settings/canned-responses" className="text-emerald-400 hover:text-emerald-300 underline">
          Szablony odpowiedzi (BOK)
        </a>
        <a href="/settings/platform" className="text-emerald-400 hover:text-emerald-300 underline">
          Ustawienia platformy (EKO, sesje)
        </a>
        <a href="/settings/mail" className="text-emerald-400 hover:text-emerald-300 underline">
          Poczta wychodząca (SMTP)
        </a>
      </p>
    </div>
  );
}

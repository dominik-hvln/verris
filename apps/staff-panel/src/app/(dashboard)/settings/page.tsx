import { TwoFactorSection } from "./two-factor-section";

export const dynamic = "force-dynamic";

export default function StaffSettingsPage() {
  return (
    <div className="space-y-6 p-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight">Ustawienia konta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Bezpieczeństwo Twojego konta operatora.
        </p>
      </header>
      <TwoFactorSection />
    </div>
  );
}

import Link from "next/link";
import { Mail, ShieldCheck } from "lucide-react";
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
      <Link
        href="/settings/mail"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm hover:border-cyan-500/30"
      >
        <Mail className="h-5 w-5 text-cyan-400" />
        <span>
          <span className="font-semibold text-white block">Poczta @verris.pl</span>
          <span className="text-muted-foreground text-xs">SOGo, IMAP i SMTP dla klienta pocztowego</span>
        </span>
      </Link>
      <Link
        href="/settings/security"
        className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-sm hover:border-cyan-500/30"
      >
        <ShieldCheck className="h-5 w-5 text-cyan-400" />
        <span>
          <span className="font-semibold text-white block">Passkeys i kody awaryjne</span>
          <span className="text-muted-foreground text-xs">Logowanie passkey + break-glass</span>
        </span>
      </Link>
      <TwoFactorSection />
    </div>
  );
}

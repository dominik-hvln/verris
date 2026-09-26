import { PasskeySection } from "./passkey-section";
import { BreakGlassSection } from "./break-glass-section";

export const dynamic = "force-dynamic";

export default async function SecuritySettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ enroll?: string }>;
}) {
  const sp = await searchParams;
  const enroll = sp?.enroll === "1";
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Bezpieczeństwo konta</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Passkeys i awaryjne kody logowania dla Twojego konta administratora.
        </p>
      </header>
      <PasskeySection enrollHint={enroll} />
      <BreakGlassSection />
    </div>
  );
}

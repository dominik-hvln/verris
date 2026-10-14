import { VerrisLockup } from "@/components/logo";
import { VerrisPatternLayer } from "@/components/brand/brand-pattern";
import { SpinBorder } from "@/components/spin-border";

/** Ten sam układ co ekran logowania: tło z wzorem, logo, karta z obramowaniem. */
export function AuthShell({
  children,
  stopka,
  szeroka,
  haslo,
}: {
  children: React.ReactNode;
  stopka?: React.ReactNode;
  /** Szersza karta (rejestracja: imię i nazwisko obok siebie). */
  szeroka?: boolean;
  /** Hasło marki pod logo (jak na ekranie logowania). */
  haslo?: boolean;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background py-12">
      <VerrisPatternLayer opacity={0.07} />
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[400px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-verris-mint/5 blur-[120px]" />
      </div>
      <div className={`relative z-10 mx-4 w-full ${szeroka ? "max-w-[480px]" : "max-w-[420px]"}`}>
        <div className="mb-10 flex justify-center">
          <VerrisLockup size="lg" layout="vertical" showTagline={haslo} className="items-center" />
        </div>
        <div className="relative overflow-hidden rounded-[32px] p-px shadow-[0_0_50px_rgba(0,0,0,0.35)]">
          <SpinBorder className="opacity-30" />
          <div className="relative rounded-[calc(32px-1px)] border border-border bg-card/95 backdrop-blur-3xl">{children}</div>
        </div>
        {stopka ? <div className="mt-8 text-center text-sm font-medium text-muted-foreground">{stopka}</div> : null}
      </div>
    </div>
  );
}

export const AUTH_INPUT =
  "w-full rounded-xl border border-border bg-verris-pine/40 px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground transition-all duration-300 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent";
export const AUTH_PRZYCISK =
  "flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50";

/** Komunikat błędu formularza na stronach logowania — kolory z tokenów (oba motywy). */
export const AUTH_BLAD =
  "flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm font-medium text-destructive";
/** Komunikat powodzenia / informacji (np. „wysłaliśmy link”). */
export const AUTH_INFO =
  "flex items-start gap-3 rounded-xl border border-verris-mid/30 bg-verris-green/10 p-4 text-sm text-foreground";
export const AUTH_ETYKIETA = "text-sm font-semibold text-verris-body";
export const AUTH_LINK = "font-semibold text-accent transition-colors hover:text-verris-tip";

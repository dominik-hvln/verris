import { CompanyForm } from "./company-form";
import { KsefForm } from "./ksef-form";

export const dynamic = "force-dynamic";

export default function CompanySettingsPage() {
  return (
    <div className="space-y-6 p-6 max-w-4xl">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Firma i faktury</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Dane sprzedawcy na fakturach oraz integracja z KSeF (Krajowy System e-Faktur).
        </p>
      </header>
      <CompanyForm />
      <KsefForm />
    </div>
  );
}

import { fetchSslProducts, fetchWhoisPrivacyPrice } from "./actions";
import { WhoisPrivacyForm } from "./whois-privacy-form";
import { SslPricesForm } from "./ssl-prices-form";
import { BladStrony, wynik } from "@/components/blad-strony";

export const dynamic = "force-dynamic";

/** Ceny dodatków do domen: ukrycie danych WHOIS (A-14) i płatne certyfikaty SSL (G-08). */
export default async function DomainPricingPage() {
  const w = await wynik(Promise.all([fetchWhoisPrivacyPrice(), fetchSslProducts()]));
  if (!w.ok) return <BladStrony blad={w.blad} tytul="Domeny i SSL" />;
  const [whois, ssl] = w.dane;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-[28px] lg:text-[34px]">Domeny i SSL</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ceny dodatków do domen widoczne w panelu klienta. Pusta cena = usługa niedostępna.</p>
      </header>
      <WhoisPrivacyForm initial={whois.whoisPrivacyPrice} />
      <SslPricesForm dane={ssl} />
    </div>
  );
}

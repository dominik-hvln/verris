/**
 * Paczka 129 – link do adresu technicznego usługi (`vxxxxxxx.<domena techniczna>`).
 * Konto założone na adresie technicznym ma na nim certyfikat (Let's Encrypt dla tej nazwy) → https. Przy koncie
 * z własną domeną adres techniczny jest aliasem domeny głównej, a certyfikat konta wystawiamy na domenę klienta
 * (bez aliasu) → http, żeby przeglądarka nie straszyła ostrzeżeniem o certyfikacie.
 */
export function linkAdresuTechnicznego(adres: string, domenaKonta: string | null | undefined): string {
  const zSsl = (domenaKonta ?? '').trim().toLowerCase() === adres.trim().toLowerCase();
  return `${zSsl ? 'https' : 'http'}://${adres}`;
}

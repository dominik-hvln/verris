/**
 * Produkty aplikacyjne — usługi bez konta na węźle i bez domeny: e-mail marketing (Q-05) i abonament
 * Verris Kreator Pro (paczka 121). Zamówienie aktywuje je od razu po płatności (portfel, karta, Paynow),
 * a odnowienia, karencja, zawieszenie, wygaśnięcie i anulowanie idą wspólnym torem subskrypcji.
 *
 * Jedno miejsce zamiast porównań z 'EMAIL_MARKETING' rozsianych po zakupie, aktywacji po płatności kartą
 * i wyborze węzła — kolejny produkt aplikacyjny dopisuje się tutaj. Porównanie przez string: wygenerowany
 * klient Prismy bywa starszy od schematu (Dockerfile.api regeneruje go przy budowie).
 */
export const PRODUKTY_APLIKACYJNE = ['EMAIL_MARKETING', 'KREATOR_PRO'] as const;

export function produktAplikacyjny(productKind: string | null | undefined): boolean {
  return (PRODUKTY_APLIKACYJNE as readonly string[]).includes(productKind ?? '');
}

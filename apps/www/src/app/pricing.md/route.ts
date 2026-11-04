import { netto, stawka, zl, zlGrosze } from '@/lib/ceny';
import { pobierzCeny } from '@/lib/ceny-api';

/**
 * /pricing.md — cennik strukturalny dla agentów AI (linkowany z /llms.txt). Do 1.11.2026 był plikiem statycznym
 * public/pricing.md z cenami na sztywno (nieaktualna cena roczna); teraz ceny i stawki idą z API (lib/ceny-api).
 */
export const revalidate = 300;

export async function GET() {
  const c = await pobierzCeny();
  const h = c.hosting;
  const p = c.poczta;
  const s = c.stawki;
  const body = `# Cennik Verris (PLN, ceny brutto i netto)

Źródło: https://verris.pl/cennik · Ceny pobierane z cennika w panelu, aktualizowane co kilka minut.

## Hosting z autoskalowaniem
- Cena miesięczna: ${zl(h.miesiecznie)}/mies. brutto (${zl(netto(h.miesiecznie))} netto)
- Cena roczna: ${zl(h.rocznie)}/rok brutto (${zl(netto(h.rocznie))} netto, ≈ ${zlGrosze(h.rocznie / 12)}/mies. brutto)
- Zasoby bazowe w cenie: 50 GB dysku NVMe, limit 8 GB RAM i 2 vCPU
- Autoskalowanie (maksymalnie): 1000 GB dysku, 64 GB RAM, 24 vCPU
- Stawki autoskalowania (brutto za godzinę): CPU ${stawka(s.cpu)} zł za 1% · RAM ${stawka(s.ram)} zł za 1 GB · dysk ${stawka(s.dysk)} zł za 1 GB
- W cenie, bez dopłat: migracja strony i poczty, certyfikat SSL Let's Encrypt, kopie zapasowe
  z samodzielnym odtwarzaniem w ramach limitu Planu (domyślnie z kopią bezpieczeństwa przed
  przywróceniem), obsługa starych wersji PHP
- Dodatkowa przestrzeń kopii zapasowych ponad limit Planu jest rozliczana zużyciem (§9 ust. 5 regulaminu)
- Bez limitu liczby stron, skrzynek e-mail i transferu (w ramach zasobów konta i zasad uczciwego korzystania)
- Model odnowień: odnowienie wg cennika z dnia odnowienia, podane z góry; rabat na start tylko przy pierwszym zakupie (pierwszy rok albo pierwszy miesiąc), kwota po rabacie widoczna przed zapłatą

## Poczta bez hostingu strony
- ${zl(p.miesiecznie)}/mies. brutto (${zl(netto(p.miesiecznie))} netto) albo ${zl(p.rocznie)}/rok brutto (${zl(netto(p.rocznie))} netto)

## Domeny
- Rejestracja, transfer i utrzymanie. Dostępność i ceny w panelu. Bez cichych auto-odnowień
  (przypomnienia 30/14/7 dni przed wygaśnięciem).

## Płatności i faktury
- Karta, BLIK, przelew online, Kredyty Verris.
- Faktura VAT do każdej płatności, widoczna w panelu.
`;
  return new Response(body, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  });
}

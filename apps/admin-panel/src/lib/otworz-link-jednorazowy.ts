/**
 * Jednorazowy link (np. SSO do DirectAdmina węzła) w nowej karcie — wspólne dla przycisku na karcie węzła
 * i Cmd+K. Kartę otwieramy PRZED awaitem (blokada wyskakujących okien), a po odpowiedzi podmieniamy adres.
 *
 * Bez cechy „noopener” w window.open: z nią przeglądarka zwraca null (specyfikacja HTML), więc nie da się
 * podmienić adresu — zostawała pusta karta about:blank, a link szedł drugim window.open już po awaicie
 * (często blokowanym). Powiązanie z panelem zrywamy ręcznie: `opener = null`.
 *
 * Zwraca komunikat błędu albo null, gdy link otwarto.
 */
export async function otworzLinkJednorazowy(
  pobierz: () => Promise<{ data: { url: string } } | { error: string }>,
): Promise<string | null> {
  const okno = window.open("about:blank", "_blank");
  if (okno) okno.opener = null;
  const res = await pobierz();
  if ("error" in res) {
    okno?.close();
    return res.error;
  }
  if (okno) okno.location.href = res.data.url;
  else window.open(res.data.url, "_blank", "noopener");
  return null;
}

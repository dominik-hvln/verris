/**
 * Paczka 109 (A1-05, A1-06) — strona pod linkiem z maila (potwierdzenie bety, wypis z wiadomości). GET pokazuje
 * przycisk, akcję wykonuje POST z formularza: skanery linków w poczcie (Safe Links, bramki firmowe) otwierają linki
 * GET-em i wcześniej potwierdzały albo wypisywały za człowieka. API stoi za Caddy z `default-src 'none'`
 * (`header ?` — tylko gdy brak nagłówka), więc trasa wysyła własne CSP z inline style.
 */
export const CSP_STRONY_LINKU = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'";

const escHtml = (t: string) => t.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function stronaLinku(title: string, body: string, przycisk?: { token: string; etykieta: string; akcja: string }, blad = false): string {
  const form = przycisk
    ? `<form method="post" action="${escHtml(przycisk.akcja)}"><input type="hidden" name="token" value="${escHtml(przycisk.token)}"><button type="submit">${escHtml(przycisk.etykieta)}</button></form>`
    : '';
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex"><title>${escHtml(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0C1A14;color:#F4F4EE;font-family:system-ui,sans-serif;padding:24px}
.card{max-width:460px;background:#0E1F17;border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:32px}
h1{font-size:22px;margin:0 0 12px;color:${blad ? '#F4C56A' : '#34E5A0'}}p{margin:0;color:#B4C2BB;line-height:1.55}
button{margin-top:20px;font:inherit;font-weight:600;background:#34E5A0;color:#0C1A14;border:0;border-radius:12px;padding:12px 20px;cursor:pointer}
button:focus-visible{outline:3px solid #F4F4EE;outline-offset:2px}
a{display:inline-block;margin-top:20px;color:#34E5A0}</style></head>
<body><main class="card"><h1>${escHtml(title)}</h1><p>${escHtml(body)}</p>${form}<a href="https://verris.pl">← Wróć na verris.pl</a></main></body></html>`;
}

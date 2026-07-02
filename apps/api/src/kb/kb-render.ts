/**
 * KB-PUBLIC — renderowanie Markdown → HTML (bezpieczne, self-contained) oraz
 * shell publicznej strony bazy wiedzy (brand KV Verris, meta/OG/JSON-LD).
 * Bez zależności zewn. — treść pochodzi od admina/staffa (nie od userów).
 */

const BRAND = {
  pine: '#0c1a14',
  card: '#0e1f17',
  green: '#0f7a52',
  mint: '#34e5a0',
  paper: '#f4f4ee',
  stone: '#9aa39c',
  body: '#0c1a14',
  pageBg: '#f4f4ee',
  cardBg: '#ffffff',
  border: '#e3e3da',
  textMuted: '#5b655f',
};

export function escapeHtml(v: string): string {
  return v
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function inline(s: string): string {
  let out = escapeHtml(s);
  // obrazy ![alt](url)
  out = out.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_, alt: string, url: string) => {
    const safe = /^https?:\/\//i.test(url.trim()) ? url.trim() : '';
    return safe ? `<img src="${escapeHtml(safe)}" alt="${alt}" loading="lazy" style="max-width:100%;border-radius:10px;border:1px solid ${BRAND.border};" />` : '';
  });
  // linki [label](url)
  out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label: string, url: string) => {
    const u = url.trim();
    const safe = /^(https?:|mailto:|\/)/i.test(u) ? u : '#';
    const ext = /^https?:/i.test(safe);
    return `<a href="${escapeHtml(safe)}"${ext ? ' rel="noopener"' : ''} style="color:${BRAND.green};text-decoration:underline;">${label}</a>`;
  });
  out = out.replace(/`([^`]+)`/g, `<code style="background:#eaf7f0;padding:1px 6px;border-radius:5px;font-family:ui-monospace,Menlo,monospace;font-size:.92em;">$1</code>`);
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  return out;
}

/** Minimalny, bezpieczny parser Markdown wystarczający dla artykułów KB. */
export function renderMarkdown(md: string): string {
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // code block ```
    if (line.trim().startsWith('```')) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="background:${BRAND.pine};color:${BRAND.paper};padding:14px 16px;border-radius:10px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.5;"><code>${escapeHtml(buf.join('\n'))}</code></pre>`);
      continue;
    }
    // heading
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const lvl = Math.min(h[1].length + 1, 4); // # → h2 (h1 to tytuł strony)
      const sizes: Record<number, string> = { 2: '26px', 3: '20px', 4: '17px' };
      out.push(`<h${lvl} style="margin:28px 0 10px;font-weight:700;line-height:1.3;color:${BRAND.pine};font-size:${sizes[lvl] ?? '17px'};">${inline(h[2])}</h${lvl}>`);
      i++; continue;
    }
    // blockquote
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote style="margin:16px 0;padding:10px 16px;border-left:3px solid ${BRAND.mint};background:#eaf7f0;border-radius:0 8px 8px 0;color:${BRAND.textMuted};">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    // hr
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push(`<hr style="border:0;border-top:1px solid ${BRAND.border};margin:24px 0;" />`);
      i++; continue;
    }
    // ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(`<li style="margin:6px 0;">${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol style="margin:12px 0;padding-left:24px;line-height:1.7;">${items.join('')}</ol>`);
      continue;
    }
    // unordered list
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(`<li style="margin:6px 0;">${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i++; }
      out.push(`<ul style="margin:12px 0;padding-left:24px;line-height:1.7;">${items.join('')}</ul>`);
      continue;
    }
    // paragraph
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|```)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p style="margin:0 0 16px;line-height:1.75;color:#22302a;font-size:16px;">${inline(buf.join('\n').replace(/\n/g, ' '))}</p>`);
  }
  return out.join('\n');
}

export interface PublicPageInput {
  title: string;
  description: string;
  canonical: string;
  baseUrl: string;
  bodyHtml: string;
  breadcrumbs: Array<{ label: string; url?: string }>;
  jsonLd?: object;
  updatedAt?: Date;
}

/** Pełny dokument HTML publicznej strony KB (SSR, brand KV, SEO). */
export function renderPublicPage(p: PublicPageInput): string {
  const crumbs = p.breadcrumbs
    .map((b, idx) => {
      const last = idx === p.breadcrumbs.length - 1;
      const label = escapeHtml(b.label);
      return last || !b.url
        ? `<span style="color:${BRAND.textMuted};">${label}</span>`
        : `<a href="${escapeHtml(b.url)}" style="color:${BRAND.green};text-decoration:none;">${label}</a>`;
    })
    .join(` <span style="color:${BRAND.stone};">/</span> `);

  const jsonLdScript = p.jsonLd
    ? `<script type="application/ld+json">${JSON.stringify(p.jsonLd).replace(/</g, '\\u003c')}</script>`
    : '';

  return `<!doctype html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(p.title)}</title>
<meta name="description" content="${escapeHtml(p.description)}" />
<link rel="canonical" href="${escapeHtml(p.canonical)}" />
<meta property="og:type" content="article" />
<meta property="og:title" content="${escapeHtml(p.title)}" />
<meta property="og:description" content="${escapeHtml(p.description)}" />
<meta property="og:url" content="${escapeHtml(p.canonical)}" />
<meta property="og:site_name" content="Verris — Pomoc" />
<meta name="twitter:card" content="summary" />
<meta name="robots" content="index,follow" />
<style>
  body{margin:0;background:${BRAND.pageBg};color:${BRAND.body};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;}
  a{color:${BRAND.green};}
  .wrap{max-width:820px;margin:0 auto;padding:0 20px;}
  header.kv{background:${BRAND.pine};background-image:linear-gradient(135deg,${BRAND.pine},${BRAND.card});border-bottom:2px solid ${BRAND.mint};}
  header.kv .wrap{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
  .brand .mark{width:32px;height:32px;border-radius:8px;background:${BRAND.mint};color:${BRAND.pine};font-weight:800;font-size:19px;display:flex;align-items:center;justify-content:center;}
  .brand .wm{color:${BRAND.paper};font-weight:800;font-size:20px;letter-spacing:-.04em;}
  .brand .wm i{color:${BRAND.mint};font-style:normal;}
  header.kv .tag{color:${BRAND.stone};font-size:12px;text-transform:uppercase;letter-spacing:.12em;}
  main{padding:28px 0 60px;}
  .crumbs{font-size:13px;margin:4px 0 18px;}
  h1{font-size:32px;line-height:1.2;margin:6px 0 8px;color:${BRAND.pine};letter-spacing:-.01em;}
  .lead{font-size:18px;color:${BRAND.textMuted};margin:0 0 22px;line-height:1.6;}
  .card{background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:16px;padding:26px 28px;}
  .cats{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:14px;}
  .cat{display:block;background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:14px;padding:18px 20px;text-decoration:none;color:${BRAND.pine};transition:border-color .2s;}
  .cat:hover{border-color:${BRAND.mint};}
  .cat h3{margin:0 0 4px;font-size:17px;}
  .cat p{margin:0;color:${BRAND.textMuted};font-size:14px;line-height:1.5;}
  .cat .n{color:${BRAND.green};font-size:12px;font-weight:600;margin-top:8px;display:block;}
  ul.arts{list-style:none;padding:0;margin:14px 0 0;}
  ul.arts li{margin:0;border-top:1px solid ${BRAND.border};}
  ul.arts li:first-child{border-top:0;}
  ul.arts a{display:block;padding:12px 2px;text-decoration:none;color:${BRAND.pine};font-weight:600;}
  ul.arts a span{display:block;color:${BRAND.textMuted};font-weight:400;font-size:14px;margin-top:2px;}
  footer{border-top:1px solid ${BRAND.border};padding:24px 0;color:${BRAND.textMuted};font-size:13px;}
  .meta{color:${BRAND.textMuted};font-size:13px;margin-top:26px;}
</style>
${jsonLdScript}
</head>
<body>
<header class="kv"><div class="wrap">
  <a class="brand" href="${escapeHtml(p.baseUrl)}"><span class="mark">V</span><span class="wm">verris<i>.</i></span></a>
  <span class="tag">Pomoc &amp; Baza wiedzy</span>
</div></header>
<main><div class="wrap">
  <nav class="crumbs">${crumbs}</nav>
  ${p.bodyHtml}
  ${p.updatedAt ? `<p class="meta">Ostatnia aktualizacja: ${escapeHtml(new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(p.updatedAt))}</p>` : ''}
</div></main>
<footer><div class="wrap">
  © ${new Date().getFullYear()} Verris — skaluj świadomie ·
  <a href="https://panel.verris.pl" style="color:${BRAND.green};">Panel klienta</a> ·
  <a href="${escapeHtml(p.baseUrl)}" style="color:${BRAND.green};">Baza wiedzy</a>
</div></footer>
</body>
</html>`;
}

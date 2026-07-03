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

/** Znak Verris (ten sam wektor co w panelu: chevron „V" + mint akcent). */
export const VERRIS_MARK_SVG = `<svg width="34" height="34" viewBox="0 0 100 100" role="img" aria-label="Verris" style="display:block;">
  <path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="${BRAND.paper}" fill-rule="evenodd"/>
  <path d="M44 55 L56 55 L50 69 Z" fill="none" stroke="${BRAND.mint}" stroke-width="1.6"/>
</svg>`;

/**
 * Wzorzec brandingowy Verris — autorski znak „V" (wariant „opacity-green").
 * Serwowany przez API jako /brand/cta-pattern.svg (publiczny URL, cache+CORS),
 * więc działa jako tło CSS na pomoc.verris.pl i w panelu bez osadzania SVG na
 * każdej stronie. Bazę URL bierzemy z tego samego źródła co logo w mailach.
 */
const BRAND_ASSET_BASE = (
  process.env.PUBLIC_API_URL ||
  process.env.API_BASE_URL ||
  'https://api.verris.pl'
).replace(/\/$/, '');
export const BRAND_PATTERN_URL = `${BRAND_ASSET_BASE}/brand/cta-pattern.svg`;

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
      out.push(
        `<div class="codeblock"><button class="copybtn" type="button">Kopiuj</button><pre style="background:${BRAND.pine};color:${BRAND.paper};padding:16px;border-radius:10px;overflow:auto;font-family:ui-monospace,Menlo,monospace;font-size:13px;line-height:1.55;margin:0;"><code>${escapeHtml(buf.join('\n'))}</code></pre></div>`,
      );
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

export interface CtaBanner {
  enabled: boolean;
  headline: string;
  subtext: string;
  bullets: string[];
  buttonLabel: string;
  buttonUrl: string;
  statusUrl: string;
  statusLabel: string;
  /** Warstwa wzorca brandingowego (siatka chevronów V). Domyślnie włączona. */
  pattern?: boolean;
}

/** Baner CTA (KV) — realne dane + link do publicznego statusu. Jedno źródło. */
export function renderCtaBanner(cta?: CtaBanner): string {
  if (!cta || !cta.enabled) return '';
  const bullets = (cta.bullets ?? [])
    .filter(Boolean)
    .map(
      (b) =>
        `<li style="display:flex;align-items:center;gap:8px;margin:6px 0;color:${BRAND.paper};font-size:14px;"><span style="color:${BRAND.mint};font-weight:800;">✓</span>${escapeHtml(b)}</li>`,
    )
    .join('');
  const showPattern = cta.pattern !== false;
  const patternLayer = showPattern
    ? `<div aria-hidden="true" style="position:absolute;inset:0;background-image:url('${BRAND_PATTERN_URL}');background-repeat:repeat;background-size:46px 77px;opacity:.18;pointer-events:none;"></div>
    <div aria-hidden="true" style="position:absolute;top:-40%;right:-10%;width:60%;height:180%;background:radial-gradient(circle,${BRAND.mint}22,transparent 70%);pointer-events:none;"></div>`
    : '';
  return `<aside style="position:relative;overflow:hidden;margin:32px 0 8px;background:${BRAND.pine};background-image:linear-gradient(135deg,${BRAND.pine},${BRAND.card});border:1px solid ${BRAND.mint}40;border-radius:16px;padding:26px 28px;">
    ${patternLayer}
    <div style="position:relative;">
      <h2 style="margin:0 0 6px;color:${BRAND.paper};font-size:22px;line-height:1.25;">${escapeHtml(cta.headline)}</h2>
      <p style="margin:0 0 14px;color:${BRAND.stone};font-size:15px;line-height:1.6;">${escapeHtml(cta.subtext)}</p>
      ${bullets ? `<ul style="list-style:none;padding:0;margin:0 0 18px;">${bullets}</ul>` : ''}
      <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;">
        <a href="${escapeHtml(cta.buttonUrl)}" style="display:inline-block;background:${BRAND.mint};color:${BRAND.pine};font-weight:700;text-decoration:none;padding:11px 22px;border-radius:10px;font-size:15px;">${escapeHtml(cta.buttonLabel)}</a>
        ${cta.statusUrl ? `<a href="${escapeHtml(cta.statusUrl)}" style="color:${BRAND.mint};text-decoration:none;font-size:14px;">${escapeHtml(cta.statusLabel || 'Status usług')} →</a>` : ''}
      </div>
    </div>
  </aside>`;
}

export function renderReadingTime(min: number): string {
  return `<span style="display:inline-block;color:${BRAND.textMuted};font-size:13px;">⏱ ${min} min czytania</span>`;
}

export function renderFaq(items: Array<{ q: string; a: string }>): string {
  if (!items?.length) return '';
  const rows = items
    .map(
      (f) => `<div style="border-top:1px solid ${BRAND.border};padding:14px 0;">
        <h3 style="margin:0 0 6px;font-size:16px;color:${BRAND.pine};">${escapeHtml(f.q)}</h3>
        <p style="margin:0;color:#22302a;font-size:15px;line-height:1.6;">${escapeHtml(f.a)}</p>
      </div>`,
    )
    .join('');
  return `<section style="margin:28px 0 8px;"><h2 style="font-size:22px;color:${BRAND.pine};margin:0 0 8px;">Najczęstsze pytania</h2>${rows}</section>`;
}

export function renderRelated(
  base: string,
  items: Array<{ slug: string; title: string; excerpt: string | null }>,
): string {
  if (!items?.length) return '';
  const cards = items
    .map(
      (r) => `<a href="${base}/a/${escapeHtml(r.slug)}" style="display:block;background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;padding:14px 16px;text-decoration:none;color:${BRAND.pine};">
        <strong style="display:block;font-size:15px;">${escapeHtml(r.title)}</strong>
        ${r.excerpt ? `<span style="display:block;color:${BRAND.textMuted};font-size:13px;margin-top:4px;">${escapeHtml(r.excerpt)}</span>` : ''}
      </a>`,
    )
    .join('');
  return `<section style="margin:28px 0 8px;"><h2 style="font-size:20px;color:${BRAND.pine};margin:0 0 12px;">Powiązane artykuły</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;">${cards}</div></section>`;
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
  cta?: CtaBanner;
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
  .wrap{max-width:900px;margin:0 auto;padding:0 20px;}
  header.kv{background:${BRAND.pine};background-image:linear-gradient(135deg,${BRAND.pine},${BRAND.card});border-bottom:2px solid ${BRAND.mint};}
  header.kv .wrap{display:flex;align-items:center;justify-content:space-between;padding:18px 20px;}
  .brand{display:flex;align-items:center;gap:10px;text-decoration:none;}
  .brand .mark{display:flex;align-items:center;}
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
  .codeblock{position:relative;margin:16px 0;}
  .codeblock .copybtn{position:absolute;top:8px;right:8px;background:${BRAND.card};color:${BRAND.paper};border:1px solid ${BRAND.mint}55;border-radius:8px;padding:5px 12px;font-size:12px;cursor:pointer;font-family:inherit;}
  .codeblock .copybtn:hover{background:${BRAND.green};}
  .search{position:relative;}
  .search input{width:220px;max-width:46vw;background:rgba(255,255,255,.08);border:1px solid ${BRAND.mint}33;border-radius:10px;padding:8px 12px;color:${BRAND.paper};font-size:14px;outline:none;}
  .search input::placeholder{color:${BRAND.stone};}
  .search .results{position:absolute;top:44px;right:0;width:340px;max-width:80vw;max-height:60vh;overflow:auto;background:${BRAND.cardBg};border:1px solid ${BRAND.border};border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,.25);z-index:20;display:none;}
  .search .results a{display:block;padding:10px 14px;text-decoration:none;color:${BRAND.pine};border-top:1px solid ${BRAND.border};}
  .search .results a:first-child{border-top:0;}
  .search .results a:hover{background:${BRAND.pageBg};}
  .search .results a span{display:block;color:${BRAND.textMuted};font-size:12px;}
  .search .results .empty{padding:12px 14px;color:${BRAND.textMuted};font-size:13px;}
  @media(max-width:640px){header.kv .tag{display:none;}}
</style>
${jsonLdScript}
</head>
<body>
<header class="kv"><div class="wrap">
  <a class="brand" href="${escapeHtml(p.baseUrl)}"><span class="mark">${VERRIS_MARK_SVG}</span><span class="wm">verris<i>.</i></span></a>
  <div class="search"><input id="kbsearch" type="search" placeholder="Szukaj w bazie wiedzy…" autocomplete="off" aria-label="Szukaj w bazie wiedzy" /><div class="results" id="kbresults"></div></div>
</div></header>
<main><div class="wrap">
  <nav class="crumbs">${crumbs}</nav>
  ${p.bodyHtml}
  ${p.updatedAt ? `<p class="meta">Ostatnia aktualizacja: ${escapeHtml(new Intl.DateTimeFormat('pl-PL', { dateStyle: 'long' }).format(p.updatedAt))}</p>` : ''}
  ${renderCtaBanner(p.cta)}
</div></main>
<footer><div class="wrap">
  © ${new Date().getFullYear()} Verris — skaluj świadomie ·
  <a href="https://panel.verris.pl" style="color:${BRAND.green};">Panel klienta</a> ·
  <a href="${escapeHtml(p.baseUrl)}" style="color:${BRAND.green};">Baza wiedzy</a>
</div></footer>
<script>
(function(){
  var BASE=${JSON.stringify(p.baseUrl)};
  document.querySelectorAll('.codeblock .copybtn').forEach(function(btn){
    btn.addEventListener('click',function(){
      var pre=btn.parentElement.querySelector('pre');var txt=pre?pre.innerText:'';
      if(navigator.clipboard){navigator.clipboard.writeText(txt).then(function(){var o=btn.textContent;btn.textContent='Skopiowano ✓';setTimeout(function(){btn.textContent=o;},1500);});}
    });
  });
  var inp=document.getElementById('kbsearch'),box=document.getElementById('kbresults'),idx=null,loading=false;
  function esc(s){return (s||'').replace(/[&<>"]/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
  function load(cb){if(idx){cb();return;}if(loading)return;loading=true;fetch(BASE+'/api/tree').then(function(r){return r.json();}).then(function(t){idx=[];(t||[]).forEach(function(c){(c.articles||[]).forEach(function(a){idx.push({slug:a.slug,title:a.title,excerpt:a.excerpt||'',cat:c.name||''});});});cb();}).catch(function(){loading=false;});}
  function render(q){if(!q){box.style.display='none';box.innerHTML='';return;}var ql=q.toLowerCase();var hits=idx.filter(function(a){return (a.title+' '+a.excerpt+' '+a.cat).toLowerCase().indexOf(ql)>-1;}).slice(0,8);if(hits.length===0){box.innerHTML='<div class="empty">Brak wyników dla „'+esc(q)+'"</div>';}else{box.innerHTML=hits.map(function(a){return '<a href="'+BASE+'/a/'+encodeURIComponent(a.slug)+'"><strong>'+esc(a.title)+'</strong>'+(a.excerpt?'<span>'+esc(a.excerpt)+'</span>':'')+'</a>';}).join('');}box.style.display='block';}
  if(inp){inp.addEventListener('input',function(){var q=inp.value.trim();if(!q){render('');return;}load(function(){render(q);});});document.addEventListener('click',function(e){if(!e.target.closest('.search'))box.style.display='none';});}
})();
</script>
</body>
</html>`;
}

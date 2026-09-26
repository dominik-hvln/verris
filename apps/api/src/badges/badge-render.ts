/**
 * Badge na stronę klienta — renderowanie (HTML ramek, loader, SVG).
 * Ramki nie ładują nic z zewnątrz (fonty systemowe, grafika inline), nie
 * ustawiają ciasteczek i nie widzą strony klienta (iframe z sandboxem).
 */
import type { DayUptime } from './badge-logic.js';

export type Motyw = 'ciemny' | 'jasny';

export const esc = (v: string) =>
  v.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' })[c] as string);

const pl = (n: number, digits = 2) => n.toFixed(digits).replace('.', ',');
const plDate = (d: Date) =>
  d.toLocaleDateString('pl-PL', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/Warsaw' });
const plDay = (ms: number) => new Date(ms).toLocaleDateString('pl-PL', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const plTime = (d: Date) => d.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw' });

const MARK = (s: number) =>
  `<svg viewBox="0 0 100 100" width="${s}" height="${s}" aria-hidden="true"><rect width="100" height="100" rx="22" fill="#0F7A52"/><path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#FFFFFF" fill-rule="evenodd"/></svg>`;

function palette(m: Motyw) {
  return m === 'jasny'
    ? { bg: '#FFFFFF', ink: '#0C1A14', muted: '#5B6A60', line: '#D5D8CF', accent: '#0F7A52', ok: '#1FA871' }
    : { bg: '#0C1A14', ink: '#F4F4EE', muted: '#9AA39C', line: 'rgba(255,255,255,.12)', accent: '#34E5A0', ok: '#34E5A0' };
}

const BASE_CSS = `*{box-sizing:border-box}html,body{margin:0;background:transparent}
body{font:14px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace}
a{text-decoration:none}button{font:inherit;cursor:pointer}
:focus-visible{outline:2px solid #34E5A0;outline-offset:2px}`;

/**
 * Wspólny skrypt ramki: zgłasza rozmiar rodzicowi (loader dopasowuje iframe)
 * i przełącza rozwijaną kartę. `cw/ch` = rozmiar zwiniętej pigułki, żeby
 * karta otwierała się NAD treścią strony, zamiast ją przesuwać.
 */
const FRAME_JS = `(function(){var r=document.getElementById('r');
function send(){var p=document.getElementById('pill');var b=r.getBoundingClientRect();var c=p?p.getBoundingClientRect():b;
parent.postMessage({v:'verris-badge',w:r.dataset.fluid?null:Math.ceil(b.width),h:Math.ceil(b.height),cw:Math.ceil(c.width),ch:Math.ceil(c.height)},'*');}
if(window.ResizeObserver)new ResizeObserver(send).observe(r);send();
var t=document.getElementById('pill');var k=document.getElementById('card');
if(t&&k)t.addEventListener('click',function(){var o=k.hidden;k.hidden=!o;t.setAttribute('aria-expanded',o?'true':'false');send();});
var x=document.getElementById('close');if(x&&k)x.addEventListener('click',function(){k.hidden=true;t.setAttribute('aria-expanded','false');t.focus();send();});
var tip=document.getElementById('tip');if(tip)r.addEventListener('mouseover',function(e){var d=e.target.closest('[data-t]');if(!d)return;
tip.textContent=d.dataset.t;tip.hidden=false;var bx=d.getBoundingClientRect(),rb=r.getBoundingClientRect();
tip.style.left=Math.max(0,Math.min(bx.left-rb.left-90,rb.width-200))+'px';});
if(tip)r.addEventListener('mouseleave',function(){tip.hidden=true;});})();`;

export function frameDoc(opts: { title: string; nonce: string; css: string; body: string }): string {
  return `<!doctype html><html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(opts.title)}</title><style>${BASE_CSS}${opts.css}</style></head><body>${opts.body}<script nonce="${opts.nonce}">${FRAME_JS}</script></body></html>`;
}

/** Pusta ramka (warunki niespełnione) — loader zwija iframe do zera. */
export function emptyFrame(nonce: string): string {
  return frameDoc({ title: 'Verris', nonce, css: '#r{width:0;height:0}', body: '<div id="r"></div>' });
}

const PILL_CSS = (p: ReturnType<typeof palette>) => `#r{display:inline-flex;flex-direction:column;align-items:flex-start;gap:10px;padding:2px;width:max-content}
#pill{white-space:nowrap}
#pill{display:inline-flex;align-items:center;gap:10px;height:44px;padding:0 14px 0 8px;border-radius:12px;border:1px solid ${p.line};background:${p.bg};color:${p.ink}}
.t{display:flex;flex-direction:column;align-items:flex-start;line-height:1.15}.t b{font-size:13px;font-weight:600}.t span{font-size:11px;color:${p.muted}}
#card{width:340px;border-radius:16px;padding:18px;background:${p.bg};color:${p.ink};border:1px solid ${p.line};box-shadow:0 18px 40px rgba(12,26,20,.28)}
#card[hidden]{display:none}.hd{display:flex;align-items:center;gap:12px}.hd div{flex:1;display:flex;flex-direction:column}
.hd b{font-size:17px;font-weight:800;letter-spacing:-.01em}.hd span{font-size:12px;color:${p.muted}}
#close{width:40px;height:40px;border:0;border-radius:10px;background:transparent;color:${p.muted}}
.row{display:flex;gap:12px;margin-top:14px}.row svg{flex-shrink:0}.row b{display:block;font-size:14px;font-weight:600}.row span{font-size:13px;color:${p.muted}}
.bars{display:flex;gap:2px;margin-top:6px}.bars i{width:7px;height:16px;border-radius:2px}
.ft{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid ${p.line}}
.ft a{font-size:13px;font-weight:600;color:${p.accent}}.wm{font-weight:800;letter-spacing:-.045em;color:${p.muted}}`;

const ICON = {
  check: (c: string) => `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="${c}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  lock: (c: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><rect x="4" y="9" width="12" height="8" rx="2" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M7 9V6.5a3 3 0 016 0V9" fill="none" stroke="${c}" stroke-width="1.6"/></svg>`,
  pulse: (c: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><path d="M2 11h3l2-5 3 9 2-6 2 2h4" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  globe: (c: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M3 10h14M10 3c2.5 2.5 2.5 11.5 0 14M10 3c-2.5 2.5-2.5 11.5 0 14" fill="none" stroke="${c}" stroke-width="1.4"/></svg>`,
  clock: (c: string) => `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="7" fill="none" stroke="${c}" stroke-width="1.6"/><path d="M10 6v4l3 2" fill="none" stroke="${c}" stroke-width="1.6" stroke-linecap="round"/></svg>`,
  x: `<svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
};

export function dayColor(pct: number | null, okColor: string): string {
  if (pct === null) return 'rgba(154,163,156,.35)';
  if (pct >= 99.9) return okColor;
  if (pct >= 99) return '#F5B94A';
  return '#F2705E';
}

export interface SealData {
  domain: string;
  sslUntil: Date;
  uptime30: number;
  days30: DayUptime[];
  lastCheckedAt: Date;
  verifyUrl: string;
}

export function renderSealFrame(d: SealData, motyw: Motyw, nonce: string): string {
  const p = palette(motyw);
  const summary = `SSL · ${pl(d.uptime30)}% · UE`;
  const bars = d.days30.map((x) => `<i style="background:${dayColor(x.pct, p.ok)}"></i>`).join('');
  const body = `<div id="r">
<section id="card" hidden aria-label="Weryfikacja strony ${esc(d.domain)}">
<div class="hd">${MARK(36)}<div><b>Strona zweryfikowana</b><span class="mono">${esc(d.domain)}</span></div><button id="close" type="button" aria-label="Zamknij">${ICON.x}</button></div>
<div class="row">${ICON.lock(p.accent)}<div><b>Połączenie szyfrowane</b><span>Certyfikat SSL ważny do ${plDate(d.sslUntil)}</span></div></div>
<div class="row">${ICON.pulse(p.accent)}<div><b>Dostępność ${pl(d.uptime30)}% · 30 dni</b><div class="bars">${bars}</div></div></div>
<div class="row">${ICON.globe(p.accent)}<div><b>Dane w Unii Europejskiej</b><span>Serwery w centrum danych w UE, zgodnie z RODO</span></div></div>
<div class="row">${ICON.clock(p.accent)}<div><b>Monitorowana całą dobę</b><span>Ostatnie sprawdzenie: ${plDate(d.lastCheckedAt)}, ${plTime(d.lastCheckedAt)}</span></div></div>
<div class="ft"><a href="${esc(d.verifyUrl)}" target="_blank" rel="noopener">Szczegóły weryfikacji →</a><span class="wm">verris</span></div>
</section>
<button id="pill" type="button" aria-expanded="false" aria-controls="card">${MARK(28)}<span class="t"><b>Strona zweryfikowana</b><span class="mono">${summary}</span></span>${ICON.check(p.accent)}</button>
</div>`;
  return frameDoc({ title: 'Pieczęć Verris', nonce, css: PILL_CSS(p), body });
}

export interface UptimeData {
  domain: string;
  up: boolean;
  responseMs: number | null;
  pct: number;
  days: DayUptime[];
}

function downLabel(s: number): string {
  if (s <= 0) return 'bez przerw';
  const m = Math.max(1, Math.round(s / 60));
  return m < 60 ? `przerwa ${m} min` : `przerwa ${Math.floor(m / 60)} h ${m % 60} min`;
}

export function renderUptimeFrame(d: UptimeData, motyw: Motyw, wariant: 'pelny' | 'mini', nonce: string): string {
  const p = palette(motyw);
  const n = d.days.length;
  if (wariant === 'mini') {
    const mini = d.days.slice(-14).map((x) => `<i style="background:${dayColor(x.pct, p.ok)}"></i>`).join('');
    const css = `#r{display:inline-flex;padding:2px;width:max-content;white-space:nowrap}.m{display:inline-flex;align-items:center;gap:8px;height:36px;padding:0 14px;border-radius:18px;background:${p.bg};color:${p.ink};border:1px solid ${p.line}}
.dot{width:8px;height:8px;border-radius:4px;background:${d.up ? p.ok : '#F2705E'}}.m span{font-size:12px}.m .s{color:${p.muted}}.mb{display:flex;gap:1px;margin-left:4px}.mb i{width:3px;height:14px;border-radius:1px}`;
    const body = `<div id="r"><div class="m" role="img" aria-label="Dostępność ${esc(d.domain)}: ${pl(d.pct)}% w ostatnich ${n} dniach"><span class="dot"></span><span class="mono">${pl(d.pct)}%</span><span class="s">dostępności · ${n} dni</span><span class="mb">${mini}</span></div></div>`;
    return frameDoc({ title: 'Dostępność strony', nonce, css, body });
  }
  const bars = d.days
    .map((x) => {
      const t = `${plDay(x.day)} · ${x.pct === null ? 'brak pomiaru' : `${pl(x.pct)}% · ${downLabel(x.downS)}`}`;
      return `<i data-t="${esc(t)}" style="background:${dayColor(x.pct, p.ok)}"></i>`;
    })
    .join('');
  const css = `#r{position:relative;padding:20px 22px;border-radius:16px;background:${p.bg};color:${p.ink};border:1px solid ${p.line}}
.top{display:flex;align-items:center;gap:12px;flex-wrap:wrap}.dot{width:10px;height:10px;border-radius:5px;background:${d.up ? p.ok : '#F2705E'};box-shadow:0 0 0 4px ${d.up ? 'rgba(52,229,160,.18)' : 'rgba(242,112,94,.2)'}}
.top b{font-size:15px;font-weight:600}.top .s{font-size:13px;color:${p.muted}}.sp{flex:1}.pct{font-size:22px;color:${p.accent}}
.bars{display:flex;gap:${n > 45 ? 2 : 3}px;height:36px;margin-top:40px}.bars i{flex:1;border-radius:3px;min-width:2px}.bars i:hover{outline:2px solid ${p.ink};outline-offset:1px}
#tip{position:absolute;top:58px;width:200px;padding:6px 10px;border-radius:8px;background:${motyw === 'jasny' ? '#0C1A14' : '#F4F4EE'};color:${motyw === 'jasny' ? '#F4F4EE' : '#0C1A14'};font-size:12px;pointer-events:none}#tip[hidden]{display:none}
.leg{display:flex;justify-content:space-between;margin-top:10px;font-size:12px;color:${p.muted}}.leg a{color:${p.muted}}`;
  const body = `<div id="r" data-fluid="1">
<div class="top"><span class="dot"></span><b>${esc(d.domain)} ${d.up ? 'działa' : 'ma przerwę'}</b>${d.responseMs !== null && d.up ? `<span class="s mono">odpowiedź ${d.responseMs} ms</span>` : ''}<span class="sp"></span><span class="pct mono">${pl(d.pct)}%</span><span class="s">ostatnie ${n} dni</span></div>
<div id="tip" hidden></div>
<div class="bars" role="img" aria-label="Dostępność ${esc(d.domain)} w ostatnich ${n} dniach: ${pl(d.pct)}%">${bars}</div>
<div class="leg"><span>${plDay(d.days[0].day)}</span><a href="https://verris.pl" target="_blank" rel="noopener">monitoring · <b>verris</b></a><span>dziś</span></div>
</div>`;
  return frameDoc({ title: 'Dostępność strony', nonce, css, body });
}

export function renderReferralFrame(d: { href: string; owner: string | null }, motyw: Motyw, nonce: string): string {
  const p = palette(motyw);
  const css = PILL_CSS(p).replace('#card{width:340px', '#card{width:300px') +
    `.cta{display:flex;align-items:center;justify-content:center;height:44px;margin-top:12px;border-radius:10px;background:${motyw === 'jasny' ? '#0C1A14' : '#F4F4EE'};color:${motyw === 'jasny' ? '#34E5A0' : '#0C1A14'};font-weight:600}
.lead{margin-top:12px;font-size:14px;line-height:1.45}.by{display:block;margin-top:8px;font-size:11px;color:${p.muted}}.wmk{font-size:15px;font-weight:800;letter-spacing:-.045em}.on{font-size:12px;color:${p.muted}}
#pill{height:36px;padding:0 12px 0 6px;border-radius:10px}`;
  const body = `<div id="r">
<section id="card" hidden aria-label="Verris — hosting">
<div class="hd">${MARK(28)}<div><b class="wmk" style="font-size:20px">verris</b></div><button id="close" type="button" aria-label="Zamknij">${ICON.x}</button></div>
<p class="lead" style="margin-bottom:0">Hosting w UE z darmowym SSL, monitoringiem strony i kopiami, które przywrócisz sam jednym kliknięciem.</p>
<a class="cta" href="${esc(d.href)}" target="_blank" rel="noopener">Zobacz ofertę →</a>
${d.owner ? `<span class="by">Link polecający od ${esc(d.owner)}</span>` : ''}
</section>
<button id="pill" type="button" aria-expanded="false" aria-controls="card">${MARK(24)}<span class="on">działa na</span><span class="wmk">verris</span></button>
</div>`;
  return frameDoc({ title: 'Działa na Verris', nonce, css, body });
}

export type EkoWariant = 'eko' | 'znak' | 'hostowane';

/** Statyczne SVG do `<img>` — działa w każdym kreatorze i w mailach. */
export function renderEkoSvg(input: { tier: string }, motyw: Motyw, wariant: EkoWariant): string {
  const dark = motyw !== 'jasny';
  const ink = dark ? '#F4F4EE' : '#0C1A14';
  const font = `font-family="-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif"`;
  const mark = (x: number, y: number, s: number) =>
    `<g transform="translate(${x} ${y}) scale(${s / 100})"><rect width="100" height="100" rx="22" fill="#0F7A52"/><path d="M26 30 L40 30 L50 52 L60 30 L74 30 L50 78 Z M44 55 L56 55 L50 69 Z" fill="#FFFFFF" fill-rule="evenodd"/></g>`;
  if (wariant === 'znak') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="28" viewBox="0 0 96 28" role="img" aria-label="Hosting Verris"><rect x=".5" y=".5" width="95" height="27" rx="8" fill="${dark ? '#0C1A14' : '#FFFFFF'}" stroke="${dark ? 'rgba(255,255,255,.14)' : '#D5D8CF'}"/>${mark(6, 5, 18)}<text x="30" y="19" ${font} font-size="14" font-weight="800" letter-spacing="-0.6" fill="${ink}">verris</text></svg>`;
  }
  if (wariant === 'hostowane') {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="150" height="20" viewBox="0 0 150 20" role="img" aria-label="Hostowane na Verris"><text x="0" y="14" ${font} font-size="12" fill="${dark ? '#9AA39C' : '#5B6A60'}">hostowane na</text><text x="84" y="14" ${font} font-size="13" font-weight="800" letter-spacing="-0.55" fill="${ink}">verris</text></svg>`;
  }
  const accent = dark ? '#34E5A0' : '#0F7A52';
  const tier = esc(input.tier);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="196" height="44" viewBox="0 0 196 44" role="img" aria-label="EKO hosting Verris, poziom ${tier}"><rect x=".5" y=".5" width="195" height="43" rx="12" fill="${dark ? '#08130E' : '#F1F7F3'}" stroke="${dark ? 'rgba(52,229,160,.28)' : '#BFE3D0'}"/>
<path d="M14 31c1-8 6-13 15-14-1 9-6 14-14 15M14 31l8-8" fill="none" stroke="${accent}" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
<text x="40" y="20" ${font} font-size="13" font-weight="600" fill="${ink}">EKO hosting</text><text x="40" y="34" font-family="ui-monospace,Menlo,monospace" font-size="11" fill="${accent}">poziom ${tier}</text>
<rect x="128" y="11" width="1" height="22" fill="${dark ? 'rgba(255,255,255,.12)' : '#D5D8CF'}"/><text x="140" y="27" ${font} font-size="15" font-weight="800" letter-spacing="-0.65" fill="${ink}">verris</text></svg>`;
}

/**
 * Loader osadzany na stronie klienta. Robi tylko jedno: wstawia iframe z
 * sandboxem i dopasowuje jego rozmiar do komunikatów z TEJ ramki (sprawdzamy
 * `event.source`, bo ramka bez allow-same-origin ma origin "null").
 */
export function renderLoader(apiBase: string): string {
  const base = JSON.stringify(apiBase);
  return `/* Verris badge v1 — https://verris.pl */
(function(){var B=${base};var K={pieczec:1,dostepnosc:1,polecenie:1};
function mount(el){if(el.getAttribute('data-verris-ready'))return;var k=el.getAttribute('data-verris-badge'),id=el.getAttribute('data-id');
if(!K[k]||!id||!/^[A-Za-z0-9_-]{1,64}$/.test(id))return;el.setAttribute('data-verris-ready','1');
var q=[];['motyw','wariant','dni'].forEach(function(a){var v=el.getAttribute('data-'+a);if(v&&/^[a-z0-9]{1,12}$/.test(v))q.push(a+'='+v);});
var f=document.createElement('iframe');f.src=B+'/public/badges/ramka/'+k+'/'+id+(q.length?'?'+q.join('&'):'');
f.title=k==='pieczec'?'Pieczęć weryfikacji Verris':k==='dostepnosc'?'Dostępność strony':'Działa na Verris';
f.setAttribute('sandbox','allow-scripts allow-popups allow-popups-to-escape-sandbox');f.setAttribute('referrerpolicy','origin');f.setAttribute('loading','lazy');
f.style.cssText='border:0;position:absolute;left:0;bottom:0;width:0;height:0;overflow:hidden;background:transparent;color-scheme:normal;z-index:2147483000';
el.style.position='relative';el.style.display=k==='dostepnosc'&&el.getAttribute('data-wariant')!=='mini'?'block':'inline-block';el.style.width='0';el.style.height='0';el.appendChild(f);
window.addEventListener('message',function(e){if(e.source!==f.contentWindow||!e.data||e.data.v!=='verris-badge')return;var d=e.data;
var n=function(x){return typeof x==='number'&&x>=0&&x<4000?x:0};
if(d.w===null){el.style.width='100%';f.style.width='100%';}else{f.style.width=n(d.w)+'px';el.style.width=n(d.cw)+'px';}
f.style.height=n(d.h)+'px';el.style.height=n(d.ch)+'px';});}
function scan(){var l=document.querySelectorAll('[data-verris-badge]');for(var i=0;i<l.length;i++)mount(l[i]);}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',scan);else scan();})();`;
}

export function renderVerifyPage(d: { domain: string; seal: SealData | null }, nonce: string): string {
  const p = palette('jasny');
  const s = d.seal;
  const rows = s
    ? `<li>${ICON.lock(p.accent)}<div><b>Połączenie szyfrowane</b><span>Certyfikat SSL ważny do ${plDate(s.sslUntil)}</span></div></li>
<li>${ICON.pulse(p.accent)}<div><b>Dostępność ${pl(s.uptime30)}% w ostatnich 30 dniach</b><span>Pomiar z monitoringu Verris, przerwy liczone co do minuty</span></div></li>
<li>${ICON.globe(p.accent)}<div><b>Dane w Unii Europejskiej</b><span>Serwery w centrum danych w UE, zgodnie z RODO</span></div></li>
<li>${ICON.clock(p.accent)}<div><b>Ostatnie sprawdzenie</b><span>${plDate(s.lastCheckedAt)}, ${plTime(s.lastCheckedAt)}</span></div></li>`
    : '';
  const css = `body{background:#F4F4EE;color:#0C1A14}main{max-width:560px;margin:48px auto;padding:0 16px}
.c{background:#fff;border:1px solid #D5D8CF;border-radius:20px;padding:28px}.hd{display:flex;gap:14px;align-items:center}
h1{margin:0;font-size:24px;letter-spacing:-.02em}.d{font-size:14px;color:#5B6A60}ul{list-style:none;margin:24px 0 0;padding:0;display:flex;flex-direction:column;gap:16px}
li{display:flex;gap:12px}li b{display:block;font-size:15px}li span{font-size:14px;color:#5B6A60}.off{margin-top:20px;font-size:15px;color:#3A4A40}
.ft{margin-top:24px;font-size:13px;color:#5B6A60}.ft a{color:#0F7A52;font-weight:600}`;
  const body = `<main><div class="c" id="r"><div class="hd">${MARK(48)}<div><h1>${s ? 'Strona zweryfikowana' : 'Pieczęć nieaktywna'}</h1><div class="d mono">${esc(d.domain)}</div></div></div>
${s ? `<ul>${rows}</ul>` : '<p class="off">Ta strona nie spełnia teraz warunków pieczęci Verris. Jeśli widzisz pieczęć na tej stronie, nie jest ona aktualna.</p>'}
<p class="ft">Weryfikację prowadzi <a href="https://verris.pl" target="_blank" rel="noopener">Verris</a> — hosting, na którym działa ta strona. Dane odświeżają się automatycznie.</p></div></main>`;
  return frameDoc({ title: `Weryfikacja ${d.domain} — Verris`, nonce, css, body });
}

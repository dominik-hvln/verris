'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  ChevronUp,
  ChevronDown,
  Save,
  Rocket,
  Download,
  Loader2,
  Check,
  AlertTriangle,
  Monitor,
  Smartphone,
  LayoutTemplate,
  GripVertical,
} from 'lucide-react';
import { fmWrite, fmRead } from '@/app/dashboard/file-manager/data';

/* ============================ MODEL ============================ */
type SectionType =
  | 'navbar'
  | 'hero'
  | 'stats'
  | 'features'
  | 'gallery'
  | 'pricing'
  | 'testimonials'
  | 'team'
  | 'faq'
  | 'logos'
  | 'about'
  | 'cta'
  | 'newsletter'
  | 'contact'
  | 'footer';

type Section = { id: string; type: SectionType; data: Record<string, unknown> };
type Theme = {
  primary: string;
  accent: string;
  bg: 'light' | 'dark';
  font: 'sans' | 'serif';
  radius: 'sm' | 'md' | 'xl';
  width: 'normal' | 'wide';
};
type Meta = { title: string; description: string };
type PageModel = { meta: Meta; theme: Theme; sections: Section[] };

const uid = () => Math.random().toString(36).slice(2, 9);

const SECTION_LABEL: Record<SectionType, string> = {
  navbar: 'Nawigacja',
  hero: 'Hero (nagłówek)',
  stats: 'Statystyki / liczby',
  features: 'Cechy / usługi',
  gallery: 'Galeria',
  pricing: 'Cennik',
  testimonials: 'Opinie klientów',
  team: 'Zespół',
  faq: 'FAQ',
  logos: 'Logo / partnerzy',
  about: 'O nas',
  cta: 'Wezwanie do działania',
  newsletter: 'Newsletter',
  contact: 'Kontakt',
  footer: 'Stopka',
};

function defaultSection(type: SectionType): Section {
  const y = new Date().getFullYear();
  const base: Record<SectionType, Record<string, unknown>> = {
    navbar: { brand: 'Twoja Firma', links: ['Start', 'Oferta', 'Cennik', 'Kontakt'], ctaText: 'Napisz do nas', sticky: true },
    hero: {
      eyebrow: 'Witaj',
      title: 'Twoja nowa strona internetowa',
      subtitle: 'Profesjonalna obecność w sieci w kilka minut — bez kodowania.',
      ctaText: 'Zaczynamy',
      ctaHref: '#kontakt',
      ctaSecondary: 'Dowiedz się więcej',
      bgImage: '',
      align: 'left',
    },
    stats: {
      items: [
        { value: '500+', label: 'Zadowolonych klientów' },
        { value: '99,9%', label: 'Dostępności' },
        { value: '24/7', label: 'Wsparcia' },
        { value: '10 lat', label: 'Doświadczenia' },
      ],
    },
    features: {
      title: 'Co oferujemy',
      subtitle: 'Wszystko, czego potrzebujesz w jednym miejscu.',
      items: [
        { icon: '⚡', title: 'Szybkość', desc: 'Błyskawiczne ładowanie na hostingu LiteSpeed.' },
        { icon: '🔒', title: 'Bezpieczeństwo', desc: 'SSL, backupy i WAF w standardzie.' },
        { icon: '💬', title: 'Wsparcie', desc: 'Jesteśmy z Tobą na każdym kroku.' },
      ],
    },
    gallery: {
      title: 'Galeria',
      images: [
        { url: 'https://picsum.photos/seed/a/600/400', caption: 'Realizacja 1' },
        { url: 'https://picsum.photos/seed/b/600/400', caption: 'Realizacja 2' },
        { url: 'https://picsum.photos/seed/c/600/400', caption: 'Realizacja 3' },
      ],
    },
    pricing: {
      title: 'Cennik',
      subtitle: 'Wybierz plan dopasowany do Ciebie.',
      plans: [
        { name: 'Start', price: '29', period: '/mies.', features: 'Strona WWW\n1 skrzynka e-mail\nCertyfikat SSL', ctaText: 'Wybieram', featured: false },
        { name: 'Pro', price: '59', period: '/mies.', features: 'Wszystko ze Start\nSklep online\nPriorytetowe wsparcie', ctaText: 'Wybieram', featured: true },
        { name: 'Biznes', price: '99', period: '/mies.', features: 'Wszystko z Pro\nDedykowane zasoby\nOpiekun konta', ctaText: 'Wybieram', featured: false },
      ],
    },
    testimonials: {
      title: 'Co mówią klienci',
      items: [
        { quote: 'Najlepsza decyzja dla mojego biznesu. Wszystko działa szybko i bez problemów.', author: 'Anna Kowalska', role: 'Właścicielka sklepu' },
        { quote: 'Profesjonalne wsparcie i świetny panel. Polecam każdemu.', author: 'Marek Nowak', role: 'Freelancer' },
      ],
    },
    team: {
      title: 'Nasz zespół',
      items: [
        { name: 'Jan Kowalski', role: 'Założyciel', photo: 'https://i.pravatar.cc/200?img=12' },
        { name: 'Ewa Wiśniewska', role: 'Projektantka', photo: 'https://i.pravatar.cc/200?img=5' },
      ],
    },
    faq: {
      title: 'Najczęstsze pytania',
      items: [
        { q: 'Jak długo trwa uruchomienie?', a: 'Twoja strona działa od razu po opublikowaniu.' },
        { q: 'Czy mogę zmienić plan?', a: 'Tak, w dowolnym momencie z poziomu panelu.' },
      ],
    },
    logos: { title: 'Zaufali nam', items: ['ACME', 'Globex', 'Initech', 'Umbrella', 'Soylent'] },
    about: {
      title: 'O nas',
      body: 'Krótko o Twojej firmie — czym się zajmujesz i dlaczego warto Ci zaufać. Edytuj ten tekst, aby opowiedzieć swoją historię.',
      image: 'https://picsum.photos/seed/about/700/500',
    },
    cta: { title: 'Gotowy, by zacząć?', subtitle: 'Skontaktuj się z nami już dziś.', buttonText: 'Skontaktuj się', buttonHref: '#kontakt' },
    newsletter: { title: 'Bądź na bieżąco', subtitle: 'Zapisz się i odbieraj nowości oraz porady.', buttonText: 'Zapisz się', placeholder: 'Twój e-mail' },
    contact: { title: 'Kontakt', email: 'kontakt@twojadomena.pl', phone: '+48 000 000 000', address: 'ul. Przykładowa 1, Warszawa', showForm: true },
    footer: { brand: 'Twoja Firma', note: `© ${y} Wszelkie prawa zastrzeżone.`, links: ['Polityka prywatności', 'Regulamin'] },
  };
  return { id: uid(), type, data: base[type] };
}

const TPL = (types: SectionType[]) => types.map((t) => defaultSection(t));
const TEMPLATES: Record<string, () => PageModel> = {
  landing: () => ({
    meta: { title: 'Twoja Firma — strona', description: 'Profesjonalna strona Twojej firmy.' },
    theme: { primary: '#34e5a0', accent: '#5b8cff', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'logos', 'features', 'stats', 'pricing', 'testimonials', 'cta', 'contact', 'footer']),
  }),
  agencja: () => ({
    meta: { title: 'Agencja — portfolio', description: 'Tworzymy marki, które zapadają w pamięć.' },
    theme: { primary: '#a855f7', accent: '#ec4899', bg: 'dark', font: 'serif', radius: 'md', width: 'wide' },
    sections: TPL(['navbar', 'hero', 'stats', 'gallery', 'features', 'team', 'testimonials', 'cta', 'footer']),
  }),
  sklep: () => ({
    meta: { title: 'Sklep online', description: 'Zakupy online bez wychodzenia z domu.' },
    theme: { primary: '#f59e0b', accent: '#10b981', bg: 'light', font: 'sans', radius: 'md', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'features', 'gallery', 'pricing', 'testimonials', 'faq', 'newsletter', 'footer']),
  }),
  wizytowka: () => ({
    meta: { title: 'Wizytówka firmy', description: 'Poznaj naszą ofertę i dane kontaktowe.' },
    theme: { primary: '#2563eb', accent: '#0ea5e9', bg: 'light', font: 'sans', radius: 'md', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'about', 'features', 'contact', 'footer']),
  }),
  freelancer: () => ({
    meta: { title: 'Portfolio', description: 'Cześć! Oto moje projekty.' },
    theme: { primary: '#14b8a6', accent: '#f43f5e', bg: 'dark', font: 'sans', radius: 'xl', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'about', 'gallery', 'stats', 'faq', 'cta', 'footer']),
  }),
  restauracja: () => ({
    meta: { title: 'Restauracja — menu i rezerwacje', description: 'Świeże składniki, wyjątkowe smaki.' },
    theme: { primary: '#d97706', accent: '#b91c1c', bg: 'dark', font: 'serif', radius: 'md', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'about', 'gallery', 'pricing', 'testimonials', 'contact', 'footer']),
  }),
  fitness: () => ({
    meta: { title: 'Klub fitness', description: 'Trenuj z najlepszymi. Dołącz już dziś.' },
    theme: { primary: '#22c55e', accent: '#eab308', bg: 'dark', font: 'sans', radius: 'md', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'stats', 'features', 'pricing', 'testimonials', 'cta', 'footer']),
  }),
  kancelaria: () => ({
    meta: { title: 'Kancelaria', description: 'Profesjonalne doradztwo prawne.' },
    theme: { primary: '#1e3a8a', accent: '#0ea5e9', bg: 'light', font: 'serif', radius: 'sm', width: 'normal' },
    sections: TPL(['navbar', 'hero', 'about', 'features', 'team', 'faq', 'contact', 'footer']),
  }),
  fotograf: () => ({
    meta: { title: 'Fotografia', description: 'Uchwycę Twoje najważniejsze chwile.' },
    theme: { primary: '#e5e7eb', accent: '#f59e0b', bg: 'dark', font: 'sans', radius: 'sm', width: 'wide' },
    sections: TPL(['navbar', 'hero', 'gallery', 'about', 'testimonials', 'contact', 'footer']),
  }),
};

const COLOR_PRESETS: { label: string; primary: string; accent: string }[] = [
  { label: 'Mint', primary: '#34e5a0', accent: '#5b8cff' },
  { label: 'Ocean', primary: '#2563eb', accent: '#0ea5e9' },
  { label: 'Sunset', primary: '#f59e0b', accent: '#ef4444' },
  { label: 'Violet', primary: '#a855f7', accent: '#ec4899' },
  { label: 'Forest', primary: '#16a34a', accent: '#84cc16' },
  { label: 'Slate', primary: '#64748b', accent: '#22d3ee' },
];

/* ============================ HTML GENERATOR ============================ */
const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function genHtml(m: PageModel): string {
  const t = m.theme;
  const dark = t.bg === 'dark';
  const font = t.font === 'serif' ? 'Georgia, "Times New Roman", serif' : 'system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif';
  const bg = dark ? '#0b0b0e' : '#ffffff';
  const bg2 = dark ? '#121217' : '#f6f7f9';
  const fg = dark ? '#f5f5f7' : '#16161a';
  const mut = dark ? '#a6a6b0' : '#5b5b66';
  const card = dark ? '#16161c' : '#ffffff';
  const line = dark ? '#26262e' : '#e6e6ec';
  const rad = t.radius === 'sm' ? '8px' : t.radius === 'md' ? '14px' : '22px';
  const maxw = t.width === 'wide' ? '1240px' : '1080px';
  const ctx = { p: t.primary, a: t.accent, fg, mut, card, line, bg2, dark, rad };
  const body = m.sections.map((s) => renderSection(s, ctx)).join('\n');
  return `<!DOCTYPE html>
<html lang="pl"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(m.meta.title)}</title>
<meta name="description" content="${esc(m.meta.description)}"/>
<meta property="og:title" content="${esc(m.meta.title)}"/>
<meta property="og:description" content="${esc(m.meta.description)}"/>
<meta property="og:type" content="website"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth}
body{font-family:${font};background:${bg};color:${fg};line-height:1.6}
img{max-width:100%;display:block}
.wrap{max-width:${maxw};margin:0 auto;padding:0 24px}
a{color:inherit;text-decoration:none}
.btn{display:inline-flex;align-items:center;gap:8px;background:${t.primary};color:${dark ? '#04100b' : '#0a0a0a'};font-weight:700;padding:13px 26px;border-radius:${rad};transition:transform .15s,opacity .2s;border:none;cursor:pointer}
.btn:hover{transform:translateY(-1px);opacity:.92}
.btn.ghost{background:transparent;color:${fg};border:1px solid ${line}}
section{padding:80px 0}
.sec-tint{background:${bg2}}
h1{font-size:clamp(34px,6vw,60px);line-height:1.04;font-weight:800;letter-spacing:-.02em}
h2{font-size:clamp(26px,3.6vw,38px);font-weight:800}
h3{font-size:20px;font-weight:700}
.center{text-align:center}
.lead{color:${mut};font-size:clamp(16px,2vw,20px);margin-top:16px;max-width:62ch}
.sub{color:${mut};margin-top:8px;max-width:60ch}
.muted{color:${mut}}
.head{max-width:680px;margin:0 auto 44px;text-align:center}
.grid{display:grid;gap:22px}
.g2{grid-template-columns:repeat(2,1fr)}.g3{grid-template-columns:repeat(3,1fr)}.g4{grid-template-columns:repeat(4,1fr)}
.card{background:${card};border:1px solid ${line};border-radius:${rad};padding:26px}
.shadow{box-shadow:0 10px 40px rgba(0,0,0,${dark ? '.35' : '.06'})}
.nav{display:flex;align-items:center;justify-content:space-between;padding:18px 0}
.nav.sticky{position:sticky;top:0;z-index:50;background:${bg}cc;backdrop-filter:blur(10px);border-bottom:1px solid ${line}}
.nav .links{display:flex;gap:26px}
.eyebrow{display:inline-block;color:${t.primary};font-weight:700;letter-spacing:.12em;text-transform:uppercase;font-size:13px;margin-bottom:14px}
.hero-actions{display:flex;gap:14px;margin-top:34px;flex-wrap:wrap}
.hero-bg{background-size:cover;background-position:center;border-radius:${rad};padding:96px 40px;position:relative}
.hero-bg::before{content:"";position:absolute;inset:0;background:rgba(0,0,0,.5);border-radius:${rad}}
.hero-bg>*{position:relative;color:#fff}
.stat .v{font-size:clamp(28px,4vw,44px);font-weight:800;color:${t.primary}}
.stat .l{color:${mut};margin-top:6px;font-size:14px}
.icon{font-size:28px;margin-bottom:14px}
.gal img{border-radius:${rad};aspect-ratio:3/2;object-fit:cover;width:100%}
.price{position:relative;text-align:center}
.price.feat{border-color:${t.primary};box-shadow:0 0 0 2px ${t.primary} inset}
.price .amt{font-size:40px;font-weight:800;margin:12px 0}
.price ul{list-style:none;margin:18px 0;text-align:left}
.price li{padding:7px 0;border-bottom:1px solid ${line};color:${mut}}
.badge{position:absolute;top:-12px;left:50%;transform:translateX(-50%);background:${t.primary};color:#04100b;font-size:12px;font-weight:700;padding:4px 12px;border-radius:999px}
.quote{font-size:18px;font-style:italic}
.avatar{width:56px;height:56px;border-radius:50%;object-fit:cover}
.author{display:flex;align-items:center;gap:12px;margin-top:18px}
.logos{display:flex;flex-wrap:wrap;gap:36px;justify-content:center;align-items:center;opacity:.7}
.logos span{font-weight:800;font-size:20px;letter-spacing:.04em}
.faq details{border:1px solid ${line};border-radius:${rad};padding:16px 20px;margin-bottom:12px;background:${card}}
.faq summary{cursor:pointer;font-weight:700;list-style:none}
.faq summary::-webkit-details-marker{display:none}
.faq p{color:${mut};margin-top:10px}
.split{display:grid;grid-template-columns:1fr 1fr;gap:40px;align-items:center}
.field{width:100%;padding:13px 16px;border:1px solid ${line};border-radius:${rad};background:${card};color:${fg};margin-bottom:12px;font:inherit}
.footer{border-top:1px solid ${line};padding:36px 0;color:${mut};display:flex;justify-content:space-between;flex-wrap:wrap;gap:14px}
.footer .fl{display:flex;gap:20px;flex-wrap:wrap}
@media(max-width:820px){.g2,.g3,.g4,.split{grid-template-columns:1fr}.nav .links{display:none}}
</style></head>
<body>
${body}
</body></html>`;
}

type Ctx = { p: string; a: string; fg: string; mut: string; card: string; line: string; bg2: string; dark: boolean; rad: string };
function sec(inner: string, tint = false, id = '') {
  return `<section class="${tint ? 'sec-tint' : ''}"${id ? ` id="${id}"` : ''}><div class="wrap">${inner}</div></section>`;
}
function head(title: unknown, sub?: unknown) {
  return `<div class="head"><h2>${esc(title)}</h2>${sub ? `<p class="sub" style="margin:8px auto 0">${esc(sub)}</p>` : ''}</div>`;
}

function renderSection(s: Section, c: Ctx): string {
  const d = s.data;
  switch (s.type) {
    case 'navbar': {
      const links = (d.links as string[]) ?? [];
      return `<div class="wrap"><nav class="nav ${d.sticky ? 'sticky' : ''}"><strong style="font-size:18px">${esc(
        d.brand,
      )}</strong><div class="links">${links.map((l) => `<a href="#">${esc(l)}</a>`).join('')}</div><a class="btn" href="#kontakt">${esc(
        d.ctaText,
      )}</a></nav></div>`;
    }
    case 'hero': {
      const align = (d.align as string) === 'center' ? 'center' : '';
      const inner = `${d.eyebrow ? `<span class="eyebrow">${esc(d.eyebrow)}</span>` : ''}<h1>${esc(d.title)}</h1><p class="lead" ${
        align ? 'style="margin-left:auto;margin-right:auto"' : ''
      }>${esc(d.subtitle)}</p><div class="hero-actions" ${align ? 'style="justify-content:center"' : ''}><a class="btn" href="${esc(
        d.ctaHref || '#',
      )}">${esc(d.ctaText)}</a>${d.ctaSecondary ? `<a class="btn ghost" href="#">${esc(d.ctaSecondary)}</a>` : ''}</div>`;
      if (d.bgImage) {
        return `<section><div class="wrap"><div class="hero-bg ${align}" style="background-image:url('${esc(d.bgImage)}')">${inner}</div></div></section>`;
      }
      return `<section><div class="wrap ${align}">${inner}</div></section>`;
    }
    case 'stats': {
      const items = (d.items as { value: string; label: string }[]) ?? [];
      return sec(`<div class="grid g4">${items.map((i) => `<div class="stat center"><div class="v">${esc(i.value)}</div><div class="l">${esc(i.label)}</div></div>`).join('')}</div>`, true);
    }
    case 'features': {
      const items = (d.items as { icon?: string; title: string; desc: string }[]) ?? [];
      return sec(`${head(d.title, d.subtitle)}<div class="grid g3">${items
        .map((it) => `<div class="card"><div class="icon">${esc(it.icon || '◆')}</div><h3>${esc(it.title)}</h3><p class="muted" style="margin-top:8px">${esc(it.desc)}</p></div>`)
        .join('')}</div>`);
    }
    case 'gallery': {
      const imgs = (d.images as { url: string; caption?: string }[]) ?? [];
      return sec(`${head(d.title)}<div class="grid g3 gal">${imgs.map((g) => `<figure><img src="${esc(g.url)}" alt="${esc(g.caption)}"/>${g.caption ? `<figcaption class="muted" style="margin-top:8px;font-size:14px">${esc(g.caption)}</figcaption>` : ''}</figure>`).join('')}</div>`);
    }
    case 'pricing': {
      const plans = (d.plans as { name: string; price: string; period: string; features: string; ctaText: string; featured?: boolean }[]) ?? [];
      return sec(`${head(d.title, d.subtitle)}<div class="grid g3">${plans
        .map((p) => {
          const feats = String(p.features || '').split('\n').filter(Boolean);
          return `<div class="card price ${p.featured ? 'feat shadow' : ''}">${p.featured ? '<span class="badge">Polecany</span>' : ''}<h3>${esc(
            p.name,
          )}</h3><div class="amt">${esc(p.price)} zł<span style="font-size:14px;color:${c.mut};font-weight:400">${esc(p.period)}</span></div><ul>${feats
            .map((f) => `<li>${esc(f)}</li>`)
            .join('')}</ul><a class="btn" href="#kontakt" style="width:100%;justify-content:center">${esc(p.ctaText)}</a></div>`;
        })
        .join('')}</div>`, true);
    }
    case 'testimonials': {
      const items = (d.items as { quote: string; author: string; role: string }[]) ?? [];
      return sec(`${head(d.title)}<div class="grid g2">${items
        .map((t) => `<div class="card"><p class="quote">“${esc(t.quote)}”</p><div class="author"><div><strong>${esc(t.author)}</strong><div class="muted" style="font-size:14px">${esc(t.role)}</div></div></div></div>`)
        .join('')}</div>`);
    }
    case 'team': {
      const items = (d.items as { name: string; role: string; photo?: string }[]) ?? [];
      return sec(`${head(d.title)}<div class="grid g4">${items
        .map((m) => `<div class="card center">${m.photo ? `<img class="avatar" src="${esc(m.photo)}" alt="${esc(m.name)}" style="margin:0 auto 12px;width:80px;height:80px"/>` : ''}<strong>${esc(m.name)}</strong><div class="muted" style="font-size:14px">${esc(m.role)}</div></div>`)
        .join('')}</div>`, true);
    }
    case 'faq': {
      const items = (d.items as { q: string; a: string }[]) ?? [];
      return sec(`${head(d.title)}<div class="faq" style="max-width:760px;margin:0 auto">${items.map((f) => `<details><summary>${esc(f.q)}</summary><p>${esc(f.a)}</p></details>`).join('')}</div>`);
    }
    case 'logos': {
      const items = (d.items as string[]) ?? [];
      return sec(`${d.title ? `<p class="center muted" style="margin-bottom:24px">${esc(d.title)}</p>` : ''}<div class="logos">${items.map((l) => `<span>${esc(l)}</span>`).join('')}</div>`);
    }
    case 'about':
      return sec(`<div class="split"><div><h2>${esc(d.title)}</h2><p class="lead" style="max-width:none">${esc(d.body)}</p></div>${d.image ? `<img class="shadow" style="border-radius:${c.rad}" src="${esc(d.image)}" alt="${esc(d.title)}"/>` : ''}</div>`);
    case 'cta':
      return sec(`<div class="card center shadow" style="padding:56px"><h2>${esc(d.title)}</h2><p class="muted" style="margin:12px auto 26px">${esc(d.subtitle)}</p><a class="btn" href="${esc(d.buttonHref || '#')}">${esc(d.buttonText)}</a></div>`);
    case 'newsletter':
      return sec(`<div class="card center" style="padding:48px"><h2>${esc(d.title)}</h2><p class="muted" style="margin:10px auto 22px">${esc(d.subtitle)}</p><form onsubmit="return false" style="display:flex;gap:10px;max-width:440px;margin:0 auto"><input class="field" style="margin:0" type="email" placeholder="${esc(d.placeholder)}"/><button class="btn" type="submit">${esc(d.buttonText)}</button></form></div>`, true);
    case 'contact':
      return sec(`${head(d.title)}<div class="split"><div class="grid" style="gap:14px"><div class="card"><h3>E-mail</h3><p class="muted">${esc(d.email)}</p></div><div class="card"><h3>Telefon</h3><p class="muted">${esc(d.phone)}</p></div><div class="card"><h3>Adres</h3><p class="muted">${esc(d.address)}</p></div></div>${
        d.showForm
          ? `<form onsubmit="return false"><input class="field" placeholder="Imię i nazwisko"/><input class="field" type="email" placeholder="E-mail"/><textarea class="field" style="min-height:120px" placeholder="Wiadomość"></textarea><button class="btn" type="submit">Wyślij</button></form>`
          : ''
      }</div>`, false, 'kontakt');
    case 'footer': {
      const links = (d.links as string[]) ?? [];
      return `<div class="wrap"><div class="footer"><strong>${esc(d.brand)}</strong><div class="fl">${links.map((l) => `<a href="#">${esc(l)}</a>`).join('')}</div><span>${esc(d.note)}</span></div></div>`;
    }
    default:
      return '';
  }
}

/* ============================ EDITOR ============================ */
const DRAFT_DIR = '';
const DRAFT_FILE = '.verris-site.json';
const PUBLISH_DEFAULT = 'public_html';

export default function SiteBuilderTab({ serviceId }: { serviceId: string }) {
  const [model, setModel] = useState<PageModel>(() => TEMPLATES.landing());
  const [selected, setSelected] = useState<string | null>(null);
  const [device, setDevice] = useState<'desktop' | 'mobile'>('desktop');
  const [publishDir, setPublishDir] = useState(PUBLISH_DEFAULT);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ t: 'ok' | 'err'; m: string } | null>(null);
  const loadedRef = useRef(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  const html = useMemo(() => genHtml(model), [model]);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    (async () => {
      try {
        const res = (await fmRead(serviceId, DRAFT_FILE)) as { content?: string } | string;
        const content = typeof res === 'string' ? res : res?.content;
        if (content) {
          const parsed = JSON.parse(content) as PageModel;
          if (parsed?.sections?.length) setModel({ meta: parsed.meta ?? { title: '', description: '' }, theme: parsed.theme, sections: parsed.sections });
        }
      } catch {
        /* brak szkicu */
      }
    })();
  }, [serviceId]);

  const update = useCallback((id: string, patch: Record<string, unknown>) => {
    setModel((m) => ({ ...m, sections: m.sections.map((s) => (s.id === id ? { ...s, data: { ...s.data, ...patch } } : s)) }));
  }, []);
  const setTheme = (patch: Partial<Theme>) => setModel((m) => ({ ...m, theme: { ...m.theme, ...patch } }));
  const setMeta = (patch: Partial<Meta>) => setModel((m) => ({ ...m, meta: { ...m.meta, ...patch } }));

  function move(id: string, dir: -1 | 1) {
    setModel((m) => {
      const i = m.sections.findIndex((s) => s.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= m.sections.length) return m;
      const next = [...m.sections];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...m, sections: next };
    });
  }
  function reorder(fromId: string, toId: string) {
    if (fromId === toId) return;
    setModel((m) => {
      const from = m.sections.findIndex((s) => s.id === fromId);
      const to = m.sections.findIndex((s) => s.id === toId);
      if (from < 0 || to < 0) return m;
      const next = [...m.sections];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { ...m, sections: next };
    });
  }
  const remove = (id: string) => { setModel((m) => ({ ...m, sections: m.sections.filter((s) => s.id !== id) })); setSelected(null); };
  const add = (type: SectionType) => { const sx = defaultSection(type); setModel((m) => ({ ...m, sections: [...m.sections, sx] })); setSelected(sx.id); };

  async function saveDraft() {
    setBusy('save'); setMsg(null);
    try { await fmWrite(serviceId, DRAFT_DIR, DRAFT_FILE, JSON.stringify(model)); setMsg({ t: 'ok', m: 'Szkic zapisany na koncie.' }); }
    catch (e) { setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Nie udało się zapisać szkicu.' }); }
    finally { setBusy(null); }
  }
  async function publish() {
    setBusy('publish'); setMsg(null);
    try { await fmWrite(serviceId, publishDir.trim() || PUBLISH_DEFAULT, 'index.html', genHtml(model)); setMsg({ t: 'ok', m: `Opublikowano index.html w „${publishDir.trim() || PUBLISH_DEFAULT}". Strona jest na żywo.` }); }
    catch (e) { setMsg({ t: 'err', m: e instanceof Error ? e.message : 'Nie udało się opublikować.' }); }
    finally { setBusy(null); }
  }
  function downloadHtml() {
    const blob = new Blob([genHtml(model)], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'index.html'; a.click(); URL.revokeObjectURL(url);
  }

  const sel = model.sections.find((s) => s.id === selected) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5">
          <LayoutTemplate className="h-4 w-4 text-neutral-400" />
          <select onChange={(e) => { if (e.target.value && TEMPLATES[e.target.value]) { setModel(TEMPLATES[e.target.value]()); setSelected(null); } }} defaultValue="" className="rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white">
            <option value="">Szablon startowy…</option>
            <option value="landing">Landing page</option>
            <option value="agencja">Agencja / portfolio</option>
            <option value="sklep">Sklep online</option>
            <option value="wizytowka">Wizytówka firmy</option>
            <option value="freelancer">Freelancer</option>
            <option value="restauracja">Restauracja</option>
            <option value="fitness">Klub fitness</option>
            <option value="kancelaria">Kancelaria</option>
            <option value="fotograf">Fotograf</option>
          </select>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-white/10 bg-black/40 p-0.5">
            <button onClick={() => setDevice('desktop')} className={`rounded-md px-2 py-1 ${device === 'desktop' ? 'bg-white/10' : ''}`} aria-label="Desktop"><Monitor className="h-4 w-4" /></button>
            <button onClick={() => setDevice('mobile')} className={`rounded-md px-2 py-1 ${device === 'mobile' ? 'bg-white/10' : ''}`} aria-label="Mobile"><Smartphone className="h-4 w-4" /></button>
          </div>
          <button onClick={downloadHtml} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:text-white"><Download className="h-4 w-4" /> HTML</button>
          <button onClick={saveDraft} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-sm text-neutral-200 hover:text-white disabled:opacity-40">{busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Szkic</button>
          <button onClick={publish} disabled={busy !== null} className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-40">{busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />} Publikuj</button>
        </div>
      </div>

      {msg && (
        <p className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ${msg.t === 'ok' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : 'border-rose-500/30 bg-rose-500/10 text-rose-200'}`}>
          {msg.t === 'ok' ? <Check className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />} {msg.m}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_1fr_310px]">
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">Sekcje</p>
          <p className="text-[10px] text-neutral-600">Przeciągnij uchwyt, aby zmienić kolejność.</p>
          {model.sections.map((s) => (
            <div
              key={s.id}
              draggable
              onDragStart={(e) => { setDragId(s.id); e.dataTransfer.effectAllowed = 'move'; }}
              onDragOver={(e) => { e.preventDefault(); if (overId !== s.id) setOverId(s.id); }}
              onDrop={(e) => { e.preventDefault(); if (dragId) reorder(dragId, s.id); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
              className={`flex items-center gap-1 rounded-lg border px-2 py-1.5 text-sm transition ${
                selected === s.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/10 bg-white/[0.02]'
              } ${dragId === s.id ? 'opacity-40' : ''} ${overId === s.id && dragId && dragId !== s.id ? 'border-emerald-400 ring-1 ring-emerald-400/40' : ''}`}
            >
              <span className="cursor-grab text-neutral-600 hover:text-neutral-300 active:cursor-grabbing" aria-label="Przeciągnij"><GripVertical className="h-3.5 w-3.5" /></span>
              <button onClick={() => setSelected(s.id)} className="flex-1 truncate text-left text-white">{SECTION_LABEL[s.type]}</button>
              <button onClick={() => move(s.id, -1)} className="text-neutral-500 hover:text-white" aria-label="W górę"><ChevronUp className="h-3.5 w-3.5" /></button>
              <button onClick={() => move(s.id, 1)} className="text-neutral-500 hover:text-white" aria-label="W dół"><ChevronDown className="h-3.5 w-3.5" /></button>
              <button onClick={() => remove(s.id)} className="text-neutral-500 hover:text-rose-300" aria-label="Usuń"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
          <select onChange={(e) => { if (e.target.value) { add(e.target.value as SectionType); e.target.value = ''; } }} defaultValue="" className="w-full rounded-lg border border-dashed border-white/15 bg-black/40 px-2 py-1.5 text-sm text-neutral-300">
            <option value="">+ Dodaj sekcję…</option>
            {(Object.keys(SECTION_LABEL) as SectionType[]).map((t) => <option key={t} value={t}>{SECTION_LABEL[t]}</option>)}
          </select>
        </div>

        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2">
          <div className="mx-auto overflow-hidden rounded-lg bg-white transition-all" style={{ width: device === 'mobile' ? 390 : '100%', maxWidth: '100%' }}>
            <iframe title="Podgląd strony" srcDoc={html} className="h-[640px] w-full border-0" />
          </div>
        </div>

        <div className="space-y-4">
          <details open className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-neutral-400">SEO / Meta</summary>
            <div className="mt-2 space-y-2">
              <Field label="Tytuł strony" value={model.meta.title} onChange={(v) => setMeta({ title: v })} />
              <Field label="Opis (meta description)" value={model.meta.description} onChange={(v) => setMeta({ description: v })} area />
            </div>
          </details>

          <details open className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-widest text-neutral-400">Motyw</summary>
            <div className="mt-2 space-y-2">
              <div className="flex flex-wrap gap-1.5 pb-1">
                {COLOR_PRESETS.map((cp) => (
                  <button key={cp.label} type="button" title={cp.label} onClick={() => setTheme({ primary: cp.primary, accent: cp.accent })} className="h-6 w-6 rounded-full border border-white/20" style={{ background: `linear-gradient(135deg, ${cp.primary} 50%, ${cp.accent} 50%)` }} />
                ))}
              </div>
              <Row label="Kolor główny"><input type="color" value={model.theme.primary} onChange={(e) => setTheme({ primary: e.target.value })} className="h-7 w-12 rounded border border-white/10 bg-transparent" /></Row>
              <Row label="Akcent"><input type="color" value={model.theme.accent} onChange={(e) => setTheme({ accent: e.target.value })} className="h-7 w-12 rounded border border-white/10 bg-transparent" /></Row>
              <Row label="Tło"><Sel value={model.theme.bg} onChange={(v) => setTheme({ bg: v as Theme['bg'] })} opts={[['light', 'Jasne'], ['dark', 'Ciemne']]} /></Row>
              <Row label="Font"><Sel value={model.theme.font} onChange={(v) => setTheme({ font: v as Theme['font'] })} opts={[['sans', 'Bezszeryfowy'], ['serif', 'Szeryfowy']]} /></Row>
              <Row label="Zaokrąglenia"><Sel value={model.theme.radius} onChange={(v) => setTheme({ radius: v as Theme['radius'] })} opts={[['sm', 'Małe'], ['md', 'Średnie'], ['xl', 'Duże']]} /></Row>
              <Row label="Szerokość"><Sel value={model.theme.width} onChange={(v) => setTheme({ width: v as Theme['width'] })} opts={[['normal', 'Normalna'], ['wide', 'Szeroka']]} /></Row>
            </div>
          </details>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">{sel ? `Edycja: ${SECTION_LABEL[sel.type]}` : 'Wybierz sekcję, aby edytować'}</p>
            {sel ? <SectionEditor section={sel} onChange={(patch) => update(sel.id, patch)} /> : null}
          </div>

          <div className="space-y-1.5 border-t border-white/10 pt-3">
            <label className="block text-xs text-neutral-500">Katalog publikacji</label>
            <input value={publishDir} onChange={(e) => setPublishDir(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            <p className="text-[11px] text-neutral-500">Domyślnie <code>public_html</code>. „Publikuj" zapisze <code>index.html</code>.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---- small UI helpers ---- */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="flex items-center justify-between text-sm text-neutral-300">{label}{children}</label>;
}
function Sel({ value, onChange, opts }: { value: string; onChange: (v: string) => void; opts: [string, string][] }) {
  return <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-white">{opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>;
}
function Field({ label, value, onChange, area }: { label: string; value: string; onChange: (v: string) => void; area?: boolean }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {area ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} className="w-full min-h-[60px] rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
      )}
    </label>
  );
}

/* per-type editor */
function SectionEditor({ section, onChange }: { section: Section; onChange: (patch: Record<string, unknown>) => void }) {
  const d = section.data;
  const F = (k: string, label: string, area?: boolean) => <Field key={k} label={label} value={String(d[k] ?? '')} onChange={(v) => onChange({ [k]: v })} area={area} />;
  const Bool = (k: string, label: string) => (
    <label className="flex items-center gap-2 text-sm text-neutral-300"><input type="checkbox" checked={Boolean(d[k])} onChange={(e) => onChange({ [k]: e.target.checked })} className="h-4 w-4 accent-emerald-500" />{label}</label>
  );

  switch (section.type) {
    case 'navbar':
      return <div className="space-y-2">{F('brand', 'Nazwa / logo')}{F('ctaText', 'Tekst przycisku')}{Bool('sticky', 'Przyklejona nawigacja')}<StrList label="Linki menu" items={(d.links as string[]) ?? []} onChange={(links) => onChange({ links })} /></div>;
    case 'hero':
      return <div className="space-y-2">{F('eyebrow', 'Etykieta')}{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł', true)}{F('ctaText', 'Przycisk główny')}{F('ctaHref', 'Link przycisku')}{F('ctaSecondary', 'Przycisk drugi (opcjonalnie)')}{F('bgImage', 'URL tła (opcjonalnie)')}<Row label="Wyrównanie"><Sel value={String(d.align ?? 'left')} onChange={(v) => onChange({ align: v })} opts={[['left', 'Do lewej'], ['center', 'Wyśrodkowane']]} /></Row></div>;
    case 'stats':
      return <ObjList label="Liczby" items={(d.items as Rec[]) ?? []} fields={[['value', 'Wartość'], ['label', 'Opis']]} factory={() => ({ value: '100+', label: 'Opis' })} onChange={(items) => onChange({ items })} />;
    case 'features':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Karty" items={(d.items as Rec[]) ?? []} fields={[['icon', 'Ikona (emoji)'], ['title', 'Tytuł'], ['desc', 'Opis', true]]} factory={() => ({ icon: '◆', title: 'Nowa cecha', desc: 'Opis…' })} onChange={(items) => onChange({ items })} /></div>;
    case 'gallery':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Zdjęcia" items={(d.images as Rec[]) ?? []} fields={[['url', 'URL obrazu'], ['caption', 'Podpis']]} factory={() => ({ url: 'https://picsum.photos/seed/x/600/400', caption: '' })} onChange={(images) => onChange({ images })} /></div>;
    case 'pricing':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}<ObjList label="Plany" items={(d.plans as Rec[]) ?? []} fields={[['name', 'Nazwa'], ['price', 'Cena'], ['period', 'Okres'], ['features', 'Cechy (po jednej w wierszu)', true], ['ctaText', 'Przycisk']]} bools={[['featured', 'Polecany']]} factory={() => ({ name: 'Plan', price: '0', period: '/mies.', features: 'Cecha 1\nCecha 2', ctaText: 'Wybieram', featured: false })} onChange={(plans) => onChange({ plans })} /></div>;
    case 'testimonials':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Opinie" items={(d.items as Rec[]) ?? []} fields={[['quote', 'Cytat', true], ['author', 'Autor'], ['role', 'Rola']]} factory={() => ({ quote: 'Świetna usługa!', author: 'Klient', role: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'team':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Osoby" items={(d.items as Rec[]) ?? []} fields={[['name', 'Imię i nazwisko'], ['role', 'Rola'], ['photo', 'URL zdjęcia']]} factory={() => ({ name: 'Imię', role: 'Stanowisko', photo: '' })} onChange={(items) => onChange({ items })} /></div>;
    case 'faq':
      return <div className="space-y-2">{F('title', 'Tytuł')}<ObjList label="Pytania" items={(d.items as Rec[]) ?? []} fields={[['q', 'Pytanie'], ['a', 'Odpowiedź', true]]} factory={() => ({ q: 'Pytanie?', a: 'Odpowiedź.' })} onChange={(items) => onChange({ items })} /></div>;
    case 'logos':
      return <div className="space-y-2">{F('title', 'Tytuł')}<StrList label="Nazwy / partnerzy" items={(d.items as string[]) ?? []} onChange={(items) => onChange({ items })} /></div>;
    case 'about':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('body', 'Treść', true)}{F('image', 'URL obrazu (opcjonalnie)')}</div>;
    case 'cta':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('buttonText', 'Przycisk')}{F('buttonHref', 'Link')}</div>;
    case 'newsletter':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('subtitle', 'Podtytuł')}{F('placeholder', 'Placeholder pola')}{F('buttonText', 'Przycisk')}</div>;
    case 'contact':
      return <div className="space-y-2">{F('title', 'Tytuł')}{F('email', 'E-mail')}{F('phone', 'Telefon')}{F('address', 'Adres')}{Bool('showForm', 'Pokaż formularz kontaktowy')}</div>;
    case 'footer':
      return <div className="space-y-2">{F('brand', 'Nazwa')}{F('note', 'Notka')}<StrList label="Linki w stopce" items={(d.links as string[]) ?? []} onChange={(links) => onChange({ links })} /></div>;
    default:
      return null;
  }
}

type Rec = Record<string, unknown>;
function StrList({ label, items, onChange }: { label: string; items: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-neutral-400">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="flex items-center gap-1">
          <input value={it} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} className="w-full rounded-lg border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="text-neutral-500 hover:text-rose-300"><Trash2 className="h-3.5 w-3.5" /></button>
        </div>
      ))}
      <button onClick={() => onChange([...items, 'Nowy'])} className="inline-flex items-center gap-1 text-xs text-emerald-300"><Plus className="h-3 w-3" /> Dodaj</button>
    </div>
  );
}
function ObjList({
  label, items, fields, factory, onChange, bools,
}: {
  label: string; items: Rec[]; fields: [string, string, boolean?][]; factory: () => Rec; onChange: (v: Rec[]) => void; bools?: [string, string][];
}) {
  const set = (i: number, k: string, v: unknown) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="space-y-2">
      <span className="text-xs text-neutral-400">{label}</span>
      {items.map((it, i) => (
        <div key={i} className="space-y-1 rounded-lg border border-white/10 p-2">
          {fields.map(([k, l, area]) =>
            area ? (
              <textarea key={k} value={String(it[k] ?? '')} onChange={(e) => set(i, k, e.target.value)} placeholder={l} className="w-full min-h-[44px] rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
            ) : (
              <input key={k} value={String(it[k] ?? '')} onChange={(e) => set(i, k, e.target.value)} placeholder={l} className="w-full rounded border border-white/10 bg-black/40 px-2 py-1 text-sm text-white" />
            ),
          )}
          {(bools ?? []).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-xs text-neutral-300"><input type="checkbox" checked={Boolean(it[k])} onChange={(e) => set(i, k, e.target.checked)} className="h-3.5 w-3.5 accent-emerald-500" />{l}</label>
          ))}
          <button onClick={() => onChange(items.filter((_, j) => j !== i))} className="inline-flex items-center gap-1 text-xs text-rose-300"><Trash2 className="h-3 w-3" /> Usuń</button>
        </div>
      ))}
      <button onClick={() => onChange([...items, factory()])} className="inline-flex items-center gap-1 text-xs text-emerald-300"><Plus className="h-3 w-3" /> Dodaj</button>
    </div>
  );
}

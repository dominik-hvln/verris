import type { Motyw } from '../model.ts';
import { regulyFontFace, stosFontu } from './fonty.ts';
import { czyCiemny, mieszaj, rgba } from './kolor.ts';
import type { KontekstStrony } from './kontekst.ts';
import { zmienneKontekstu } from './paleta.ts';

/**
 * Arkusz strony (assets/styl.css). Mobile-first, breakpoints 640/960/1200, tokeny z motywu jako custom
 * properties. Do pliku trafia baza + moduły użytych typów, wariantów i efektów (`KontekstStrony.css`).
 * Kolory sekcji pochodzą z kontekstów tła (`--s-*`), więc każdy wariant działa na każdym tle.
 */

const SKALA: Record<Motyw['skalaTypografii'], string> = {
  spokojna: '--fs-h1:clamp(2.25rem,1.7rem + 2.6vw,3.75rem);--fs-h2:clamp(1.75rem,1.45rem + 1.4vw,2.5rem);--fs-h3:1.25rem;--fs-lead:clamp(1.0625rem,1rem + .3vw,1.1875rem)',
  wyrazista: '--fs-h1:clamp(2.5rem,1.6rem + 4.2vw,4.75rem);--fs-h2:clamp(2rem,1.55rem + 2vw,3.125rem);--fs-h3:1.375rem;--fs-lead:clamp(1.0625rem,1rem + .4vw,1.25rem)',
  monumentalna: '--fs-h1:clamp(2.75rem,1.4rem + 6.6vw,7rem);--fs-h2:clamp(2.25rem,1.5rem + 3.2vw,4rem);--fs-h3:1.5rem;--fs-lead:clamp(1.125rem,1rem + .5vw,1.3125rem)',
};
const GESTOSC: Record<Motyw['gestosc'], string> = {
  zwarta: '--sek-py:clamp(3rem,2.2rem + 3.5vw,5rem);--odstep:clamp(1.25rem,1rem + 1.5vw,2.25rem)',
  normalna: '--sek-py:clamp(4rem,2.6rem + 5vw,7rem);--odstep:clamp(1.5rem,1rem + 2.2vw,3.5rem)',
  przestronna: '--sek-py:clamp(5rem,3rem + 7.5vw,9.5rem);--odstep:clamp(2rem,1.2rem + 3vw,5rem)',
};
const PROMIEN: Record<Motyw['zaokraglenie'], string> = {
  ostre: '--r-btn:0;--r-karta:0;--r-ob:0;--r-pole:0;--r-logo:0;--r-chip:0',
  lekkie: '--r-btn:6px;--r-karta:10px;--r-ob:6px;--r-pole:6px;--r-logo:6px;--r-chip:4px',
  miekkie: '--r-btn:14px;--r-karta:20px;--r-ob:18px;--r-pole:10px;--r-logo:12px;--r-chip:999px',
  pelne: '--r-btn:999px;--r-karta:22px;--r-ob:20px;--r-pole:12px;--r-logo:50%;--r-chip:999px',
};
const ANIMACJE: Record<Motyw['animacje'], string> = {
  brak: '--anim-t:0ms;--anim-dy:0px;--anim-krok:0ms',
  subtelne: '--anim-t:650ms;--anim-dy:18px;--anim-krok:70ms',
  wyraziste: '--anim-t:950ms;--anim-dy:42px;--anim-krok:110ms',
};

function tokeny(s: KontekstStrony): string {
  const m = s.strona.motyw;
  const p = s.kolory.paleta;
  const f = s.fonty;
  const k = s.kolory.konteksty;
  const jasneTlo = !czyCiemny(p.tlo);
  // Zestawy kolorów placeholderów (tło + linie wzoru) z palety.
  const ph = [
    [p.akcent, rgba(p.naAkcencie, 0.16), p.akcentTekst],
    [p.akcentTekst, rgba(p.tlo, 0.18), p.akcent],
    [mieszaj(p.powierzchnia, p.tekst, 0.16), rgba(p.tekst, 0.1), p.akcent],
    [p.powierzchnia, rgba(p.akcent, 0.28), p.akcent],
    [p.ciemne, rgba(p.naCiemnym, 0.1), p.akcentTekst],
  ]
    .map(([t, l, d], i) => `.ph-k${i}{--ph-t:${t};--ph-l:${l};--ph-d:${d}}`)
    .join('');
  const pole = (ciemny: boolean, karta: string) => (ciemny ? mieszaj(karta, '#FFFFFF', 0.04) : mieszaj(karta, '#FFFFFF', 0.7));
  const kontekst = (nazwa: keyof typeof k) => `${zmienneKontekstu(k[nazwa])};--s-pole:${pole(k[nazwa].ciemny, k[nazwa].karta)}`;
  return (
    `:root{${kontekst('domyslne')};` +
    `--tlo:${p.tlo};--pow:${p.powierzchnia};--tekst:${p.tekst};--akc:${p.akcent};--na-akc:${p.naAkcencie};--ciemne:${p.ciemne};--na-ciemnym:${p.naCiemnym};` +
    `--f-nag:${stosFontu(f.naglowki)};--f-tekst:${stosFontu(f.tekst)};--f-akc:${f.akcent ? stosFontu(f.akcent) : 'var(--f-tekst)'};` +
    `--w-nag:${f.wagaNaglowka};--w-tekst:${f.wagaTekstu};--w-b:${f.wagaPogrubiona};` +
    `--lh-nag:${f.szeryfoweNaglowki ? 1.04 : 1.06};--ls-nag:${f.szeryfoweNaglowki ? '-0.018em' : '-0.028em'};` +
    `${SKALA[m.skalaTypografii]};${GESTOSC[m.gestosc]};${PROMIEN[m.zaokraglenie]};${ANIMACJE[m.animacje]};` +
    `--kont:72rem;--kont-px:clamp(1.25rem,5vw,5rem);` +
    `--cien:0 24px 48px -28px ${rgba(p.tekst, jasneTlo ? 0.45 : 0.7)};` +
    `--mapa-tlo:${mieszaj(p.powierzchnia, p.tekst, 0.07)};--mapa-ul:${mieszaj(p.tlo, '#FFFFFF', 0.65)};--mapa-park:${mieszaj(p.powierzchnia, '#7FA36B', 0.38)};` +
    `--ph-podpis-t:${rgba(p.ciemne, 0.86)};--ph-podpis-k:${p.naCiemnym}}\n` +
    `.tlo-domyslne{${kontekst('domyslne')}}.tlo-powierzchnia{${kontekst('powierzchnia')}}.tlo-ciemne{${kontekst('ciemne')}}.tlo-akcent{${kontekst('akcent')}}\n` +
    ph
  );
}

const BAZA = `
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%;text-size-adjust:100%;scroll-padding-top:5.5rem}
body{margin:0;background:var(--s-tlo);color:var(--s-tekst);font-family:var(--f-tekst);font-weight:var(--w-tekst);font-size:1rem;line-height:1.6;-webkit-font-smoothing:antialiased;overflow-wrap:break-word}
img,svg{display:block;max-width:100%}
h1,h2,h3{font-family:var(--f-nag);font-weight:var(--w-nag);line-height:var(--lh-nag);letter-spacing:var(--ls-nag);margin:0;text-wrap:balance}
h2{font-size:var(--fs-h2)}
h3{font-size:var(--fs-h3);line-height:1.2}
p,ul,ol,dl,dd,figure,blockquote,address{margin:0;padding:0}
ul,ol{list-style:none}
address{font-style:normal}
strong,b{font-weight:var(--w-b)}
a{color:inherit;text-underline-offset:.2em;text-decoration-thickness:1px}
p a,.zgoda a,address a{text-decoration-thickness:1px}
:focus-visible{outline:3px solid var(--s-fokus);outline-offset:3px}
.sr{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}
.skip{position:absolute;left:1rem;top:-5rem;z-index:100;background:var(--s-btn);color:var(--s-btn-t);padding:.75rem 1.25rem;border-radius:var(--r-btn);font-weight:var(--w-b);text-decoration:none}
.skip:focus{top:1rem}
.kontener{width:100%;max-width:calc(var(--kont) + 2 * var(--kont-px));margin-inline:auto;padding-inline:var(--kont-px)}
.kontener-waski{max-width:calc(50rem + 2 * var(--kont-px))}
.sek{position:relative;padding-block:var(--sek-py);background:var(--s-tlo);color:var(--s-tekst)}
.tlo-domyslne,.tlo-powierzchnia,.tlo-ciemne,.tlo-akcent{color:var(--s-tekst)}
.nad{font-family:var(--f-akc);font-size:.8125rem;font-weight:var(--w-b);letter-spacing:.14em;text-transform:uppercase;color:var(--s-akc);margin-bottom:1rem;line-height:1.5}
.glowa{margin-bottom:clamp(2rem,1.5rem + 2vw,3.5rem);max-width:44rem}
.glowa .wstep,.wstep{margin-top:1.25rem;color:var(--s-tekst2);font-size:1.0625rem;max-width:38rem}
.glowa-srodek{text-align:center;margin-inline:auto}
.glowa-srodek .wstep{margin-inline:auto}
.glowa-rzad{max-width:none;display:grid;gap:1rem 3rem}
.uklad-bok{display:grid;gap:var(--odstep)}
.lead{font-size:var(--fs-lead);color:var(--s-tekst2);max-width:36rem;line-height:1.55;margin-top:1.5rem}
.wyr-kursywa .wyr{font-style:italic;color:var(--s-akc)}
.wyr-marker .wyr{font-style:normal;background:var(--akc);color:var(--na-akc);padding:0 .14em;-webkit-box-decoration-break:clone;box-decoration-break:clone;border-radius:.08em}
.akcje{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:2rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.5rem;min-height:3.25rem;padding:.75rem 1.6rem;border-radius:var(--r-btn);font-family:var(--f-tekst);font-weight:var(--w-b);font-size:1rem;line-height:1.2;text-align:center;text-decoration:none;border:0;cursor:pointer;transition:background-color .2s,color .2s,box-shadow .2s,transform .2s}
.btn-1{background:var(--s-btn);color:var(--s-btn-t)}
.btn-1:hover{box-shadow:0 0 0 4px color-mix(in srgb,var(--s-btn) 22%,transparent)}
.btn-2{background:transparent;color:var(--s-tekst);box-shadow:inset 0 0 0 1.5px currentColor}
.btn-2:hover{background:color-mix(in srgb,var(--s-tekst) 7%,transparent)}
.btn-maly{min-height:2.75rem;padding:.5rem 1.25rem;font-size:.9375rem}
.btn-pelny{width:100%}
.btn .ik{width:1.125rem;height:1.125rem}
.ik{width:1.5rem;height:1.5rem;fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round;flex:none}
.chip{display:inline-block;font-size:.75rem;font-weight:var(--w-b);padding:.3rem .75rem;border:1px solid var(--s-ramka);border-radius:var(--r-chip);line-height:1.3}
.odznaka{display:inline-block;background:var(--akc);color:var(--na-akc);font-family:var(--f-tekst);font-weight:var(--w-b);font-size:.6875rem;line-height:1;letter-spacing:.1em;text-transform:uppercase;padding:.5rem .75rem;border-radius:var(--r-chip)}

/* nagłówek */
.naglowek{position:relative;z-index:50;background:var(--s-tlo);border-bottom:1px solid var(--s-linia)}
.naglowek.przyklejony{position:sticky;top:0;transition:box-shadow .3s}
.naglowek.zwiniety{box-shadow:0 10px 30px -22px rgba(0,0,0,.5)}
.naglowek-wnetrze{display:flex;flex-wrap:wrap;align-items:center;gap:.5rem 1rem;min-height:4.5rem;transition:min-height .3s}
.naglowek.zwiniety .naglowek-wnetrze{min-height:3.75rem}
.logo{display:inline-flex;align-items:center;gap:.65rem;margin-right:auto;text-decoration:none;font-family:var(--f-nag);font-weight:var(--w-nag);font-size:1.25rem;letter-spacing:var(--ls-nag);line-height:1.1;min-width:0}
.logo-znak{display:grid;place-items:center;flex:none;width:2.25rem;height:2.25rem;border-radius:var(--r-logo);background:var(--s-btn);color:var(--s-btn-t);font-size:1.125rem;letter-spacing:0}
.menu-btn{display:none}
.nav{order:3;flex-basis:100%;overflow-x:auto;margin-inline:calc(-1 * var(--kont-px));padding-inline:var(--kont-px)}
.nav ul{display:flex;gap:1.5rem;padding-block:.25rem .75rem;white-space:nowrap}
.nav a{display:inline-block;padding-block:.35rem;font-size:.9375rem;font-weight:500;text-decoration:none}
.nav a:hover,.nav a[aria-current]{text-decoration:underline;text-decoration-thickness:1.5px;text-underline-offset:.45em}
.nag-prawa{display:none;align-items:center;gap:1.25rem}
.nag-tel{display:inline-flex;align-items:center;gap:.4rem;font-weight:var(--w-b);font-size:.9375rem;text-decoration:none;white-space:nowrap}
.nag-tel .ik{width:1.1rem;height:1.1rem;color:var(--s-akc)}
.nag-tel span{display:none}
.js .menu-btn{display:grid;place-items:center;width:2.75rem;height:2.75rem;border:1px solid var(--s-linia);border-radius:var(--r-btn);background:transparent;color:var(--s-tekst);cursor:pointer}
.js .nav{display:none;position:absolute;left:0;right:0;top:100%;margin:0;padding:.5rem var(--kont-px) 1.5rem;background:var(--s-tlo);border-bottom:1px solid var(--s-linia);box-shadow:0 24px 30px -24px rgba(0,0,0,.35)}
.js .naglowek.otwarte .nav{display:block}
.js .nav ul{flex-direction:column;gap:0;white-space:normal}
.js .nav li+li{border-top:1px solid var(--s-linia)}
.js .nav a{display:block;padding-block:.9rem;font-size:1.0625rem}
@media (min-width:640px){
  .nag-prawa{display:flex}
}
@media (min-width:960px){
  .naglowek-wnetrze{flex-wrap:nowrap;gap:2rem;min-height:5.25rem}
  .nav,.js .nav{display:block;position:static;order:0;flex-basis:auto;margin:0 auto;padding:0;overflow:visible;background:none;border:0;box-shadow:none}
  .nav ul,.js .nav ul{flex-direction:row;gap:clamp(1.25rem,2.5vw,2.25rem);padding:0}
  .js .nav li+li{border:0}
  .js .nav a,.nav a{display:inline-block;padding-block:.35rem;font-size:.9375rem}
  .js .menu-btn{display:none}
  .logo{margin-right:0}
  .logo-nazwa{white-space:nowrap}
}
@media (min-width:1200px){.nag-tel span{display:inline}}

/* obrazy i placeholdery */
.ob{position:relative;overflow:hidden;border-radius:var(--r-ob);background:var(--s-karta)}
.ob img,.ob .ph,.ob .lb{width:100%;height:100%}
.ob img{object-fit:cover}
.ob .lb{display:block;cursor:zoom-in}
.pr-16-9{aspect-ratio:16/9}.pr-4-3{aspect-ratio:4/3}.pr-3-2{aspect-ratio:3/2}.pr-1-1{aspect-ratio:1/1}.pr-3-4{aspect-ratio:3/4}.pr-4-5{aspect-ratio:4/5}
.ph{position:relative;display:block}
.ph svg{position:absolute;inset:0;width:100%;height:100%}
.ph-tlo{fill:var(--ph-t)}
.ph-l{stroke:var(--ph-l);stroke-width:1.6}
.ph-l-mocna{stroke-width:3}
.ph-d{fill:var(--ph-d)}
.ph-d-lekka{fill:var(--ph-l)}
.ph-podpis{position:absolute;left:.75rem;bottom:.75rem;max-width:calc(100% - 1.5rem);font-family:var(--f-tekst);font-size:.75rem;font-weight:500;line-height:1.35;padding:.35rem .6rem;background:var(--ph-podpis-t);color:var(--ph-podpis-k);border-radius:4px}
.ob-luk{border-radius:1000px 1000px var(--r-ob) var(--r-ob)}
.ob-okragle{border-radius:50%}

/* karty z formularzem i formularze */
.karta-form{container-type:inline-size;background:var(--s-karta);color:var(--s-tekst);border:1px solid var(--s-linia);border-radius:var(--r-karta);padding:clamp(1.5rem,1rem + 2vw,2.5rem);box-shadow:var(--cien)}
.karta-tytul{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:1.625rem;line-height:1.15;letter-spacing:var(--ls-nag)}
.karta-opis{color:var(--s-tekst2);margin-top:.5rem;font-size:.9375rem}
.formularz{margin-top:1.5rem}
.pola{display:grid;gap:1rem}
.pole-pelne{grid-column:1/-1}
.pole label{display:block;font-size:.8125rem;font-weight:var(--w-b);margin-bottom:.4rem}
.opc{font-weight:400;color:var(--s-tekst2)}
.pole input,.pole select,.pole textarea{display:block;width:100%;min-height:3rem;padding:.7rem .9rem;font:inherit;font-size:1rem;color:var(--s-tekst);background:var(--s-pole);border:1px solid var(--s-ramka);border-radius:var(--r-pole)}
.pole textarea{min-height:7.5rem;resize:vertical}
.pole input::placeholder,.pole textarea::placeholder{color:var(--s-tekst2);opacity:.85}
.pole input:focus-visible,.pole select:focus-visible,.pole textarea:focus-visible{outline:3px solid var(--s-fokus);outline-offset:1px}
.form-linia .pole input,.form-linia .pole select,.form-linia .pole textarea{background:transparent;border:0;border-bottom:1px solid var(--s-ramka);border-radius:0;padding-inline:0}
.form-linia .pole textarea{border:1px solid var(--s-ramka);padding:.75rem}
.hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.zgoda{display:flex;gap:.75rem;align-items:flex-start;margin-block:1.25rem 1.5rem;font-size:.8125rem;line-height:1.5;color:var(--s-tekst2)}
.zgoda input{width:1.125rem;height:1.125rem;margin:.15rem 0 0;flex:none;accent-color:var(--s-btn)}
.zgoda a{color:var(--s-tekst)}
.formularz .btn{width:100%}
.form-linia .btn{width:auto}
@container (min-width:30rem){.pola{grid-template-columns:1fr 1fr}}

/* karuzele (przewijanie gestem i klawiaturą działa bez JS) */
.karuzela{position:relative}
.karuzela-tor{display:flex;gap:1rem;overflow-x:auto;scroll-snap-type:x mandatory;overscroll-behavior-x:contain;scrollbar-width:thin;padding-bottom:1rem}
.karuzela-tor>*{scroll-snap-align:start;flex:none}
/* nagłówek sekcji z przyciskami karuzeli: na telefonie przyciski pod wstępem, od 640 px po prawej u dołu */
.karuzela-glowa{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:1.5rem 3rem;margin-bottom:clamp(2rem,1.5rem + 2vw,3.5rem)}
.karuzela-glowa>.glowa{margin-bottom:0}
.karuzela-nav{display:flex;gap:.5rem}
html:not(.js) .karuzela-nav{display:none}
.karuzela-btn{display:grid;place-items:center;width:3rem;height:3rem;border-radius:50%;border:1px solid var(--s-ramka);background:transparent;color:var(--s-tekst);cursor:pointer;transition:background-color .2s}
.karuzela-btn:hover{background:color-mix(in srgb,var(--s-tekst) 8%,transparent)}
.karuzela-btn:disabled{opacity:.35;cursor:default}
.karuzela-btn .ik{width:1.25rem;height:1.25rem}

/* lista z ikoną check */
.lista-check{display:grid;gap:.75rem;margin-top:2rem}
.lista-check li{display:flex;gap:.75rem;align-items:flex-start}
.lista-check strong{display:block}
.lista-check .ik{width:1.375rem;height:1.375rem;padding:.2rem;border-radius:var(--r-chip);background:var(--akc);color:var(--na-akc);stroke-width:2.4;margin-top:.1rem}

/* nagłówek podstrony */
.naglowek-strony{padding-block:clamp(3rem,2rem + 4vw,6rem) clamp(1rem,.5rem + 2vw,2.5rem)}
.naglowek-strony h1{font-size:calc(var(--fs-h1) * .85)}
.naglowek-strony .lead{margin-top:1.25rem}
.okruszki ol{display:flex;flex-wrap:wrap;gap:.5rem;font-size:.8125rem;color:var(--s-tekst2);margin-bottom:1.5rem}
.okruszki li+li::before{content:"/";margin-right:.5rem}
.wpis-meta{font-size:.8125rem;color:var(--s-tekst2);margin-bottom:.75rem}

/* stopka */
.stopka{background:var(--s-tlo);color:var(--s-tekst);padding-block:clamp(3rem,2rem + 3vw,4.5rem) 2rem;font-size:.9375rem}
.stopka-siatka{display:grid;gap:2rem}
.stopka .logo{margin-bottom:.9rem}
.stopka-firma p{color:var(--s-tekst2);max-width:22rem}
.stopka-tytul{font-family:var(--f-tekst);font-weight:var(--w-b);font-size:.75rem;line-height:1.4;letter-spacing:.14em;text-transform:uppercase;color:var(--s-tekst2);margin-bottom:.75rem}
.stopka li+li{margin-top:.35rem}
.stopka nav a{text-decoration:none}
.stopka nav a:hover{text-decoration:underline}
.stopka .godziny-lista div{display:flex;gap:.75rem;justify-content:space-between;max-width:16rem}
.godziny-lista div{flex-wrap:wrap;column-gap:.75rem}
.godziny-lista dt{white-space:nowrap}
.stopka .godziny-lista dd{font-weight:400}
.stopka-dol{display:flex;flex-wrap:wrap;align-items:center;gap:1rem 2rem;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--s-linia);font-size:.8125rem;color:var(--s-tekst2)}
.stopka-linki{display:flex;flex-wrap:wrap;gap:.5rem 1.25rem}
.stopka-linki a{color:var(--s-tekst)}
.social{display:flex;gap:.5rem}
.social li+li{margin:0}
.social a{display:grid;place-items:center;width:2.5rem;height:2.5rem;border:1px solid var(--s-linia);border-radius:50%;color:var(--s-tekst)}
.social .ik{width:1.125rem;height:1.125rem}
.znak-kreatora{display:inline-flex;align-items:center;gap:.6rem;text-decoration:none;color:var(--s-tekst2);font-size:.75rem}
.znak-logo{width:auto;height:1.875rem}
.znak-minimalny{gap:.45rem}
.znak-emblemat{width:1.25rem;height:1.25rem}
.znak-kreatora:hover .znak-tekst,.znak-minimalny:hover span{text-decoration:underline}
@media (min-width:640px){.stopka-siatka{grid-template-columns:1fr 1fr}}
@media (min-width:960px){.stopka-siatka{grid-template-columns:1.5fr repeat(3,1fr)}.znak-kreatora{margin-left:auto}}

/* wstęga Pro w podglądzie */
.jest-pro{outline:2px dashed color-mix(in srgb,var(--akc) 55%,transparent);outline-offset:-8px}
.wstega-pro{position:absolute;top:1rem;right:1rem;z-index:5;background:#0c1a14;color:#34e5a0;font:700 .6875rem/1 system-ui,sans-serif;letter-spacing:.12em;text-transform:uppercase;padding:.5rem .75rem;border-radius:999px}
.opinie-puste{border:1.5px dashed var(--s-ramka);border-radius:var(--r-karta);padding:clamp(1.5rem,1rem + 2vw,2.25rem)}
.opinie-puste-tytul{font-family:var(--f-nag);font-size:clamp(1.25rem,1.1rem + .6vw,1.5rem);line-height:1.35}
.wyr-kursywa .opinie-puste-tytul{font-style:italic}
.opinie-puste p+p{margin-top:.6rem;font-size:.875rem;color:var(--s-tekst2)}

@media (min-width:960px){
  .glowa-rzad{grid-template-columns:minmax(0,1fr) minmax(0,26rem);align-items:end}
  .glowa-rzad>*{grid-column:1}
  .glowa-rzad>.wstep{grid-column:2;grid-row:1 / span 3;align-self:end;margin:0}
  .uklad-bok{grid-template-columns:minmax(0,4fr) minmax(0,7fr);gap:clamp(3rem,2rem + 4vw,6rem)}
  .uklad-bok>.glowa{position:sticky;top:7rem;align-self:start;margin:0}
}
`;

const MODULY: Record<string, string> = {
  // --- hero ---
  'typ:hero': `
.sek-hero{padding-block:clamp(2.5rem,1.5rem + 5vw,6.5rem)}
.hero-h{font-size:var(--fs-h1)}
.hero-media{position:relative}
.hero-siatka{display:grid;gap:clamp(2.5rem,1.5rem + 4vw,5rem);align-items:center}
.fakty{display:flex;flex-wrap:wrap;gap:1.25rem 2.5rem;margin-top:2.5rem;padding-top:1.5rem;border-top:1px solid var(--s-linia)}
.fakty dt{font-size:.8125rem;color:var(--s-tekst2)}
.fakty dd{font-weight:var(--w-b)}
.karta-plywajaca{position:relative;margin:-3rem 1rem 0;background:var(--s-karta);border:1px solid var(--s-linia);border-radius:calc(var(--r-karta) * .6);padding:1.25rem 1.5rem;box-shadow:var(--cien);z-index:2}
.karta-plywajaca .karta-tytul{font-size:1.25rem;margin-bottom:.6rem}
.godziny-lista div{display:flex;justify-content:space-between;gap:1rem;padding-block:.3rem;font-size:.9375rem}
.karta-plywajaca .godziny-lista div+div{border-top:1px solid var(--s-linia)}
.godziny-lista dt{color:var(--s-tekst2)}
.godziny-lista dd{font-weight:var(--w-b);white-space:nowrap}
@media (min-width:960px){.karta-plywajaca{position:absolute;left:-4rem;bottom:2rem;margin:0;width:19rem}}
`,
  'w:hero-podzielony': `
.hero-podzielony .hero-media .ob{max-width:30rem;margin-inline:auto}
@media (min-width:960px){.hero-podzielony .hero-siatka{grid-template-columns:minmax(0,1.2fr) minmax(0,.8fr)}.hero-podzielony .hero-media .ob{max-width:none}}
`,
  'w:hero-edytorski': `
.hero-meta{display:flex;flex-wrap:wrap;justify-content:space-between;gap:.5rem 2rem;margin-bottom:clamp(1.5rem,1rem + 2vw,3rem)}
.hero-meta .nad{margin:0;color:var(--s-tekst2);letter-spacing:.08em}
.hero-meta .nad:first-child{color:var(--s-akc)}
.hero-edytorski .hero-h{font-size:min(calc(var(--fs-h1) * 1.3),15vw);line-height:.96;letter-spacing:calc(var(--ls-nag) * 1.2)}
.hero-edytorski .hero-media .ob{max-width:20rem}
@media (min-width:960px){.hero-edytorski .hero-siatka{grid-template-columns:minmax(0,1fr) 18rem;align-items:end}.hero-edytorski .hero-media .ob{max-width:none}}
`,
  'w:hero-centralny': `
.hero-centralny .hero-tekst{max-width:54rem;margin-inline:auto;text-align:center}
.hero-centralny .lead{margin-inline:auto}
.hero-centralny .akcje,.hero-centralny .fakty{justify-content:center}
.hero-centralny .hero-media{margin-top:clamp(2.5rem,2rem + 3vw,4.5rem)}
.ob-szeroki{aspect-ratio:4/3}
@media (min-width:640px){.ob-szeroki{aspect-ratio:16/9}}
@media (min-width:960px){.ob-szeroki{aspect-ratio:21/9}}
`,
  'w:hero-pelnoekranowy': `
.sek-hero.hero-pelnoekranowy{display:grid;align-items:end;min-height:min(92svh,58rem);padding-block:clamp(7rem,5rem + 10vw,12rem) clamp(3rem,2rem + 4vw,6rem);overflow:hidden;isolation:isolate}
.hero-tlo{position:absolute;inset:0;z-index:-2}
.hero-tlo .ob{height:100%;border-radius:0;aspect-ratio:auto}
.hero-zaslona{position:absolute;inset:0;z-index:-1;background:linear-gradient(to top,color-mix(in srgb,var(--s-tlo) 94%,transparent) 0%,color-mix(in srgb,var(--s-tlo) 72%,transparent) 50%,color-mix(in srgb,var(--s-tlo) 35%,transparent) 100%)}
.hero-pelnoekranowy .hero-tekst{max-width:48rem}
.hero-pelnoekranowy .lead{color:var(--s-tekst)}
`,
  'w:hero-z-formularzem': `
.hero-z-formularzem .karta-form{max-width:34rem}
@media (min-width:960px){.hero-z-formularzem .hero-siatka{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:start}.hero-z-formularzem .hero-tekst{padding-top:1rem}}
`,
  'w:hero-mozaika': `
.hero-kolaz{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));grid-template-rows:repeat(6,minmax(0,1fr));gap:.75rem;aspect-ratio:1/1}
.hero-kolaz .ob{aspect-ratio:auto;height:100%}
.kolaz-a{grid-area:1/1/7/4}.kolaz-b{grid-area:1/4/4/7}.kolaz-c{grid-area:4/4/7/7}
.hero-kolaz .kolaz-b{border-radius:var(--r-ob) var(--r-ob) var(--r-ob) calc(var(--r-ob) * 3)}
@media (min-width:960px){.hero-mozaika .hero-siatka{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.hero-kolaz{aspect-ratio:5/6}}
`,
  // --- oferta ---
  'typ:oferta': `
.poz-cena{font-weight:var(--w-b);white-space:nowrap}
.poz-nr{font-family:var(--f-nag);color:var(--s-akc);font-size:1.125rem;line-height:1.4}
`,
  'w:oferta-siatka': `
.karty{display:grid;gap:1rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,16rem),1fr))}
.karta{display:flex;flex-direction:column;gap:.75rem;background:var(--s-karta);border:1px solid var(--s-linia);border-radius:var(--r-karta);padding:clamp(1.5rem,1.2rem + 1vw,2rem);transition:transform .3s,box-shadow .3s}
.karta p{color:var(--s-tekst2);font-size:.9375rem}
.karta .poz-cena{margin-top:auto;padding-top:.75rem;color:var(--s-tekst);font-size:1rem}
.karta-nr{font-family:var(--f-nag);font-size:1.75rem;line-height:1;color:var(--s-akc)}
.karta-ikona{display:grid;place-items:center;width:3rem;height:3rem;border-radius:var(--r-logo);background:color-mix(in srgb,var(--akc) 14%,transparent);color:var(--s-akc);margin-bottom:.5rem}
@media (min-width:960px){.karty-3{grid-template-columns:repeat(3,1fr)}.karty-4{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1200px){.karty-4{grid-template-columns:repeat(4,1fr)}}
`,
  'w:oferta-lista-cen': `
.lista-cen li{padding-block:.8rem;break-inside:avoid}
.lista-cen .poz{display:flex;align-items:baseline;gap:.75rem}
.lista-cen h3{font-family:var(--f-tekst);font-weight:500;font-size:1rem;letter-spacing:0;line-height:1.45}
.kropki{flex:1;min-width:1.5rem;border-bottom:1.5px dotted var(--s-ramka);transform:translateY(-.3em)}
.lista-cen p{color:var(--s-tekst2);font-size:.875rem;margin-top:.15rem;max-width:30rem}
@media (min-width:640px){.lista-cen.dwie-kol{columns:2;column-gap:3rem}}
`,
  'w:oferta-kolumny': `
.lista-linie li{display:grid;grid-template-columns:auto 1fr;gap:.5rem 1.25rem;padding-block:1.5rem;border-top:1px solid var(--s-tekst)}
.lista-linie li:last-child{border-bottom:1px solid var(--s-tekst)}
.lista-linie p{color:var(--s-tekst2);margin-top:.4rem;max-width:34rem}
.lista-linie .poz-cena{grid-column:2;font-family:var(--f-nag);font-weight:var(--w-nag);font-size:1.5rem}
@media (min-width:640px){.lista-linie li{grid-template-columns:auto 1fr auto}.lista-linie .poz-cena{grid-column:3;align-self:end;text-align:right}}
`,
  'w:oferta-naprzemienna': `
.lista-naprzemienna{display:grid;gap:clamp(3rem,2rem + 4vw,6rem)}
.naprzemian{display:grid;gap:1.5rem 4rem;align-items:center}
.naprzemian-tekst p{color:var(--s-tekst2);margin-top:.75rem;max-width:32rem}
.naprzemian-tekst .poz-cena{color:var(--s-tekst);margin-top:1.25rem;font-size:1.125rem}
.naprzemian-tekst h3{font-size:clamp(1.5rem,1.2rem + 1.2vw,2.25rem);margin-top:.5rem}
@media (min-width:960px){.naprzemian{grid-template-columns:1fr 1fr}.naprzemian.odwr>.ob{order:2}}
`,
  // --- cennik ---
  'typ:cennik': `
.cena{display:flex;flex-wrap:wrap;align-items:baseline;gap:.35rem;margin-top:1.5rem}
.kwota{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:clamp(2.25rem,1.8rem + 1.5vw,3rem);line-height:1;letter-spacing:-.02em;white-space:nowrap}
.kwota-tekst{font-size:1.5rem;white-space:normal}
.cena-okres,.cena-od{color:var(--s-tekst2);font-size:.9375rem}
.cena-druga{font-size:.875rem;color:var(--s-tekst2);margin-top:.35rem}
.cechy{display:grid;gap:.6rem;margin-top:1.5rem;padding-top:1.5rem;border-top:1px solid var(--s-linia);font-size:.9375rem}
.cechy li{display:flex;gap:.6rem;align-items:flex-start}
.cechy .ik{width:1.25rem;height:1.25rem;color:var(--s-akc);margin-top:.15rem;stroke-width:2.2}
.uwaga{margin-top:2rem;font-size:.875rem;color:var(--s-tekst2)}
.przelacznik{display:inline-flex;margin-top:1.5rem;padding:.25rem;border:1px solid var(--s-ramka);border-radius:var(--r-btn)}
.przelacznik button{min-height:2.75rem;padding:.5rem 1.15rem;border:0;border-radius:var(--r-btn);background:transparent;color:var(--s-tekst);font:inherit;font-weight:var(--w-b);font-size:.9375rem;cursor:pointer}
.przelacznik button[aria-pressed="true"]{background:var(--s-btn);color:var(--s-btn-t)}
html:not(.js) .przelacznik{display:none}
.sek [data-okres].ukryty-okres{display:none}
`,
  'w:cennik-kolumny': `
.pakiety{display:grid;gap:1.25rem;align-items:stretch}
.pakiet{position:relative;display:flex;flex-direction:column;background:var(--s-karta);color:var(--s-tekst);border:1px solid var(--s-linia);border-radius:var(--r-karta);padding:2rem 1.75rem}
.pakiet.wyrozniony{background:var(--s-tlo);border-color:transparent;box-shadow:var(--cien)}
.pakiet .odznaka{position:absolute;top:-.85rem;left:1.75rem}
.pakiet h3{font-size:1.5rem}
.pakiet-opis{color:var(--s-tekst2);font-size:.9375rem;margin-top:.5rem}
.pakiet-akcja{margin-top:auto;padding-top:2rem}
@media (min-width:640px){.pakiety-2,.pakiety-4{grid-template-columns:repeat(2,1fr)}}
@media (min-width:960px){.pakiety-3{grid-template-columns:repeat(3,1fr)}.pakiet.wyrozniony{margin-block:-1rem;padding-block:3rem}}
@media (min-width:1200px){.pakiety-4{grid-template-columns:repeat(4,1fr)}}
`,
  'w:cennik-lista': `
.pasy{display:grid;gap:1rem}
.pas{display:grid;gap:1.25rem;padding:clamp(1.5rem,1.2rem + 1vw,2rem);background:var(--s-karta);border:1px solid var(--s-linia);border-radius:var(--r-karta)}
.pas.wyrozniony{border-color:var(--akc);box-shadow:inset 0 0 0 1px var(--akc)}
.pas h3{font-size:1.5rem}
.pas-nazwa p{color:var(--s-tekst2);font-size:.9375rem;margin-top:.4rem}
.pas .odznaka{margin-top:.9rem}
.pas .cechy{margin:0;padding:0;border:0;grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr))}
.pas-cena .cena{margin-top:0}
.pas-cena .btn{margin-top:1rem}
@media (min-width:960px){.pas{grid-template-columns:1.1fr 1.5fr minmax(13rem,.9fr);align-items:center}.pas-cena{text-align:right}.pas-cena .cena{justify-content:flex-end}}
`,
  'w:cennik-tabela': `
.tabela-przewijana{overflow-x:auto;border:1px solid var(--s-linia);border-radius:var(--r-karta);background:var(--s-karta)}
.tabela-cen{width:100%;min-width:38rem;border-collapse:collapse}
.tabela-cen th,.tabela-cen td{padding:1rem;border-bottom:1px solid var(--s-linia);text-align:center;vertical-align:middle}
.tabela-cen tbody th{text-align:left;font-weight:400;color:var(--s-tekst2)}
.tabela-cen thead th{vertical-align:bottom;padding-top:1.75rem}
.tab-nazwa{display:block;font-family:var(--f-nag);font-weight:var(--w-nag);font-size:1.25rem}
.tabela-cen .cena{justify-content:center;margin-top:.5rem}
.tabela-cen .kwota{font-size:1.75rem}
.tabela-cen .wyrozniony{background:color-mix(in srgb,var(--akc) 10%,transparent)}
.tabela-cen .ik{margin-inline:auto;color:var(--s-akc);stroke-width:2.2}
.brak{display:block;width:1rem;height:2px;background:var(--s-ramka);margin-inline:auto}
.tab-akcje td{border-bottom:0}
`,
  // --- galeria ---
  'w:galeria-siatka': `
.galeria-kafle{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
.ob-kwadrat{aspect-ratio:1/1}
@media (min-width:640px){.galeria-kafle{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (min-width:960px){.galeria-kafle{grid-template-columns:repeat(4,minmax(0,1fr));gap:1rem}}
`,
  'w:galeria-mozaika': `
.mozaika{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:9rem;grid-auto-flow:dense;gap:.75rem}
.mozaika li,.mozaika .ob{height:100%}
.ob-wypelnij{aspect-ratio:auto}
.mozaika li:nth-child(6n+1){grid-row:span 2}
.mozaika li:nth-child(6n+4){grid-column:span 2}
@media (min-width:960px){
  .mozaika{grid-template-columns:repeat(6,minmax(0,1fr));grid-auto-rows:8.5rem;gap:.875rem}
  .mozaika li:nth-child(6n+1){grid-column:span 2;grid-row:span 3}
  .mozaika li:nth-child(6n+2){grid-column:span 2;grid-row:span 1}
  .mozaika li:nth-child(6n+3){grid-column:span 2;grid-row:span 2}
  .mozaika li:nth-child(6n+4){grid-column:span 1;grid-row:span 2}
  .mozaika li:nth-child(6n+5){grid-column:span 1;grid-row:span 2}
  .mozaika li:nth-child(6n+6){grid-column:span 2;grid-row:span 1}
}
`,
  'w:galeria-karuzela': `
.galeria-tor{padding-inline:max(var(--kont-px),calc((100% - var(--kont)) / 2));scroll-padding-inline:max(var(--kont-px),calc((100% - var(--kont)) / 2))}
.galeria-tor>li{width:min(82%,26rem)}
.galeria-tor .ob{aspect-ratio:4/5}
`,
  // --- zespół ---
  'typ:zespol': `
.rola{color:var(--s-akc);font-weight:var(--w-b);font-size:.875rem;margin-top:.3rem}
.sek-zespol .opis{color:var(--s-tekst2);font-size:.9375rem;margin-top:.5rem}
.sek-zespol h3{font-size:1.5rem}
`,
  'w:zespol-karty': `
.osoby-karty{display:grid;gap:2rem 1.25rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.karta-osoby .ob{margin-bottom:1.25rem}
.ob-portret{aspect-ratio:4/5}
`,
  'w:zespol-lukowe': `
.osoby-luk{display:grid;gap:2.5rem 1.5rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,13rem),1fr))}
.osoby-luk .ob{margin-bottom:1.25rem;aspect-ratio:3/4}
@media (min-width:640px){.osoby-luk li:nth-child(3n+2){margin-top:2.5rem}}
@media (min-width:960px){.osoby-3{grid-template-columns:repeat(3,1fr)}.osoby-2{grid-template-columns:repeat(2,1fr)}}
`,
  'w:zespol-lista': `
.osoby-lista{display:grid;column-gap:3rem}
.osoby-lista li{display:grid;grid-template-columns:5rem 1fr;gap:1.25rem;align-items:start;padding-block:1.75rem;border-top:1px solid var(--s-linia)}
.osoby-lista .ob{aspect-ratio:1/1}
@media (min-width:640px){.osoby-lista li{grid-template-columns:7rem 1fr;gap:1.75rem}}
@media (min-width:960px){.osoby-lista{grid-template-columns:1fr 1fr}}
`,
  // --- opinie ---
  'typ:opinie': `
.opinia blockquote p{line-height:1.55}
.opinia figcaption{margin-top:1.25rem;font-size:.9375rem}
.opinia-autor{font-weight:var(--w-b)}
.opinia-data{color:var(--s-tekst2)}
.opinia-zrodlo{font-size:.8125rem;color:var(--s-tekst2)}
.karta-opinii{background:var(--s-karta);border:1px solid var(--s-linia);border-radius:var(--r-karta);padding:1.75rem}
.sek-opinie.uklad-bok{align-items:center}
`,
  'w:opinie-cytat': `
.cytaty-tor>.cytat{width:100%}
.cytat{max-width:56rem}
.cytat blockquote::before{content:"\\201C";display:block;font-family:var(--f-nag);font-size:5rem;line-height:.7;color:var(--s-akc);margin-bottom:.75rem}
.cytat blockquote p{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:clamp(1.5rem,1.1rem + 1.6vw,2.375rem);line-height:1.3;letter-spacing:var(--ls-nag)}
.cytaty .karuzela-nav{margin-top:1.5rem}
`,
  'w:opinie-siatka': `
.opinie-kolumny{columns:2 17rem;column-gap:1.25rem}
.opinie-kolumny .opinia{break-inside:avoid;margin-bottom:1.25rem}
`,
  'w:opinie-karuzela': `
.opinie-tor{padding-inline:max(var(--kont-px),calc((100% - var(--kont)) / 2));scroll-padding-inline:max(var(--kont-px),calc((100% - var(--kont)) / 2))}
.opinie-tor>.opinia{width:min(85%,24rem)}
`,
  // --- faq ---
  'typ:faq': `
.faq-el{border-bottom:1px solid var(--s-linia)}
.faq-el:first-child{border-top:1px solid var(--s-linia)}
.faq-el summary{display:flex;justify-content:space-between;align-items:center;gap:1.5rem;padding-block:1.35rem;cursor:pointer;list-style:none}
.faq-el summary::-webkit-details-marker{display:none}
.faq-el summary h3{font-size:clamp(1.0625rem,1rem + .3vw,1.25rem);line-height:1.35}
.faq-znak{position:relative;flex:none;width:1.1rem;height:1.1rem}
.faq-znak::before,.faq-znak::after{content:"";position:absolute;left:0;right:0;top:50%;height:1.5px;margin-top:-.75px;background:currentColor;transition:transform .25s}
.faq-znak::after{transform:rotate(90deg)}
.faq-el[open] .faq-znak::after{transform:rotate(0)}
.faq-odp{padding-bottom:1.5rem;color:var(--s-tekst2);max-width:44rem}
.faq-odp p+p{margin-top:.75rem}
`,
  // --- kroki ---
  'typ:kroki': `
.sek-kroki h3{font-size:1.25rem}
.sek-kroki li p{color:var(--s-tekst2);font-size:.9375rem;margin-top:.5rem}
.krok-czas{font-size:.75rem;font-weight:var(--w-b);letter-spacing:.1em;text-transform:uppercase;color:var(--s-akc)}
`,
  'w:kroki-kolumny': `
.kroki-kol{display:grid;gap:2.5rem 1.75rem}
.kroki-kol li{border-top:1.5px solid var(--s-tekst);padding-top:1.5rem}
.krok-cyfra{display:block;font-family:var(--f-nag);font-size:3.75rem;line-height:1;margin-bottom:1rem;color:transparent;-webkit-text-stroke:1.5px var(--s-tekst)}
@supports not (-webkit-text-stroke:1px){.krok-cyfra{color:var(--s-akc)}}
.kroki-kol .chip{margin-top:1rem}
@media (min-width:640px){.kroki-kol{grid-template-columns:repeat(2,1fr)}}
@media (min-width:1200px){.kroki-3{grid-template-columns:repeat(3,1fr)}}
`,
  'w:kroki-os-czasu': `
.os-czasu{position:relative;display:grid;gap:2.25rem}
.os-czasu::before{content:"";position:absolute;left:1.25rem;top:.5rem;bottom:.5rem;width:1px;background:var(--s-ramka)}
.os-czasu li{display:grid;grid-template-columns:2.5rem 1fr;gap:1.25rem}
.os-punkt{position:relative;display:grid;place-items:center;width:2.5rem;height:2.5rem;border-radius:50%;background:var(--s-btn);color:var(--s-btn-t);font-weight:var(--w-b)}
.os-tresc{padding-top:.35rem}
.os-tresc .krok-czas{margin-bottom:.35rem}
`,
  'w:kroki-ciemne': `
.kroki-pas{display:grid;gap:2.5rem 2rem}
.kroki-pas li{border-top:1px solid var(--s-linia);padding-top:1.5rem}
.krok-nr{display:block;font-family:var(--f-nag);font-size:3rem;line-height:1;color:var(--s-akc)}
.kroki-pas h3{font-family:var(--f-tekst);font-weight:var(--w-b);font-size:1.125rem;letter-spacing:0;margin:1.25rem 0 .35rem}
@media (min-width:640px){.kroki-pas{grid-template-columns:repeat(2,1fr)}}
@media (min-width:960px){.kroki-3{grid-template-columns:repeat(3,1fr)}.kroki-4{grid-template-columns:repeat(4,1fr)}}
`,
  // --- o nas ---
  'typ:onas': `
.wyr-nr{display:block;font-family:var(--f-nag);font-size:1.75rem;line-height:1;color:var(--s-akc);margin-bottom:.6rem}
.sek-onas li h3{font-family:var(--f-tekst);font-weight:var(--w-b);font-size:1rem;letter-spacing:0}
.sek-onas li p{font-size:.875rem;color:var(--s-tekst2);margin-top:.35rem}
`,
  'w:onas-obraz-tekst': `
.onas-siatka{display:grid;gap:var(--odstep);align-items:center}
.onas-tekst .glowa{margin-bottom:1.5rem}
.proza p{color:var(--s-tekst2);font-size:1.0625rem}
.proza p+p{margin-top:1rem}
.wyrozniki-mini{display:grid;gap:1.5rem;margin-top:2.5rem;padding-top:2rem;border-top:1px solid var(--s-linia)}
.onas-media .ob{max-width:32rem}
@media (min-width:640px){.wyrozniki-mini{grid-template-columns:repeat(3,1fr)}}
@media (min-width:960px){.onas-siatka{grid-template-columns:minmax(0,5fr) minmax(0,6fr);gap:clamp(3rem,2rem + 4vw,6rem)}}
`,
  'w:onas-manifest': `
.onas-manifest .glowa{margin-bottom:1.5rem}
.onas-manifest .glowa h2{font-family:var(--f-tekst);font-weight:var(--w-b);font-size:.875rem;letter-spacing:.14em;text-transform:uppercase;color:var(--s-akc)}
.onas-manifest .glowa .nad{display:none}
.manifest{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:clamp(1.75rem,1.2rem + 2.4vw,3.25rem);line-height:1.16;letter-spacing:var(--ls-nag);max-width:64rem;text-wrap:pretty}
.manifest-reszta{columns:2 20rem;column-gap:3rem;margin-top:2.5rem;color:var(--s-tekst2);max-width:56rem}
.manifest-reszta p{break-inside:avoid;margin-bottom:1rem}
.wyrozniki-rzad{display:grid;gap:2rem;grid-template-columns:repeat(auto-fit,minmax(min(100%,14rem),1fr));margin-top:3rem}
.wyrozniki-rzad li{border-top:1px solid var(--s-linia);padding-top:1.25rem}
`,
  'w:onas-wyrozniki': `
.onas-wyrozniki .manifest-reszta{columns:2 20rem;column-gap:3rem;color:var(--s-tekst2);margin-bottom:2.5rem}
.onas-wyrozniki .manifest-reszta p{break-inside:avoid;margin-bottom:1rem}
.wyrozniki-siatka{display:grid;border-top:1px solid var(--s-tekst)}
.wyrozniki-siatka li{padding:1.75rem 0;border-bottom:1px solid var(--s-linia)}
.wyrozniki-siatka .wyr-nr{display:inline-block;font-family:var(--f-tekst);font-weight:var(--w-b);font-size:.75rem;line-height:1;background:var(--akc);color:var(--na-akc);padding:.35rem .5rem;border-radius:4px;margin:0}
.sek-onas .wyrozniki-siatka h3{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:1.375rem;letter-spacing:var(--ls-nag);margin-top:1.25rem;line-height:1.2}
.sek-onas .wyrozniki-siatka p{font-size:.9375rem}
@media (min-width:640px){.wyrozniki-siatka{grid-template-columns:repeat(2,1fr)}.wyrozniki-siatka li{padding:1.75rem 1.5rem;border-bottom:0;border-left:1px solid var(--s-linia)}.wyrozniki-siatka li:nth-child(2n+1){border-left:0;padding-left:0}}
@media (min-width:1200px){.wyrozniki-siatka{grid-template-columns:repeat(4,1fr)}.wyrozniki-siatka li:nth-child(2n+1){border-left:1px solid var(--s-linia);padding-left:1.5rem}.wyrozniki-siatka li:first-child{border-left:0;padding-left:0}}
`,
  // --- kontakt ---
  'typ:kontakt': `
.kontakt-siatka{display:grid;gap:var(--odstep);align-items:start}
.kontakt-lewa .glowa{margin-bottom:1.5rem}
.dane-kontaktowe{display:grid;gap:1.25rem;margin-top:1.75rem}
.dane-kontaktowe li{display:flex;gap:.85rem}
.dane-kontaktowe .ik{color:var(--s-akc);margin-top:.15rem}
.et{display:block;font-size:.75rem;font-weight:var(--w-b);letter-spacing:.1em;text-transform:uppercase;color:var(--s-tekst2);margin-bottom:.25rem}
.godziny-lista div{display:flex;justify-content:space-between;gap:1rem}
.godziny-lista dt{color:var(--s-tekst2)}
.godziny-lista dd{font-weight:var(--w-b);white-space:nowrap}
.mapa{position:relative;overflow:hidden;border-radius:var(--r-karta)}
.mapa-rys{position:relative;height:13rem;background-color:var(--mapa-tlo);background-image:repeating-linear-gradient(0deg,transparent 0 44px,var(--mapa-ul) 44px 50px),repeating-linear-gradient(90deg,transparent 0 68px,var(--mapa-ul) 68px 74px)}
.mapa-ulica{position:absolute;left:-10%;top:52%;width:130%;height:12px;background:var(--mapa-ul);transform:rotate(-12deg)}
.mapa-ulica-2{left:35%;top:-10%;width:12px;height:130%;transform:rotate(18deg)}
.mapa-park{position:absolute;left:62%;top:60%;width:26%;height:30%;background:var(--mapa-park);border-radius:4px}
.mapa-pin{position:absolute;left:38%;top:26%;width:30px;height:30px;background:var(--akc);border-radius:50% 50% 50% 0;transform:rotate(-45deg);box-shadow:0 6px 14px -4px rgba(0,0,0,.5)}
.mapa-pin::after{content:"";position:absolute;left:10px;top:10px;width:10px;height:10px;border-radius:50%;background:var(--na-akc)}
.mapa-etykieta{position:absolute;left:calc(38% + 40px);top:calc(26% + 3px);max-width:calc(62% - 52px);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.8125rem;font-weight:var(--w-b);background:var(--s-karta);color:var(--s-tekst);padding:.15rem .6rem;border-radius:4px}
.mapa-link{position:absolute;right:.75rem;bottom:.75rem;background:var(--s-btn);color:var(--s-btn-t);font-weight:var(--w-b);font-size:.875rem;padding:.6rem 1rem;border-radius:var(--r-btn);text-decoration:none}
.mapa-link:hover{text-decoration:underline}
.kontakt-lewa .mapa{margin-top:1.75rem}
@media (min-width:640px){.dane-kontaktowe{grid-template-columns:1fr 1fr}}
@media (min-width:960px){.kontakt-siatka{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:clamp(3rem,2rem + 4vw,5rem)}}
`,
  'w:kontakt-minimalny': `
.kontakt-min{display:grid;gap:var(--odstep)}
.duze-linki{display:grid;gap:.5rem;margin-top:1rem}
.duzy-link{font-family:var(--f-nag);font-weight:var(--w-nag);font-size:clamp(1.375rem,.9rem + 2.6vw,3rem);line-height:1.15;letter-spacing:var(--ls-nag);text-decoration:none;overflow-wrap:anywhere;width:fit-content;max-width:100%}
.duzy-link:hover{text-decoration:underline;text-decoration-thickness:2px}
.kontakt-male{display:flex;flex-wrap:wrap;gap:1.5rem 3rem;margin-top:2.5rem;font-size:.9375rem}
.kontakt-min-prawa{container-type:inline-size}
@media (min-width:960px){.kontakt-min{grid-template-columns:minmax(0,1.1fr) minmax(0,.9fr);align-items:end}}
`,
  'w:kontakt-karta': `
.kontakt-karta .dane-kontaktowe{grid-template-columns:1fr}
`,
  // --- cta ---
  'typ:cta': `
.sek-cta .wstep{margin-top:.75rem}
.sek-cta .akcje{margin-top:0}
`,
  'w:cta-pasek': `
.sek-cta.cta-pasek{padding-block:clamp(2.5rem,2rem + 2vw,4rem)}
.cta-rzad{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:1.5rem 3rem}
.cta-pasek h2{font-size:clamp(1.5rem,1.2rem + 1.3vw,2.25rem)}
`,
  'w:cta-pelny': `
.cta-siatka{display:grid;gap:2rem;align-items:center}
.cta-pelny h2{font-size:calc(var(--fs-h1) * .82)}
.cta-pelny .wstep{font-size:var(--fs-lead)}
@media (min-width:960px){.cta-siatka{grid-template-columns:minmax(0,1.7fr) minmax(0,1fr)}.cta-pelny .akcje{flex-direction:column;align-items:stretch}}
`,
  'w:cta-karta': `
.cta-pudelko{position:relative;overflow:hidden;display:grid;gap:2rem;align-items:center;background:var(--s-tlo);color:var(--s-tekst);border-radius:calc(var(--r-karta) * 1.4);padding:clamp(2rem,1.5rem + 3vw,4.5rem)}
.cta-pudelko::after{content:"";position:absolute;right:-6rem;top:-6rem;width:18rem;height:18rem;border-radius:50%;border:1px solid var(--s-linia);box-shadow:0 0 0 2.5rem color-mix(in srgb,var(--s-tekst) 4%,transparent),0 0 0 5rem color-mix(in srgb,var(--s-tekst) 3%,transparent);pointer-events:none}
.cta-pudelko>*{position:relative;z-index:1}
.cta-pudelko h2{font-size:clamp(1.75rem,1.3rem + 2vw,3rem)}
@media (min-width:960px){.cta-pudelko{grid-template-columns:minmax(0,1.6fr) auto}}
`,
  // --- produkty (Pro) ---
  'typ:produkty': `
.produkt-media{position:relative}
.produkt-media .odznaka{position:absolute;top:.75rem;left:.75rem;background:var(--ciemne);color:var(--na-ciemnym)}
.produkt-glowa{display:flex;justify-content:space-between;align-items:baseline;gap:1rem;margin-top:1.1rem}
.produkt h3{font-size:1.3125rem}
.produkt-cena{font-weight:var(--w-b);white-space:nowrap}
.produkt-opis{font-size:.875rem;color:var(--s-tekst2);margin-top:.35rem}
.produkt .btn{margin-top:1rem;min-height:2.75rem;padding:.5rem 1.25rem;font-size:.9375rem}
`,
  'w:produkty-siatka': `
.produkty-kafle{display:grid;gap:2.5rem 1.5rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))}
.produkty-kafle.mob-tor{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;gap:1rem;margin-inline:calc(-1 * var(--kont-px));padding-inline:var(--kont-px);scroll-padding-inline:var(--kont-px);padding-bottom:1rem}
.mob-tor>li{flex:0 0 78%;scroll-snap-align:start}
@media (min-width:640px){.produkty-kafle.mob-tor{display:grid;overflow:visible;scroll-snap-type:none;gap:2.5rem 1.5rem;margin-inline:0;padding-inline:0;padding-bottom:0}}
@media (min-width:960px){.produkty-kafle{grid-template-columns:repeat(3,1fr)}}
`,
  'w:produkty-lista': `
.produkty-wiersze li{display:grid;gap:1.5rem;padding-block:2rem;border-top:1px solid var(--s-linia)}
.produkty-wiersze h3{font-size:clamp(1.5rem,1.2rem + 1vw,2rem)}
.produkty-wiersze .produkt-opis{font-size:1rem;max-width:32rem}
@media (min-width:960px){.produkty-wiersze li{grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:3rem;align-items:center}}
`,
  // --- blog (Pro) ---
  'typ:blog': `
.wpis h3{font-size:clamp(1.375rem,1.2rem + .6vw,1.75rem);line-height:1.15}
.wpis h3 a{text-decoration:none}
.wpis h3 a:hover{text-decoration:underline;text-decoration-thickness:1.5px}
.wpis-lead{color:var(--s-tekst2);font-size:.9375rem;margin-top:.75rem}
.wiecej{display:inline-block;margin-top:1rem;font-size:.875rem;font-weight:var(--w-b);text-decoration:none;border-bottom:1px solid currentColor}
`,
  'w:blog-karty': `
.wpisy-karty{display:grid;gap:2.5rem 1.5rem;grid-template-columns:repeat(auto-fill,minmax(min(100%,17rem),1fr))}
.wpisy-karty .ob{margin-bottom:1.25rem}
@media (min-width:960px){.wpisy-karty{grid-template-columns:repeat(3,1fr)}}
`,
  'w:blog-edytorski': `
.wpisy-edytorskie{display:grid;gap:2.5rem 2.5rem}
.wpisy-edytorskie li{border-top:1px solid var(--s-tekst);padding-top:1.25rem}
.wpisy-edytorskie h3{font-size:clamp(1.5rem,1.2rem + 1vw,2rem);line-height:1.1}
@media (min-width:960px){.wpisy-edytorskie{grid-template-columns:repeat(3,1fr)}}
`,
};

const EFEKTY: Record<string, string> = {
  'ef:pojawianie': `
.js-anim .pojaw{opacity:0;transform:translateY(var(--anim-dy));transition:opacity var(--anim-t) ease,transform var(--anim-t) cubic-bezier(.2,.7,.2,1)}
.js-anim .pojaw.widoczne{opacity:1;transform:none}
`,
  'ef:wejscie-naglowka': `
@keyframes slowo{from{opacity:0;transform:translateY(.45em)}to{opacity:1;transform:none}}
.ef-wejscie .hero-h .sl{display:inline-block;animation:slowo var(--anim-t) cubic-bezier(.2,.7,.2,1) both}
${Array.from({ length: 24 }, (_, i) => `.ef-wejscie .hero-h .d${i}{animation-delay:calc(var(--anim-krok) * ${i})}`).join('\n')}
`,
  'ef:mikrointerakcje': `
.ef-mikro .btn:hover{transform:translateY(-2px)}
.ef-mikro .btn:active{transform:translateY(0)}
.ef-mikro .nav a{text-decoration:none;background:linear-gradient(currentColor,currentColor) 0 100%/0 1.5px no-repeat;transition:background-size .3s}
.ef-mikro .nav a:hover,.ef-mikro .nav a[aria-current]{background-size:100% 1.5px}
.ef-mikro .karta:hover,.ef-mikro .karta-opinii:hover{transform:translateY(-4px);box-shadow:var(--cien)}
.ef-mikro .ob img{transition:transform .7s cubic-bezier(.2,.7,.2,1)}
.ef-mikro li:hover>.ob img,.ef-mikro .ob a:hover img,.ef-mikro .produkt:hover img{transform:scale(1.035)}
.ef-mikro .karuzela-btn:hover{transform:scale(1.06)}
.ef-mikro .faq-el summary:hover h3{color:var(--s-akc)}
`,
  'ef:paralaksa': `
@supports (animation-timeline:view()){
  @keyframes paralaksa{from{transform:translateY(-7%) scale(1.16)}to{transform:translateY(7%) scale(1.16)}}
  .ef-paralaksa .hero-media .ob img,.ef-paralaksa .hero-media .ph svg,.ef-paralaksa .hero-tlo img,.ef-paralaksa .hero-tlo .ph svg,.ef-paralaksa .ob-paralaksa img,.ef-paralaksa .ob-paralaksa .ph svg{animation:paralaksa linear both;animation-timeline:view();animation-range:cover}
}
`,
  'ef:tasma': `
@keyframes tasma{to{transform:translateX(-50%)}}
.tasma{overflow:hidden;background:var(--akc);color:var(--na-akc);padding-block:1rem}
.tasma-tor{display:flex;width:max-content;animation:tasma 45s linear infinite}
.tasma li{display:flex;align-items:center;gap:2.5rem;padding-right:2.5rem;font-family:var(--f-nag);font-weight:var(--w-nag);font-size:clamp(1.125rem,1rem + .8vw,1.625rem);white-space:nowrap;letter-spacing:var(--ls-nag)}
.tasma li::after{content:"";width:.5rem;height:.5rem;border-radius:50%;background:currentColor;opacity:.6}
.tasma:hover .tasma-tor{animation-play-state:paused}
`,
  'ef:pasek-cta-mobile': `
.pasek-cta{position:fixed;left:0;right:0;bottom:0;z-index:60;display:flex;gap:.5rem;padding:.6rem var(--kont-px) calc(.6rem + env(safe-area-inset-bottom));background:var(--s-tlo);border-top:1px solid var(--s-linia);box-shadow:0 -12px 30px -20px rgba(0,0,0,.4)}
.pasek-cta .btn{flex:1;min-height:3rem;padding-inline:1rem}
body.z-paskiem{padding-bottom:4.75rem}
@media (min-width:960px){.pasek-cta{display:none}body.z-paskiem{padding-bottom:0}}
`,
  'ef:postep-czytania': `
.postep{position:fixed;top:0;left:0;right:0;height:3px;z-index:70;pointer-events:none}
.postep span{display:block;height:100%;background:var(--akc);transform-origin:0 50%;transform:scaleX(0)}
@keyframes postep{to{transform:scaleX(1)}}
@supports (animation-timeline:scroll()){.postep span{animation:postep linear both;animation-timeline:scroll(root)}}
`,
  'ef:lightbox': `
.lightbox{max-width:min(94vw,82rem);max-height:94vh;width:auto;padding:0;border:0;background:transparent;color:#fff;overflow:visible}
.lightbox::backdrop{background:rgba(8,10,12,.88)}
.lightbox img{max-width:min(94vw,82rem);max-height:84vh;width:auto;height:auto;margin-inline:auto;border-radius:4px}
.lightbox p{text-align:center;margin-top:.75rem;font-size:.875rem;color:#e8e8e8}
.lightbox button{position:fixed;display:grid;place-items:center;width:3rem;height:3rem;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(0,0,0,.45);color:#fff;cursor:pointer}
.lightbox button:focus-visible{outline:3px solid #fff;outline-offset:2px}
.lb-zamknij{top:1rem;right:1rem}.lb-wstecz{left:1rem;top:50%}.lb-dalej{right:1rem;top:50%}
`,
};

const RUCH = `
html.plynnie{scroll-behavior:smooth}
@media (prefers-reduced-motion:reduce){
  html.plynnie{scroll-behavior:auto}
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;animation-delay:0s!important;transition-duration:.01ms!important}
  .js-anim .pojaw{opacity:1!important;transform:none!important}
  .postep{display:none}
  .tasma-tor,.hero-media .ob img,.hero-media .ph svg,.hero-tlo img,.hero-tlo .ph svg,.ob-paralaksa img,.ob-paralaksa .ph svg{animation:none!important;transform:none!important}
  .ef-wejscie .hero-h .sl{animation:none!important;opacity:1!important;transform:none!important}
}
`;

/** Arkusz z bazą, tokenami, @font-face i modułami użytymi na którejkolwiek podstronie. */
export function budujCss(s: KontekstStrony, bazaFontowCss: string): string {
  const czesci = [`/* Verris Kreator – arkusz strony (wygenerowany) */`, regulyFontFace(s.fonty, bazaFontowCss), tokeny(s), BAZA];
  const kolejnosc = Object.keys(MODULY);
  for (const klucz of kolejnosc) if (s.css.has(klucz)) czesci.push(MODULY[klucz]!);
  for (const [klucz, css] of Object.entries(EFEKTY)) if (s.css.has(klucz)) czesci.push(css);
  czesci.push(RUCH);
  return czesci.join('\n').replace(/\n{2,}/g, '\n');
}

export const MODULY_CSS = Object.keys(MODULY);

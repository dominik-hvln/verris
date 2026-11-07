/**
 * assets/kreator.js – zachowania stron z kreatora. Vanilla ES2020, bez bibliotek, bez eval i bez
 * wstrzykiwania HTML (CSP: script-src 'self'). Dołączane są tylko moduły potrzebne danej stronie.
 * Bez JS strona działa: menu jest listą przewijaną, karuzele przewija się gestem, treść jest widoczna.
 */
const START = `(function () {
  'use strict';
  var d = document, h = d.documentElement;
  var ruch = !window.matchMedia || !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  h.classList.add('js');
  var gotowe = function (f) { if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', f); else f(); };
`;

const MODULY: Record<string, string> = {
  menu: `
  // Menu mobilne: przycisk z aria-expanded, Esc zamyka i oddaje fokus, klik w link zamyka.
  gotowe(function () {
    var nag = d.querySelector('.naglowek'), btn = d.querySelector('.menu-btn'), nav = d.getElementById('menu-glowne');
    if (!nag || !btn || !nav) return;
    var ustaw = function (otw, fokus) {
      nag.classList.toggle('otwarte', otw);
      btn.setAttribute('aria-expanded', String(otw));
      if (otw) { var a = nav.querySelector('a'); if (a) a.focus(); } else if (fokus) btn.focus();
    };
    btn.addEventListener('click', function () { ustaw(btn.getAttribute('aria-expanded') !== 'true', false); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) ustaw(false, false); });
    d.addEventListener('keydown', function (e) { if (e.key === 'Escape' && nag.classList.contains('otwarte')) ustaw(false, true); });
    d.addEventListener('click', function (e) { if (nag.classList.contains('otwarte') && !nag.contains(e.target)) ustaw(false, false); });
  });
`,
  naglowek: `
  // Przyklejony nagłówek zmniejsza się po przewinięciu.
  gotowe(function () {
    var nag = d.querySelector('.naglowek.przyklejony');
    if (!nag) return;
    var stan = false;
    var sprawdz = function () { var s = window.scrollY > 24; if (s !== stan) { stan = s; nag.classList.toggle('zwiniety', s); } };
    window.addEventListener('scroll', sprawdz, { passive: true });
    sprawdz();
  });
`,
  pojawianie: `
  // Płynne pojawianie: klasa js-anim dopiero z JS, więc bez JS treść jest widoczna od razu.
  if (ruch && 'IntersectionObserver' in window) {
    gotowe(function () {
      var el = [].slice.call(d.querySelectorAll('.pojaw'));
      var wys = window.innerHeight;
      el.forEach(function (x) { if (x.getBoundingClientRect().top < wys) x.classList.add('widoczne'); });
      h.classList.add('js-anim');
      var io = new IntersectionObserver(function (wpisy) {
        wpisy.forEach(function (w) { if (w.isIntersecting) { w.target.classList.add('widoczne'); io.unobserve(w.target); } });
      }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
      el.forEach(function (x) { if (!x.classList.contains('widoczne')) io.observe(x); });
    });
  }
`,
  karuzela: `
  // Karuzele: przyciski przewijają tor o szerokość elementu; stan przycisków na krańcach.
  gotowe(function () {
    [].slice.call(d.querySelectorAll('.sek')).forEach(function (sek) {
      var tor = sek.querySelector('.karuzela-tor'), btny = sek.querySelectorAll('.karuzela-btn');
      if (!tor || !btny.length) return;
      var krok = function () { var e = tor.firstElementChild; return e ? e.getBoundingClientRect().width + 16 : tor.clientWidth; };
      var stan = function () {
        var max = tor.scrollWidth - tor.clientWidth - 2;
        btny[0].disabled = tor.scrollLeft <= 2;
        if (btny[1]) btny[1].disabled = tor.scrollLeft >= max;
      };
      [].slice.call(btny).forEach(function (b) {
        b.addEventListener('click', function () {
          tor.scrollBy({ left: Number(b.getAttribute('data-kierunek')) * krok(), behavior: ruch ? 'smooth' : 'auto' });
        });
      });
      tor.addEventListener('scroll', stan, { passive: true });
      window.addEventListener('resize', stan);
      stan();
    });
  });
`,
  lightbox: `
  // Powiększanie zdjęć w <dialog>: strzałki, Esc (natywnie), fokus wraca do miniatury.
  gotowe(function () {
    var linki = [].slice.call(d.querySelectorAll('a.lb'));
    if (!linki.length || typeof HTMLDialogElement !== 'function') return;
    var dlg = d.createElement('dialog'), img = d.createElement('img'), opis = d.createElement('p');
    dlg.className = 'lightbox';
    dlg.setAttribute('aria-label', 'Powiększone zdjęcie');
    var przycisk = function (klasa, etykieta, znak) {
      var b = d.createElement('button'); b.type = 'button'; b.className = klasa; b.setAttribute('aria-label', etykieta); b.textContent = znak; dlg.appendChild(b); return b;
    };
    dlg.appendChild(img); dlg.appendChild(opis);
    var zamknij = przycisk('lb-zamknij', 'Zamknij', '\\u00d7');
    var wstecz = przycisk('lb-wstecz', 'Poprzednie zdjęcie', '\\u2039');
    var dalej = przycisk('lb-dalej', 'Następne zdjęcie', '\\u203a');
    d.body.appendChild(dlg);
    var i = 0, zrodlo = null;
    var pokaz = function (n) {
      i = (n + linki.length) % linki.length;
      var a = linki[i], mini = a.querySelector('img');
      img.src = a.getAttribute('href'); img.alt = mini ? mini.alt : '';
      opis.textContent = a.getAttribute('data-podpis') || '';
      wstecz.hidden = dalej.hidden = linki.length < 2;
    };
    linki.forEach(function (a, n) {
      a.addEventListener('click', function (e) { e.preventDefault(); zrodlo = a; pokaz(n); dlg.showModal(); zamknij.focus(); });
    });
    zamknij.addEventListener('click', function () { dlg.close(); });
    wstecz.addEventListener('click', function () { pokaz(i - 1); });
    dalej.addEventListener('click', function () { pokaz(i + 1); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('keydown', function (e) { if (e.key === 'ArrowLeft') pokaz(i - 1); if (e.key === 'ArrowRight') pokaz(i + 1); });
    dlg.addEventListener('close', function () { if (zrodlo) zrodlo.focus(); });
  });
`,
  przelacznik: `
  // Przełącznik cen miesięcznie / rocznie.
  gotowe(function () {
    [].slice.call(d.querySelectorAll('.przelacznik')).forEach(function (grupa) {
      var sek = grupa.closest('.sek'), btny = [].slice.call(grupa.querySelectorAll('button'));
      var wybierz = function (okres) {
        btny.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-okres') === okres)); });
        [].slice.call(sek.querySelectorAll('[data-okres]')).forEach(function (el) {
          if (el.tagName === 'BUTTON') return;
          el.classList.toggle('ukryty-okres', el.getAttribute('data-okres') !== okres);
        });
      };
      btny.forEach(function (b) { b.addEventListener('click', function () { wybierz(b.getAttribute('data-okres')); }); });
      wybierz('miesiac');
    });
  });
`,
  postep: `
  // Postęp czytania – zapas dla przeglądarek bez CSS scroll-driven animations.
  if (!(window.CSS && CSS.supports && CSS.supports('animation-timeline: scroll()'))) {
    gotowe(function () {
      var pasek = d.querySelector('.postep span');
      if (!pasek) return;
      var czeka = false;
      var licz = function () {
        czeka = false;
        var max = h.scrollHeight - window.innerHeight;
        pasek.style.transform = 'scaleX(' + (max > 0 ? Math.min(1, window.scrollY / max) : 1) + ')';
      };
      window.addEventListener('scroll', function () { if (!czeka) { czeka = true; requestAnimationFrame(licz); } }, { passive: true });
      licz();
    });
  }
`,
};

export const MODULY_JS = Object.keys(MODULY);

/** Skrypt z wybranymi modułami albo null, gdy strona nie potrzebuje JS. */
export function budujSkrypt(moduly: Set<string>): string | null {
  const wybrane = MODULY_JS.filter((m) => moduly.has(m));
  if (!wybrane.length) return null;
  return `/* Verris Kreator – zachowania strony */\n${START}${wybrane.map((m) => MODULY[m]).join('')}})();\n`;
}

/**
 * Mostek „edycji na stronie” (paczka 122): mały skrypt dołączany do podglądu edytora TYLKO w trybie edycji
 * (trasa podglądu panelu, `edycja=1|zaznacz`). Nigdy w publikacji ani w ZIP – renderer go nie dołącza, robi to
 * trasa podglądu. Ramka działa w sandboxie bez allow-same-origin, więc mostek rozmawia z edytorem wyłącznie przez
 * postMessage (protokół v:1, kontrakt paczki 122 pkt 4), a edytor sprawdza `event.source` i każdą ścieżkę.
 *
 * Zasady:
 * - zmienia DOM wyłącznie elementów edycji ([data-k], [data-k-obraz], [data-k-formularz], [data-k-sekcja] – atrybuty,
 *   contenteditable, tekst) i własnego paska w Shadow DOM (style strony go nie psują, jego style nie psują strony);
 * - żadnego innerHTML z danych: tekst przez textContent / węzły tekstowe, przywracanie przez klony węzłów;
 * - wklejanie i upuszczanie zawsze jako czysty tekst, limit znaków z `data-k-max` (schemat zod modelu);
 * - tryb 'zaznacz' (telefon): stuknięcie w tekst nie otwiera edycji w ramce – edytor otwiera pole formularza.
 *
 * Kod mostka to zwykły ES2017 w łańcuchu (bez transpilacji i zależności); testy w jsdom: panel
 * (apps/client-panel/src/app/api/kreator/podglad/most.spec.ts).
 */

export interface OpcjeMostu {
  /** 'edycja' – tekst w miejscu (komputer, tablet); 'zaznacz' – stuknięcie wysyła ścieżkę pola do edytora (telefon). */
  tryb: 'edycja' | 'zaznacz';
}

/** Style strony w trybie edycji: obrys przy najechaniu, edytowany element, nowe linie w polach wielowierszowych. */
export const STYL_MOSTU =
  '[data-k]{cursor:text;border-radius:2px}' +
  '[data-k]:hover{outline:2px solid rgba(31,168,113,.55);outline-offset:3px}' +
  '[data-k]:focus-visible{outline:3px solid #1fa871;outline-offset:3px}' +
  '[data-k-edycja]{outline:2px solid #1fa871!important;outline-offset:3px;background-color:rgba(31,168,113,.07);caret-color:currentColor}' +
  '[data-k-wiele]{white-space:pre-line}' +
  '[data-k-obraz],[data-k-formularz]{cursor:pointer}' +
  '[data-k-obraz]:hover,[data-k-obraz]:focus-visible{outline:3px solid #1fa871;outline-offset:-3px}' +
  '[data-k-formularz]:hover,[data-k-formularz]:focus-visible{outline:2px dashed #1fa871;outline-offset:3px}' +
  'html.k-zaznacz [data-k]{cursor:pointer}';

/** Style paska w Shadow DOM. */
const STYL_PASKA = String.raw`
:host{all:initial}
*{box-sizing:border-box}
.pasek,.licznik,.obraz{position:absolute;width:max-content;transform-origin:0 0;font:500 13px/1.2 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:#f4f4ee;z-index:1}
.pasek{display:flex;flex-wrap:wrap;gap:2px;padding:4px;background:#0c1a14;border:1px solid rgba(255,255,255,.14);border-radius:10px;box-shadow:0 12px 30px -12px rgba(0,0,0,.55);max-width:calc(100vw - 16px)}
.pasek[hidden],.licznik[hidden],.obraz[hidden]{display:none}
button{all:unset;box-sizing:border-box;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:6px 10px;border-radius:7px;cursor:pointer;color:#f4f4ee;font:inherit;white-space:nowrap}
button:hover{background:rgba(255,255,255,.12)}
button:focus-visible{outline:2px solid #5fd3a1;outline-offset:1px}
button[aria-disabled="true"]{opacity:.45;cursor:default}
button.ai{color:#5fd3a1}
.pasek.kompakt button span{display:none}
.pasek.kompakt button{padding:6px 9px}
svg{width:15px;height:15px;flex:none}
.licznik{white-space:nowrap;padding:3px 8px;border-radius:999px;background:#0c1a14;font:600 12px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace}
.licznik.pelny{background:#b3261e}
.obraz button{background:#0c1a14;border:1px solid rgba(255,255,255,.18);box-shadow:0 10px 24px -12px rgba(0,0,0,.6)}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:no-preference){.pasek,.licznik,.obraz{transition:opacity .12s ease}}
@media (pointer:coarse){button{min-height:44px;padding:10px 12px}}
`;

/** Kod mostka (JS przeglądarki). Konfiguracja wstawiona jako JSON (bez danych modelu). */
const KOD = String.raw`(function () {
  'use strict';
  var D = __KONFIG__;
  var d = document, w = window;
  if (w.__verrisMost) return;
  w.__verrisMost = 1;
  var tylkoZaznacz = D.tryb !== 'edycja';
  if (tylkoZaznacz) d.documentElement.classList.add('k-zaznacz');
  var NIEWIDOCZNE = new RegExp('[\\x00-\\x08\\x0b-\\x1f\\x7f-\\x9f' + String.fromCharCode(0x200b, 0x2028, 0x2029, 0xfeff) + ']', 'g');
  var TWARDE = new RegExp('[\\xa0' + String.fromCharCode(0x202f, 0x2007) + ']', 'g');
  var SVG = 'http://www.w3.org/2000/svg';

  function wyslij(m) { m.v = 1; try { w.parent.postMessage(m, '*'); } catch (x) { /* brak rodzica */ } }
  function atr(el, n) { return el && el.getAttribute ? el.getAttribute(n) : null; }
  function najblizszy(el, sel) { return el && el.closest ? el.closest(sel) : null; }
  function sekcjaElementu(el) { return najblizszy(el, '[data-k-sekcja]'); }
  function idSekcji(s) { return s ? atr(s, 'data-k-sekcja') : null; }
  function limit(el) { var n = parseInt(atr(el, 'data-k-max') || '', 10); return n > 0 ? n : 5000; }
  function wiele(el) { return atr(el, 'data-k-wiele') === '1'; }
  function wszystkie(sel, a, wartosc) {
    var lista = d.querySelectorAll(sel), wynik = [];
    for (var i = 0; i < lista.length; i++) if (atr(lista[i], a) === wartosc) wynik.push(lista[i]);
    return wynik;
  }

  /** Tekst elementu: węzły tekstowe, <br> i bloki (z zapasowego contenteditable) jako nowe linie. */
  function tekstElementu(el) {
    var t = '';
    (function przejdz(n) {
      for (var c = n.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) t += c.nodeValue;
        else if (c.nodeType === 1) {
          var tag = c.nodeName;
          if (tag === 'BR') { t += '\n'; continue; }
          var blok = tag === 'DIV' || tag === 'P';
          if (blok && t && t.charAt(t.length - 1) !== '\n') t += '\n';
          przejdz(c);
        }
      }
    })(el);
    return t;
  }
  function oczysc(t, el) {
    t = String(t).replace(/\r\n?/g, '\n').replace(TWARDE, ' ');
    t = wiele(el) ? t.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{3,}/g, '\n\n') : t.replace(/\n+/g, ' ');
    t = t.replace(/[ \t]{2,}/g, ' ').replace(NIEWIDOCZNE, '').replace(/^\s+|\s+$/g, '');
    var m = limit(el);
    if (t.length > m) { t = t.slice(0, m); if (/[\ud800-\udbff]$/.test(t)) t = t.slice(0, -1); t = t.replace(/\s+$/, ''); }
    return t;
  }

  // ---- pasek w Shadow DOM ------------------------------------------------------------------------------------
  var host = d.createElement('verris-edycja');
  host.setAttribute('data-k-most', '');
  host.style.cssText = 'position:absolute!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;display:block!important';
  var cien = host.attachShadow ? host.attachShadow({ mode: 'open' }) : null;
  function el(tag, a, tekst) {
    var e = d.createElement(tag);
    for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) e.setAttribute(k, a[k]);
    if (tekst) e.textContent = tekst;
    return e;
  }
  function ikona(sciezka) {
    var s = d.createElementNS(SVG, 'svg');
    s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('fill', 'none');
    s.setAttribute('stroke', 'currentColor'); s.setAttribute('stroke-width', '2'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
    var p = d.createElementNS(SVG, 'path'); p.setAttribute('d', sciezka); s.appendChild(p);
    return s;
  }
  var POLECENIA = [
    ['w-gore', 'W górę', 'Przenieś sekcję w górę', 'M12 19V5M5 12l7-7 7 7', ''],
    ['w-dol', 'W dół', 'Przenieś sekcję w dół', 'M12 5v14M19 12l-7 7-7-7', ''],
    ['ukryj', 'Ukryj', 'Ukryj sekcję na stronie', 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 4.2A10 10 0 0 1 12 4c5 0 9 5 10 8a13 13 0 0 1-2.2 3.3M6.6 6.6A13 13 0 0 0 2 12c1 3 5 8 10 8a9.7 9.7 0 0 0 5.4-1.6', ''],
    ['ai', 'Zmień z AI', 'Zmień sekcję z pomocą AI', 'M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z', 'ai'],
    ['opcje', 'Więcej opcji', 'Więcej opcji sekcji w panelu edycji', 'M5 12h.01M12 12h.01M19 12h.01', '']
  ];
  var pasek = el('div', { 'class': 'pasek', role: 'toolbar', 'aria-label': 'Działania sekcji', hidden: '' });
  var przyciski = [];
  POLECENIA.forEach(function (p) {
    var b = el('button', { type: 'button', 'data-polecenie': p[0], 'aria-label': p[2], title: p[2] });
    if (p[4]) b.className = p[4];
    b.appendChild(ikona(p[3]));
    b.appendChild(el('span', {}, p[1]));
    pasek.appendChild(b);
    przyciski.push(b);
  });
  var licznik = el('div', { 'class': 'licznik', hidden: '', 'aria-hidden': 'true' });
  var pasekObrazu = el('div', { 'class': 'obraz', hidden: '' });
  var przyciskObrazu = el('button', { type: 'button' });
  przyciskObrazu.appendChild(ikona('M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z'));
  przyciskObrazu.appendChild(el('span', {}, 'Zmień zdjęcie'));
  pasekObrazu.appendChild(przyciskObrazu);
  var komunikat = el('div', { 'class': 'sr', role: 'status', 'aria-live': 'polite' });
  if (cien) {
    cien.appendChild(el('style', {}, D.styl));
    cien.appendChild(pasek); cien.appendChild(licznik); cien.appendChild(pasekObrazu); cien.appendChild(komunikat);
  }
  function oglos(t) { komunikat.textContent = ''; setTimeout(function () { komunikat.textContent = t; }, 30); }

  var zaznaczona = null, edytowany = null, obrazPodKursorem = null, ostatniFokus = null;
  // Edytor pokazuje ramkę pomniejszoną (np. 0,6) – pasek i licznik powiększamy odwrotnie, żeby zostały czytelne.
  var powiekszenie = 1;
  function ustawSkale(skala) {
    powiekszenie = Math.min(2.5, Math.max(1, 1 / skala));
    var t = powiekszenie === 1 ? '' : 'scale(' + powiekszenie + ')';
    pasek.style.transform = t; licznik.style.transform = t; pasekObrazu.style.transform = t;
    odswiez();
  }
  function wysokosc(e, zapas) { var r = e.getBoundingClientRect(); return r.height || zapas * powiekszenie; }
  function szerokosc(e, zapas) { var r = e.getBoundingClientRect(); return r.width || zapas * powiekszenie; }

  function poloz(e, x, y) { e.style.left = Math.max(4, Math.round(x)) + 'px'; e.style.top = Math.max(4, Math.round(y)) + 'px'; }
  function polozPasek() {
    if (!zaznaczona || !d.contains(zaznaczona)) { pasek.hidden = true; return; }
    pasek.hidden = false;
    // Wąska strona (podgląd telefonu): same ikony (nazwy zostają w aria-label i title), pasek przy prawej krawędzi.
    var kompakt = w.innerWidth < 640;
    pasek.classList.toggle('kompakt', kompakt);
    var r = zaznaczona.getBoundingClientRect(), h = wysokosc(pasek, 42);
    var y = r.top - h - 8;
    // Za mało miejsca nad sekcją (początek strony, sekcja przewinięta) – pasek wewnątrz sekcji, u góry widoku.
    if (y < 8) y = Math.min(Math.max(r.top, 0) + 8, r.bottom - h - 8);
    poloz(pasek, (kompakt ? r.right - szerokosc(pasek, 230) - 8 : r.left + 12) + w.scrollX, y + w.scrollY);
    var lista = zaznaczona.parentNode ? zaznaczona.parentNode.querySelectorAll('[data-k-sekcja]') : [];
    przyciski[0].setAttribute('aria-disabled', lista[0] === zaznaczona ? 'true' : 'false');
    przyciski[1].setAttribute('aria-disabled', lista[lista.length - 1] === zaznaczona ? 'true' : 'false');
  }
  function polozLicznik() {
    if (!edytowany) { licznik.hidden = true; return; }
    var e = edytowany.el, m = limit(e), n = tekstElementu(e).replace(TWARDE, ' ').length;
    licznik.textContent = n + ' / ' + m;
    licznik.classList.toggle('pelny', n >= m);
    licznik.hidden = false;
    var r = e.getBoundingClientRect();
    poloz(licznik, r.right + w.scrollX - szerokosc(licznik, 70), r.bottom + w.scrollY + 6);
  }
  function polozObraz() {
    if (!obrazPodKursorem || !d.contains(obrazPodKursorem)) { pasekObrazu.hidden = true; return; }
    var r = obrazPodKursorem.getBoundingClientRect();
    pasekObrazu.hidden = false;
    poloz(pasekObrazu, r.left + w.scrollX + 10, r.top + w.scrollY + 10);
  }
  var klatka = 0;
  function odswiez() {
    if (klatka) return;
    klatka = (w.requestAnimationFrame || setTimeout)(function () { klatka = 0; polozPasek(); polozLicznik(); polozObraz(); });
  }

  function zaznacz(s, wyslac) {
    if (zaznaczona && zaznaczona !== s) zaznaczona.removeAttribute('data-kreator-zaznaczona');
    zaznaczona = s || null;
    if (s) s.setAttribute('data-kreator-zaznaczona', '');
    polozPasek();
    if (wyslac && s) wyslij({ typ: 'zaznacz', sekcja: idSekcji(s) });
  }

  // ---- edycja tekstu -----------------------------------------------------------------------------------------
  var wspieraZwykly = (function () {
    var t = d.createElement('div');
    try { t.contentEditable = 'plaintext-only'; } catch (x) { return false; }
    return t.contentEditable === 'plaintext-only';
  })();

  function kursorWPunkcie(x, y) {
    try {
      if (d.caretPositionFromPoint) { var p = d.caretPositionFromPoint(x, y); if (p) { var r = d.createRange(); r.setStart(p.offsetNode, p.offset); return r; } }
      if (d.caretRangeFromPoint) return d.caretRangeFromPoint(x, y);
    } catch (x2) { /* brak API */ }
    return null;
  }
  function ustawKursor(e, r) {
    var sel = w.getSelection ? w.getSelection() : null;
    if (!sel) return;
    if (!r || !e.contains(r.startContainer)) { r = d.createRange(); r.selectNodeContents(e); r.collapse(false); }
    sel.removeAllRanges(); sel.addRange(r);
  }

  var ATRYBUTY_EDYCJI = ['role', 'aria-label', 'aria-multiline', 'spellcheck', 'contenteditable'];
  function zacznij(e, x, y) {
    if (tylkoZaznacz) return;
    if (edytowany && edytowany.el === e) return;
    if (edytowany) zakoncz(true);
    var oryginal = [];
    for (var n = e.firstChild; n; n = n.nextSibling) oryginal.push(n.cloneNode(true));
    var poprzednie = {};
    ATRYBUTY_EDYCJI.forEach(function (a) { poprzednie[a] = atr(e, a); });
    edytowany = { el: e, oryginal: oryginal, start: oczysc(tekstElementu(e), e), poprzednie: poprzednie, zapas: !wspieraZwykly };
    e.setAttribute('contenteditable', wspieraZwykly ? 'plaintext-only' : 'true');
    e.setAttribute('role', 'textbox');
    if (wiele(e)) e.setAttribute('aria-multiline', 'true');
    e.setAttribute('aria-label', wiele(e) ? 'Edycja tekstu. Enter – nowa linia, kliknięcie obok zapisuje, Escape cofa.' : 'Edycja tekstu. Enter zapisuje, Escape cofa.');
    e.setAttribute('spellcheck', 'true');
    e.setAttribute('data-k-edycja', '');
    try { e.focus({ preventScroll: true }); } catch (x3) { e.focus(); }
    ustawKursor(e, typeof x === 'number' ? kursorWPunkcie(x, y) : null);
    polozLicznik();
    oglos('Edytujesz tekst – limit ' + limit(e) + ' znaków.');
  }
  function przywrocAtrybuty(e, poprzednie) {
    ATRYBUTY_EDYCJI.forEach(function (a) { if (poprzednie[a] === null) e.removeAttribute(a); else e.setAttribute(a, poprzednie[a]); });
    e.removeAttribute('data-k-edycja');
  }
  function zakoncz(zapisz) {
    var s = edytowany;
    if (!s) return;
    edytowany = null;
    var e = s.el;
    var surowy = tekstElementu(e);
    var tekst = oczysc(surowy, e);
    przywrocAtrybuty(e, s.poprzednie);
    licznik.hidden = true;
    if (!zapisz) {
      // Esc: wracają dokładnie te węzły, które były (wyróżnienie, spany animacji) – klony węzłów, bez wstawiania HTML.
      while (e.firstChild) e.removeChild(e.firstChild);
      s.oryginal.forEach(function (n) { e.appendChild(n); });
      oglos('Cofnięto zmianę tekstu.');
      return;
    }
    if (tekst === s.start) return;
    // Zapasowy contenteditable mógł zostawić <br>/<div>; tekst za długi – przycięty. Wtedy element dostaje czysty tekst.
    if (s.zapas || surowy.replace(TWARDE, ' ').replace(/^\s+|\s+$/g, '') !== tekst) e.textContent = tekst;
    var sciezka = atr(e, 'data-k');
    wszystkie('[data-k]', 'data-k', sciezka).forEach(function (inny) { if (inny !== e && inny.textContent !== tekst) inny.textContent = tekst; });
    wyslij({ typ: 'tekst', sciezka: sciezka, wartosc: tekst });
    odswiez();
  }
  /** Wstawienie czystego tekstu w miejscu kursora z limitem znaków (wklejanie, upuszczanie, Enter w polu wielowierszowym). */
  function wstaw(t) {
    if (!edytowany) return;
    var e = edytowany.el;
    t = String(t).replace(/\r\n?/g, '\n');
    if (!wiele(e)) t = t.replace(/\n+/g, ' ');
    t = t.replace(NIEWIDOCZNE, '');
    var sel = w.getSelection ? w.getSelection() : null;
    var r = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    if (!r || !e.contains(r.commonAncestorContainer)) { r = d.createRange(); r.selectNodeContents(e); r.collapse(false); }
    var wolne = limit(e) - (tekstElementu(e).length - r.toString().length);
    if (wolne <= 0) { oglos('Osiągnięto limit ' + limit(e) + ' znaków.'); polozLicznik(); return; }
    if (t.length > wolne) { t = t.slice(0, wolne); oglos('Tekst przycięty do limitu ' + limit(e) + ' znaków.'); }
    r.deleteContents();
    var wezel = d.createTextNode(t);
    r.insertNode(wezel);
    r.setStartAfter(wezel); r.collapse(true);
    if (sel) { sel.removeAllRanges(); sel.addRange(r); }
    polozLicznik();
  }

  // ---- zdarzenia ---------------------------------------------------------------------------------------------
  function polecenie(p, s) {
    if (!s) return;
    var b = przyciski.filter(function (x) { return atr(x, 'data-polecenie') === p; })[0];
    if (b && atr(b, 'aria-disabled') === 'true') return;
    wyslij({ typ: 'polecenie', sekcja: idSekcji(s), polecenie: p });
  }
  pasek.addEventListener('click', function (ev) {
    var b = najblizszy(ev.target, 'button');
    if (!b) return;
    ev.preventDefault();
    polecenie(atr(b, 'data-polecenie'), zaznaczona);
  });
  pasek.addEventListener('keydown', function (ev) {
    var i = przyciski.indexOf(cien ? cien.activeElement : null);
    if (ev.key === 'ArrowRight' || ev.key === 'ArrowLeft') {
      ev.preventDefault();
      przyciski[(i + (ev.key === 'ArrowRight' ? 1 : przyciski.length - 1)) % przyciski.length].focus();
    } else if (ev.key === 'Escape' && ostatniFokus && d.contains(ostatniFokus)) {
      ev.preventDefault();
      ostatniFokus.focus();
    }
  });
  przyciskObrazu.addEventListener('click', function (ev) {
    ev.preventDefault();
    if (obrazPodKursorem) wyslij({ typ: 'obraz', sciezka: atr(obrazPodKursorem, 'data-k-obraz') });
  });

  function klik(ev) {
    var t = ev.target;
    if (t === host || !t || !t.closest) return;
    var tekst = najblizszy(t, '[data-k]');
    var s = sekcjaElementu(t);
    if (edytowany && edytowany.el.contains(t)) { ev.preventDefault(); ev.stopPropagation(); return; }
    if (tekst) {
      ev.preventDefault(); ev.stopPropagation();
      if (tylkoZaznacz) {
        zaznacz(s, false);
        wyslij({ typ: 'zaznacz', sekcja: idSekcji(s), sciezka: atr(tekst, 'data-k') });
        return;
      }
      zaznacz(s, s !== zaznaczona);
      zacznij(tekst, ev.clientX, ev.clientY);
      return;
    }
    var ob = najblizszy(t, '[data-k-obraz]');
    if (ob) {
      ev.preventDefault(); ev.stopPropagation();
      zaznacz(s, s !== zaznaczona);
      wyslij({ typ: 'obraz', sciezka: atr(ob, 'data-k-obraz') });
      return;
    }
    var f = najblizszy(t, '[data-k-formularz]');
    if (f && s) {
      ev.preventDefault(); ev.stopPropagation();
      zaznacz(s, false);
      wyslij({ typ: 'polecenie', sekcja: idSekcji(s), polecenie: 'opcje', sciezka: atr(f, 'data-k-formularz') });
      return;
    }
    // Linki i przyciski-odnośniki w trybie edycji nie prowadzą nigdzie (przyciski strony – karuzela, menu – działają).
    if (najblizszy(t, 'a[href]')) ev.preventDefault();
    if (s) zaznacz(s, true);
  }
  w.addEventListener('click', klik, true);

  d.addEventListener('keydown', function (ev) {
    var t = ev.target;
    if (edytowany) {
      if (t === host) return;
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); var e = edytowany.el; zakoncz(false); e.focus(); return; }
      if (ev.key === 'Enter') {
        ev.preventDefault(); ev.stopPropagation();
        if (wiele(edytowany.el) && !ev.ctrlKey && !ev.metaKey) wstaw('\n');
        else { var e2 = edytowany.el; zakoncz(true); e2.focus(); }
        return;
      }
      // Pozostałe klawisze zostają w edytowanym elemencie (spacja nie zwija FAQ, skróty strony nie działają).
      ev.stopPropagation();
      return;
    }
    var mod = (ev.ctrlKey || ev.metaKey) && !ev.altKey;
    var klucz = (ev.key || '').toLowerCase();
    if (mod && (klucz === 'z' || klucz === 'y' || klucz === 's')) {
      ev.preventDefault();
      wyslij({ typ: 'skrot', skrot: klucz === 's' ? 'zapisz' : klucz === 'y' || ev.shiftKey ? 'ponow' : 'cofnij' });
      return;
    }
    if (t === host) return;
    var aktywuj = ev.key === 'Enter' || ev.key === 'F2' || (ev.key === ' ' && t && t.hasAttribute && !t.hasAttribute('data-k'));
    if (aktywuj && t && t.hasAttribute) {
      if (t.hasAttribute('data-k')) {
        ev.preventDefault(); ev.stopPropagation();
        var s = sekcjaElementu(t);
        if (tylkoZaznacz) { zaznacz(s, false); wyslij({ typ: 'zaznacz', sekcja: idSekcji(s), sciezka: atr(t, 'data-k') }); }
        else { zaznacz(s, s !== zaznaczona); zacznij(t); }
        return;
      }
      if (t.hasAttribute('data-k-obraz')) { ev.preventDefault(); ev.stopPropagation(); wyslij({ typ: 'obraz', sciezka: atr(t, 'data-k-obraz') }); return; }
      if (t.hasAttribute('data-k-formularz')) {
        ev.preventDefault(); ev.stopPropagation();
        var s2 = sekcjaElementu(t);
        if (s2) wyslij({ typ: 'polecenie', sekcja: idSekcji(s2), polecenie: 'opcje', sciezka: atr(t, 'data-k-formularz') });
        return;
      }
    }
    // Esc na elemencie sekcji – fokus na pasek działań (Esc w pasku wraca).
    if (ev.key === 'Escape' && zaznaczona && !pasek.hidden && zaznaczona.contains(t)) {
      ev.preventDefault();
      ostatniFokus = t;
      przyciski[0].focus();
    }
  }, true);

  d.addEventListener('focusin', function (ev) {
    var t = ev.target;
    if (t === host || !t || !t.hasAttribute) return;
    if (t.hasAttribute('data-k') || t.hasAttribute('data-k-obraz') || t.hasAttribute('data-k-formularz')) {
      var s = sekcjaElementu(t);
      if (s && s !== zaznaczona) { zaznacz(s, true); oglos('Sekcja zaznaczona. Escape – pasek działań sekcji.'); }
      if (t.hasAttribute('data-k-obraz')) { obrazPodKursorem = t; polozObraz(); }
    }
  });
  d.addEventListener('focusout', function (ev) {
    if (edytowany && ev.target === edytowany.el) zakoncz(true);
  }, true);
  d.addEventListener('paste', function (ev) {
    if (!edytowany || !edytowany.el.contains(ev.target)) return;
    ev.preventDefault();
    var dane = ev.clipboardData || w.clipboardData;
    wstaw(dane ? dane.getData('text/plain') || dane.getData('text') || '' : '');
  }, true);
  d.addEventListener('drop', function (ev) {
    if (!edytowany || !edytowany.el.contains(ev.target)) return;
    ev.preventDefault();
    wstaw(ev.dataTransfer ? ev.dataTransfer.getData('text/plain') : '');
  }, true);
  d.addEventListener('beforeinput', function (ev) {
    if (!edytowany || !edytowany.el.contains(ev.target)) return;
    var typ = ev.inputType || '';
    if (typ === 'insertParagraph' || typ === 'insertLineBreak') { ev.preventDefault(); if (wiele(edytowany.el)) wstaw('\n'); return; }
    if (typ === 'insertFromPaste' || typ === 'insertFromDrop') return;
    if (typ.indexOf('insert') === 0 && ev.data) {
      var sel = w.getSelection ? w.getSelection() : null;
      var zaz = sel && sel.rangeCount ? sel.getRangeAt(0).toString().length : 0;
      if (tekstElementu(edytowany.el).length - zaz + ev.data.length > limit(edytowany.el)) { ev.preventDefault(); oglos('Osiągnięto limit ' + limit(edytowany.el) + ' znaków.'); }
    }
  }, true);
  d.addEventListener('input', function (ev) { if (edytowany && edytowany.el.contains(ev.target)) polozLicznik(); }, true);
  d.addEventListener('mouseover', function (ev) {
    var ob = najblizszy(ev.target, '[data-k-obraz]');
    if (ob && ob !== obrazPodKursorem) { obrazPodKursorem = ob; polozObraz(); }
  });
  d.addEventListener('mouseout', function (ev) {
    if (!obrazPodKursorem) return;
    var dokad = ev.relatedTarget;
    if (dokad === host || (dokad && obrazPodKursorem.contains(dokad))) return;
    if (najblizszy(ev.target, '[data-k-obraz]') === obrazPodKursorem) { obrazPodKursorem = null; polozObraz(); }
  });
  w.addEventListener('scroll', odswiez, { passive: true });
  w.addEventListener('resize', odswiez);

  // ---- wiadomości z edytora ----------------------------------------------------------------------------------
  w.addEventListener('message', function (ev) {
    if (ev.source !== w.parent) return;
    var m = ev.data;
    if (!m || typeof m !== 'object' || m.v !== 1) return;
    if (m.typ === 'skala' && typeof m.skala === 'number' && m.skala > 0 && m.skala <= 1) {
      ustawSkale(m.skala);
    } else if (m.typ === 'zaznaczono' && (typeof m.sekcja === 'string' || m.sekcja === null)) {
      var s = m.sekcja ? wszystkie('[data-k-sekcja]', 'data-k-sekcja', m.sekcja)[0] || null : null;
      zaznacz(s, false);
    } else if (m.typ === 'tekst-z-zewnatrz' && typeof m.sciezka === 'string' && typeof m.wartosc === 'string') {
      wszystkie('[data-k]', 'data-k', m.sciezka).forEach(function (e) {
        if (edytowany && edytowany.el === e) return;
        if (e.textContent !== m.wartosc) e.textContent = m.wartosc;
      });
      odswiez();
    }
  });

  function start() {
    var focusowalne = d.querySelectorAll('[data-k],[data-k-obraz],[data-k-formularz]');
    for (var i = 0; i < focusowalne.length; i++) {
      var e = focusowalne[i];
      if (e.tabIndex < 0 || !(e.matches && e.matches('a[href],button,input,select,textarea,summary'))) {
        if (!e.hasAttribute('tabindex')) e.setAttribute('tabindex', '0');
      }
      if (e.hasAttribute('data-k-obraz') && !e.hasAttribute('role')) { e.setAttribute('role', 'button'); e.setAttribute('aria-label', 'Zmień zdjęcie'); }
      if (e.hasAttribute('data-k-formularz') && !e.hasAttribute('role')) { e.setAttribute('role', 'button'); e.setAttribute('aria-label', 'Zmień cenę w formularzu sekcji'); }
    }
    (d.body || d.documentElement).appendChild(host);
    var juz = d.querySelector('[data-kreator-zaznaczona][data-k-sekcja]');
    if (juz) zaznacz(juz, false);
    wyslij({ typ: 'gotowe', scrollY: Math.round(w.scrollY || 0) });
  }
  if (d.readyState === 'loading') d.addEventListener('DOMContentLoaded', start); else start();
})();`;

/** Kod mostka z konfiguracją (tryb + style paska). JSON bez `<`, więc nie zamknie znacznika <script>. */
export function kodMostu(opcje: OpcjeMostu): string {
  const konfig = JSON.stringify({ tryb: opcje.tryb === 'edycja' ? 'edycja' : 'zaznacz', styl: STYL_PASKA })
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e');
  return KOD.replace('__KONFIG__', () => konfig);
}

/** `<style>` strony + `<script>` mostka do wstawienia przed </body> podglądu. */
export function dodatkiMostu(opcje: OpcjeMostu): string {
  return `<style data-k-most>${STYL_MOSTU}</style><script data-k-most>${kodMostu(opcje).replace(/<\/(script)/gi, '<\\/$1')}</script>`;
}

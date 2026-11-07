import type { SekcjaTypu } from '../../model.ts';
import { wszystkieSekcje } from '../../model.ts';
import { listaGodzin } from '../dane.ts';
import { esc } from '../esc.ts';
import { ikona } from '../ikony.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { przyciski } from '../linki.ts';
import { obraz, placeholder } from '../obraz.ts';
import { formularz, klasaPojawiania, sekcja, sierotki } from './wspolne.ts';

type Hero = SekcjaTypu<'hero'>;

/** Słowa nagłówka w <span> – efekt „wejscie-naglowka” (bez JS nagłówek jest po prostu widoczny). */
function slowa(tekst: string, licznik: { i: number }): string {
  return tekst
    .split(/([ \t\n]+)/)
    .map((c) => (/^[ \t\n]+$/.test(c) || !c ? c : `<span class="sl d${Math.min(licznik.i++, 23)}">${esc(c)}</span>`))
    .join('');
}

function trescNaglowka(k: KontekstPodstrony, d: Hero['dane']): string {
  const anim = k.s.efekty.has('wejscie-naglowka') && k.s.strona.motyw.animacje !== 'brak';
  if (anim) k.s.css.add('ef:wejscie-naglowka');
  const licznik = { i: 0 };
  // twarde spacje po jednoliterowych słowach – przy animacji zostają w jednym <span> ze słowem
  const fmt = (t: string) => (anim ? slowa(sierotki(t), licznik) : esc(sierotki(t)));
  const w = d.wyroznienie;
  if (!w || !d.naglowek.includes(w)) return fmt(d.naglowek);
  const i = d.naglowek.indexOf(w);
  return `${fmt(d.naglowek.slice(0, i))}<em class="wyr">${fmt(w)}</em>${fmt(d.naglowek.slice(i + w.length))}`;
}

function naglowek(k: KontekstPodstrony, sek: Hero): string {
  const h = k.bylH1 ? 'h2' : 'h1';
  k.bylH1 = true;
  return `<${h} id="${esc(sek.id)}-tytul" class="hero-h">${trescNaglowka(k, sek.dane)}</${h}>`;
}

function fakty(sek: Hero, klasa = 'fakty'): string {
  if (!sek.dane.fakty.length) return '';
  return `<dl class="${klasa}">${sek.dane.fakty.map((f) => `<div><dt>${esc(f.etykieta)}</dt><dd>${esc(f.wartosc)}</dd></div>`).join('')}</dl>`;
}

function tekst(k: KontekstPodstrony, sek: Hero, zFaktami = true): string {
  const d = sek.dane;
  return (
    (d.nadtytul ? `<p class="nad">${esc(d.nadtytul)}</p>` : '') +
    naglowek(k, sek) +
    (d.podtytul ? `<p class="lead">${esc(sierotki(d.podtytul))}</p>` : '') +
    przyciski(k, d.przyciski) +
    (zFaktami ? fakty(sek) : '')
  );
}

function kartaGodzin(k: KontekstPodstrony): string {
  const lista = listaGodzin(k.s.strona.firma);
  if (!lista) return '';
  return `<div class="karta-plywajaca"><p class="karta-tytul">Godziny otwarcia</p>${lista}</div>`;
}

export function renderHero(k: KontekstPodstrony, sek: Hero): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const ob = (klasa = '') => obraz(k, d.obraz, { priorytet: true, klasa });
  const zaokr = k.s.strona.motyw.zaokraglenie;
  const luk = zaokr === 'pelne' || zaokr === 'miekkie' ? ' ob-luk' : '';
  switch (sek.wariant) {
    case 'hero-edytorski': {
      const drugi = k.s.strona.firma.obszar ?? k.s.strona.firma.branza;
      const d2 = { ...sek, dane: { ...d, nadtytul: undefined } } as Hero;
      return sekcja(
        k,
        sek,
        `<div class="kontener${poj}">` +
          `<div class="hero-meta">${d.nadtytul ? `<p class="nad">${esc(d.nadtytul)}</p>` : ''}<p class="nad nad-2">${esc(drugi)}</p></div>` +
          `<div class="hero-siatka"><div class="hero-tekst">${tekst(k, d2)}</div><div class="hero-media">${ob()}</div></div>` +
          `</div>`,
      );
    }
    case 'hero-centralny':
      return sekcja(
        k,
        sek,
        `<div class="kontener${poj}"><div class="hero-tekst">${tekst(k, sek)}</div><div class="hero-media">${ob('ob-szeroki')}</div></div>`,
      );
    case 'hero-pelnoekranowy':
      return sekcja(
        k,
        sek,
        `<div class="hero-tlo">${ob()}</div><div class="hero-zaslona" aria-hidden="true"></div>` +
          `<div class="kontener${poj}"><div class="hero-tekst">${tekst(k, sek)}</div></div>`,
        { tloStale: 'ciemne' },
      );
    case 'hero-z-formularzem': {
      const kontakt = wszystkieSekcje(k.s.strona).find((s) => s.typ === 'kontakt');
      const pola = kontakt && kontakt.typ === 'kontakt' ? kontakt.dane.pola.filter((p) => p !== 'wiadomosc').slice(0, 4) : ['imie', 'email', 'telefon'];
      const etykieta = d.przyciski.find((p) => p.styl === 'glowny')?.etykieta ?? 'Wyślij';
      const lista = d.fakty.length
        ? `<ul class="lista-check">${d.fakty.map((f) => `<li>${ikona('check')}<span><strong>${esc(f.etykieta)}</strong> ${esc(f.wartosc)}</span></li>`).join('')}</ul>`
        : '';
      const bezPrzyciskow = { ...sek, dane: { ...d, przyciski: d.przyciski.filter((p) => p.styl !== 'glowny') } } as Hero;
      return sekcja(
        k,
        sek,
        `<div class="kontener hero-siatka${poj}"><div class="hero-tekst">${tekst(k, bezPrzyciskow, false)}${lista}</div>` +
          `<div class="karta-form"><p class="karta-tytul">Napisz do nas</p><p class="karta-opis">Odpowiemy najszybciej, jak to możliwe.</p>${formularz(k, sek, { pola, przycisk: etykieta })}</div></div>`,
      );
    }
    case 'hero-mozaika': {
      const p1 = placeholder(k, { alt: '', proporcje: '1:1' }, true);
      const p2 = placeholder(k, { alt: '', proporcje: '4:3' }, true);
      return sekcja(
        k,
        sek,
        `<div class="kontener hero-siatka${poj}"><div class="hero-tekst">${tekst(k, sek)}</div>` +
          `<div class="hero-kolaz">${ob('kolaz-a')}<div class="ob kolaz-b">${p1}</div><div class="ob kolaz-c">${p2}</div></div></div>`,
      );
    }
    default:
      // hero-podzielony
      return sekcja(
        k,
        sek,
        `<div class="kontener hero-siatka${poj}"><div class="hero-tekst">${tekst(k, sek)}</div>` +
          `<div class="hero-media">${ob(luk.trim())}${d.fakty.length ? '' : kartaGodzin(k)}</div></div>`,
      );
  }
}

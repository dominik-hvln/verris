import type { Obraz, SekcjaTypu } from '../../model.ts';
import { esc } from '../esc.ts';
import { ikona } from '../ikony.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { atrLinku } from '../linki.ts';
import { obraz } from '../obraz.ts';
import { glowa, klasaPojawiania, sekcja } from './wspolne.ts';

/** Przyciski karuzeli – bez JS ukryte (track da się przewijać gestem i klawiaturą). */
export function nawigacjaKaruzeli(k: KontekstPodstrony, etykieta: string): string {
  k.s.js.add('karuzela');
  return (
    `<div class="karuzela-nav"><button type="button" class="karuzela-btn" data-kierunek="-1" aria-label="${esc(etykieta)}: poprzednie">${ikona('strzalka-l')}</button>` +
    `<button type="button" class="karuzela-btn" data-kierunek="1" aria-label="${esc(etykieta)}: następne">${ikona('strzalka')}</button></div>`
  );
}

export function renderGaleria(k: KontekstPodstrony, sek: SekcjaTypu<'galeria'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const el = (o: Obraz, klasa = '') => `<li>${obraz(k, o, { lightbox: true, klasa })}</li>`;
  if (sek.wariant === 'galeria-karuzela') {
    const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep });
    return sekcja(
      k,
      sek,
      `<div class="kontener${poj}"><div class="karuzela-glowa">${g}${nawigacjaKaruzeli(k, 'Galeria')}</div></div><div class="karuzela"><ul class="karuzela-tor galeria-tor" tabindex="0" aria-label="${esc(d.naglowek)}">${d.obrazy.map((o) => el(o)).join('')}</ul></div>`,
    );
  }
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep, klasa: 'glowa-rzad' });
  if (sek.wariant === 'galeria-mozaika') {
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="mozaika">${d.obrazy.map((o) => el(o, 'ob-wypelnij')).join('')}</ul></div>`);
  }
  return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="galeria-kafle">${d.obrazy.map((o) => el(o, 'ob-kwadrat')).join('')}</ul></div>`);
}

export function renderZespol(k: KontekstPodstrony, sek: SekcjaTypu<'zespol'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const zdjecie = (o: SekcjaTypu<'zespol'>['dane']['osoby'][number], proporcje: Obraz['proporcje'], klasa: string) =>
    obraz(k, o.obraz ?? { alt: o.imie, zrodlo: 'placeholder', proporcje, podpis: `Zdjęcie: ${o.imie}` }, { klasa });
  const tekst = (o: SekcjaTypu<'zespol'>['dane']['osoby'][number]) =>
    `<h3>${esc(o.imie)}</h3>${o.rola ? `<p class="rola">${esc(o.rola)}</p>` : ''}${o.opis ? `<p class="opis">${esc(o.opis)}</p>` : ''}`;
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep });
  if (sek.wariant === 'zespol-lukowe') {
    const osoby = d.osoby.map((o) => `<li>${zdjecie(o, '3:4', 'ob-luk ob-portret')}${tekst(o)}</li>`).join('');
    return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<ul class="osoby-luk osoby-${Math.min(d.osoby.length, 3)}">${osoby}</ul></div>`);
  }
  if (sek.wariant === 'zespol-lista') {
    const osoby = d.osoby.map((o) => `<li>${zdjecie(o, '1:1', 'ob-okragle')}<div>${tekst(o)}</div></li>`).join('');
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="osoby-lista">${osoby}</ul></div>`);
  }
  const osoby = d.osoby.map((o) => `<li class="karta-osoby">${zdjecie(o, '4:5', 'ob-portret')}<div class="karta-osoby-tekst">${tekst(o)}</div></li>`).join('');
  return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="osoby-karty">${osoby}</ul></div>`);
}

type Opinie = SekcjaTypu<'opinie'>;

/** Pusta sekcja opinii: w publikacji znika (renderer pomija ją także w menu). */
export function opinieDoPokazania(k: { podglad: boolean }, sek: Opinie): boolean {
  return sek.dane.wpisy.length > 0 || k.podglad;
}

function opinia(w: Opinie['dane']['wpisy'][number], klasa: string): string {
  const zrodlo = w.zrodloUrl && /^https:\/\/[^\s"<>]+$/i.test(w.zrodloUrl) ? ` <a class="opinia-zrodlo" ${atrLinku(w.zrodloUrl)}>Źródło</a>` : '';
  return (
    `<figure class="${klasa}"><blockquote><p>${esc(w.tresc)}</p></blockquote>` +
    `<figcaption><span class="opinia-autor">${esc(w.autor)}</span>${w.data ? ` <span class="opinia-data">${esc(w.data)}</span>` : ''}${zrodlo}</figcaption></figure>`
  );
}

export function renderOpinie(k: KontekstPodstrony, sek: Opinie): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const nad = d.zrodlo === 'google' ? 'Opinie z Google' : sek.wMenu;
  if (!d.wpisy.length) {
    const g = glowa(sek, { naglowek: d.naglowek, nad });
    return sekcja(
      k,
      sek,
      `<div class="kontener uklad-bok${poj}">${g}<div class="opinie-puste"><p class="opinie-puste-tytul">Tu pojawią się opinie z Twojej wizytówki Google albo dodane przez Ciebie</p><p>Kreator pokazuje wyłącznie prawdziwe opinie – nic nie dopisuje za Ciebie. Pusta sekcja nie pojawi się na opublikowanej stronie.</p></div></div>`,
      { klasa: 'sek-podglad' },
    );
  }
  if (sek.wariant === 'opinie-siatka') {
    const g = glowa(sek, { naglowek: d.naglowek, nad });
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<div class="opinie-kolumny">${d.wpisy.map((w) => opinia(w, 'opinia karta-opinii')).join('')}</div></div>`);
  }
  const wiele = d.wpisy.length > 1;
  const nav = wiele ? nawigacjaKaruzeli(k, 'Opinie') : '';
  const g = glowa(sek, { naglowek: d.naglowek, nad });
  if (sek.wariant === 'opinie-karuzela') {
    return sekcja(
      k,
      sek,
      `<div class="kontener${poj}"><div class="karuzela-glowa">${g}${nav}</div></div><div class="karuzela"><div class="karuzela-tor opinie-tor" tabindex="0" role="group" aria-label="${esc(d.naglowek)}">${d.wpisy.map((w) => opinia(w, 'opinia karta-opinii')).join('')}</div></div>`,
    );
  }
  // opinie-cytat: jeden duży cytat, kolejne przewijane (przyciski z modułu karuzeli)
  return sekcja(
    k,
    sek,
    `<div class="kontener${poj}">${g}<div class="karuzela cytaty"><div class="karuzela-tor cytaty-tor" tabindex="0" role="group" aria-label="${esc(d.naglowek)}">${d.wpisy.map((w) => opinia(w, 'opinia cytat')).join('')}</div>${nav}</div></div>`,
  );
}

import type { SekcjaTypu } from '../../model.ts';
import { emailLink, telefonLink } from '../dane.ts';
import { esc } from '../esc.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { przyciski } from '../linki.ts';
import { obraz } from '../obraz.ts';
import { glowa, klasaPojawiania, sekcja, sierotki, tloSekcji } from './wspolne.ts';

const nr = (i: number) => String(i + 1).padStart(2, '0');
const akapity = (t: string) =>
  t
    .split(/\n{2,}/)
    .map((a) => a.trim())
    .filter(Boolean)
    .map((a) => `<p>${esc(a)}</p>`)
    .join('');

export function renderFaq(k: KontekstPodstrony, sek: SekcjaTypu<'faq'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const lista = d.pytania
    .map((p, i) => `<details class="faq-el"${i === 0 ? ' open' : ''}><summary><h3>${esc(p.pytanie)}</h3><span class="faq-znak" aria-hidden="true"></span></summary><div class="faq-odp">${akapity(p.odpowiedz)}</div></details>`)
    .join('');
  if (sek.wariant === 'faq-dwie-kolumny') {
    const f = k.s.strona.firma;
    const kontakt = f.email || f.telefon
      ? `<p class="wstep">Nie ma tu Twojego pytania? ${f.email ? `Napisz na ${emailLink(f)}` : ''}${f.email && f.telefon ? ' albo zadzwoń: ' : f.telefon ? 'Zadzwoń: ' : ''}${telefonLink(f)}.</p>`
      : '';
    const g = glowa(sek, { naglowek: d.naglowek, dodatek: kontakt });
    return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<div class="faq-lista">${lista}</div></div>`);
  }
  const g = glowa(sek, { naglowek: d.naglowek, klasa: 'glowa-srodek' });
  return sekcja(k, sek, `<div class="kontener kontener-waski${poj}">${g}<div class="faq-lista">${lista}</div></div>`);
}

export function renderKroki(k: KontekstPodstrony, sek: SekcjaTypu<'kroki'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const czas = (c?: string) => (c ? `<p class="krok-czas">${esc(c)}</p>` : '');
  if (sek.wariant === 'kroki-os-czasu') {
    const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep });
    const lista = d.kroki
      .map((s, i) => `<li><span class="os-punkt" aria-hidden="true">${i + 1}</span><div class="os-tresc">${czas(s.czas)}<h3>${esc(s.tytul)}</h3>${s.opis ? `<p>${esc(s.opis)}</p>` : ''}</div></li>`)
      .join('');
    return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<ol class="os-czasu">${lista}</ol></div>`);
  }
  if (sek.wariant === 'kroki-ciemne') {
    const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep, klasa: 'glowa-rzad' });
    const lista = d.kroki
      .map((s, i) => `<li><span class="krok-nr" aria-hidden="true">${nr(i)}</span><h3>${esc(s.tytul)}</h3>${czas(s.czas)}${s.opis ? `<p>${esc(s.opis)}</p>` : ''}</li>`)
      .join('');
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<ol class="kroki-pas kroki-${Math.min(d.kroki.length, 4)}">${lista}</ol></div>`, { tloWariantu: 'ciemne' });
  }
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep });
  const lista = d.kroki
    .map((s, i) => `<li><span class="krok-cyfra" aria-hidden="true">${i + 1}</span><h3>${esc(s.tytul)}</h3>${s.opis ? `<p>${esc(s.opis)}</p>` : ''}${s.czas ? `<span class="chip">${esc(s.czas)}</span>` : ''}</li>`)
    .join('');
  return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<ol class="kroki-kol kroki-${Math.min(d.kroki.length, 4)}">${lista}</ol></div>`);
}

export function renderONas(k: KontekstPodstrony, sek: SekcjaTypu<'onas'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const wyr = (klasa: string) =>
    d.wyrozniki.length
      ? `<ol class="${klasa}">${d.wyrozniki.map((w, i) => `<li><span class="wyr-nr" aria-hidden="true">${nr(i)}</span><h3>${esc(w.tytul)}</h3>${w.opis ? `<p>${esc(w.opis)}</p>` : ''}</li>`).join('')}</ol>`
      : '';
  const tekst = d.akapity.map((a) => `<p>${esc(a)}</p>`).join('');
  if (sek.wariant === 'onas-manifest') {
    const [pierwszy, ...reszta] = d.akapity;
    const g = glowa(sek, { naglowek: d.naglowek });
    return sekcja(
      k,
      sek,
      `<div class="kontener${poj}">${g}<p class="manifest">${esc(pierwszy ?? '')}</p>${reszta.length ? `<div class="manifest-reszta">${reszta.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}${wyr('wyrozniki-rzad')}</div>`,
    );
  }
  if (sek.wariant === 'onas-wyrozniki') {
    const [pierwszy, ...reszta] = d.akapity;
    const g = glowa(sek, { naglowek: d.naglowek, klasa: 'glowa-rzad', dodatek: pierwszy ? `<p class="wstep">${esc(pierwszy)}</p>` : '' });
    return sekcja(
      k,
      sek,
      `<div class="kontener${poj}">${g}${reszta.length ? `<div class="manifest-reszta">${reszta.map((a) => `<p>${esc(a)}</p>`).join('')}</div>` : ''}${wyr('wyrozniki-siatka')}</div>`,
    );
  }
  const ob = obraz(k, d.obraz ?? { alt: k.s.strona.firma.nazwa, zrodlo: 'placeholder', proporcje: '4:5', podpis: `Zdjęcie: ${k.s.strona.firma.branza}` }, { klasa: 'ob-paralaksa' });
  const g = glowa(sek, { naglowek: d.naglowek });
  return sekcja(k, sek, `<div class="kontener onas-siatka${poj}"><div class="onas-media">${ob}</div><div class="onas-tekst">${g}<div class="proza">${tekst}</div>${wyr('wyrozniki-mini')}</div></div>`);
}

export function renderCta(k: KontekstPodstrony, sek: SekcjaTypu<'cta'>): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const h = `<h2 id="${esc(sek.id)}-tytul">${esc(sierotki(d.naglowek))}</h2>`;
  const t = d.tekst ? `<p class="wstep">${esc(sierotki(d.tekst))}</p>` : '';
  if (sek.wariant === 'cta-pelny') {
    return sekcja(k, sek, `<div class="kontener cta-siatka${poj}"><div>${h}${t}</div>${przyciski(k, d.przyciski)}</div>`, { tloWariantu: 'ciemne' });
  }
  if (sek.wariant === 'cta-karta') {
    const karta = tloSekcji(sek) === 'akcent' ? 'tlo-ciemne' : 'tlo-akcent';
    return sekcja(k, sek, `<div class="kontener${poj}"><div class="cta-pudelko ${karta}"><div>${h}${t}</div>${przyciski(k, d.przyciski)}</div></div>`);
  }
  return sekcja(k, sek, `<div class="kontener cta-rzad${poj}"><div>${h}${t}</div>${przyciski(k, d.przyciski)}</div>`, { tloWariantu: 'akcent' });
}

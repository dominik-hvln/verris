import type { SekcjaTypu } from '../../model.ts';
import { wszystkieSekcje } from '../../model.ts';
import { esc } from '../esc.ts';
import { czyIkona, ikona } from '../ikony.ts';
import type { KontekstPodstrony } from '../kontekst.ts';
import { celDostepny, przycisk } from '../linki.ts';
import { obraz } from '../obraz.ts';
import { atrFormularza, edytowalne } from '../edycja.ts';
import { glowa, klasaPojawiania, sekcja, tloSekcji, zl } from './wspolne.ts';

type Oferta = SekcjaTypu<'oferta'>;
type Cennik = SekcjaTypu<'cennik'>;

const nr = (i: number) => String(i + 1).padStart(2, '0');

export function renderOferta(k: KontekstPodstrony, sek: Oferta): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep }, k);
  const ak = edytowalne(k, sek);
  const t = (i: number) => ak(`dane.pozycje.${i}.tytul`);
  const o = (i: number) => ak(`dane.pozycje.${i}.opis`);
  const c = (i: number) => ak(`dane.pozycje.${i}.cena`);
  switch (sek.wariant) {
    case 'oferta-lista-cen': {
      const dwie = d.pozycje.length > 5 ? ' dwie-kol' : '';
      const lista = d.pozycje
        .map(
          (p, i) =>
            `<li><div class="poz"><h3${t(i)}>${esc(p.tytul)}</h3>${p.cena ? `<span class="kropki" aria-hidden="true"></span><strong class="poz-cena"${c(i)}>${esc(p.cena)}</strong>` : ''}</div>` +
            (p.opis ? `<p${o(i)}>${esc(p.opis)}</p>` : '') +
            `</li>`,
        )
        .join('');
      return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<ul class="lista-cen${dwie}">${lista}</ul></div>`);
    }
    case 'oferta-kolumny': {
      const lista = d.pozycje
        .map(
          (p, i) =>
            `<li><span class="poz-nr" aria-hidden="true">${nr(i)}</span><div class="poz-tresc"><h3${t(i)}>${esc(p.tytul)}</h3>${p.opis ? `<p${o(i)}>${esc(p.opis)}</p>` : ''}</div>` +
            (p.cena ? `<strong class="poz-cena"${c(i)}>${esc(p.cena)}</strong>` : '') +
            `</li>`,
        )
        .join('');
      return sekcja(k, sek, `<div class="kontener uklad-bok${poj}">${g}<ol class="lista-linie">${lista}</ol></div>`);
    }
    case 'oferta-naprzemienna': {
      const wiersze = d.pozycje
        .map(
          (p, i) =>
            `<li class="naprzemian${i % 2 ? ' odwr' : ''}">${obraz(k, { alt: p.tytul, zrodlo: 'placeholder', proporcje: '4:3', podpis: `Zdjęcie: ${p.tytul}` })}` +
            `<div class="naprzemian-tekst"><span class="poz-nr" aria-hidden="true">${nr(i)}</span><h3${t(i)}>${esc(p.tytul)}</h3>${p.opis ? `<p${o(i)}>${esc(p.opis)}</p>` : ''}${p.cena ? `<p class="poz-cena"${c(i)}>${esc(p.cena)}</p>` : ''}</div></li>`,
        )
        .join('');
      return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="lista-naprzemienna">${wiersze}</ul></div>`);
    }
    default: {
      // oferta-siatka
      const karty = d.pozycje
        .map(
          (p, i) =>
            `<li class="karta">${czyIkona(p.ikona) ? `<span class="karta-ikona">${ikona(p.ikona!)}</span>` : `<span class="karta-nr" aria-hidden="true">${nr(i)}</span>`}` +
            `<h3${t(i)}>${esc(p.tytul)}</h3>${p.opis ? `<p${o(i)}>${esc(p.opis)}</p>` : ''}${p.cena ? `<p class="poz-cena"${c(i)}>${esc(p.cena)}</p>` : ''}</li>`,
        )
        .join('');
      return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="karty karty-${Math.min(d.pozycje.length, 4)}">${karty}</ul></div>`);
    }
  }
}

type Pakiet = Cennik['dane']['pakiety'][number];
const OKRES: Record<Pakiet['okres'], string> = { jednorazowo: '', miesiac: '/ mies.', rok: '/ rok', od: '' };

/** Cena liczbowa – w edycji na stronie nie piszemy jej w miejscu: `atr` (data-k-formularz) otwiera pole w formularzu. */
function cena(p: Pakiet, atr = ''): string {
  if (p.cenaBrutto === null) return `<p class="cena"${atr}><span class="kwota kwota-tekst">Wycena indywidualna</span></p>`;
  const od = p.okres === 'od' ? '<span class="cena-od">od</span> ' : '';
  const okres = OKRES[p.okres];
  if (p.cenaNetto !== undefined) {
    return (
      `<p class="cena"${atr}>${od}<span class="kwota">${zl(p.cenaNetto)}</span> <span class="cena-okres">netto${okres ? ' ' + okres : ''}</span></p>` +
      `<p class="cena-druga"${atr}>${zl(p.cenaBrutto)} brutto${okres ? ' ' + okres : ''}</p>`
    );
  }
  return `<p class="cena"${atr}>${od}<span class="kwota">${zl(p.cenaBrutto)}</span>${okres ? ` <span class="cena-okres">${okres}</span>` : ''}</p>`;
}

function przyciskPakietu(k: KontekstPodstrony, p: Pakiet, atr = ''): string {
  if (p.przycisk && celDostepny(k, p.przycisk.cel)) return przycisk(k, { ...p.przycisk, styl: p.wyrozniony ? 'glowny' : p.przycisk.styl }, 'btn-pelny', atr);
  const kontakt = wszystkieSekcje(k.s.strona).find((s) => s.typ === 'kontakt');
  if (!kontakt || !celDostepny(k, `#${kontakt.id}`)) return '';
  return przycisk(k, { etykieta: 'Zapytaj o pakiet', cel: `#${kontakt.id}`, styl: p.wyrozniony ? 'glowny' : 'drugi' }, 'btn-pelny');
}

function cechy(p: Pakiet, ak: (i: number) => string = () => ''): string {
  return p.cechy.length ? `<ul class="cechy">${p.cechy.map((c, i) => `<li>${ikona('check')}<span${ak(i)}>${esc(c)}</span></li>`).join('')}</ul>` : '';
}

export function renderCennik(k: KontekstPodstrony, sek: Cennik): string {
  const d = sek.dane;
  const poj = klasaPojawiania(k);
  const okresy = new Set(d.pakiety.map((p) => p.okres));
  const przelacznik = k.s.efekty.has('przelacznik-cen') && okresy.has('miesiac') && okresy.has('rok');
  if (przelacznik) k.s.js.add('przelacznik');
  const prz = przelacznik
    ? `<div class="przelacznik" role="group" aria-label="Okres rozliczenia"><button type="button" data-okres="miesiac" aria-pressed="true">Miesięcznie</button><button type="button" data-okres="rok" aria-pressed="false">Rocznie</button></div>`
    : '';
  const g = glowa(sek, { naglowek: d.naglowek, wstep: d.wstep, dodatek: prz }, k);
  const ak = edytowalne(k, sek);
  const uwaga = d.uwaga ? `<p class="uwaga"${ak('dane.uwaga')}>${esc(d.uwaga)}</p>` : '';
  // Indeks pakietu w modelu – atrybuty edycji na stronie (pakiety renderują się w kolejności modelu).
  const aN = (i: number) => ak(`dane.pakiety.${i}.nazwa`);
  const aO = (i: number) => ak(`dane.pakiety.${i}.opis`);
  const aC = (i: number) => (j: number) => ak(`dane.pakiety.${i}.cechy.${j}`);
  const aP = (i: number) => ak(`dane.pakiety.${i}.przycisk.etykieta`);
  const aCena = (i: number) => atrFormularza(k, sek, `dane.pakiety.${i}.cenaBrutto`);
  const atrOkresu = (p: Pakiet) => (przelacznik && (p.okres === 'miesiac' || p.okres === 'rok') ? ` data-okres="${p.okres}"` : '');

  if (sek.wariant === 'cennik-lista') {
    const wiersze = d.pakiety
      .map(
        (p, i) =>
          `<li class="pas${p.wyrozniony ? ' wyrozniony' : ''}"${atrOkresu(p)}><div class="pas-nazwa"><h3${aN(i)}>${esc(p.nazwa)}</h3>${p.opis ? `<p${aO(i)}>${esc(p.opis)}</p>` : ''}${p.wyrozniony ? '<span class="odznaka">Polecany</span>' : ''}</div>` +
          `<div class="pas-cechy">${cechy(p, aC(i))}</div><div class="pas-cena">${cena(p, aCena(i))}${przyciskPakietu(k, p, aP(i))}</div></li>`,
      )
      .join('');
    return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="pasy">${wiersze}</ul>${uwaga}</div>`);
  }

  if (sek.wariant === 'cennik-tabela') {
    const wszystkie = [...new Set(d.pakiety.flatMap((p) => p.cechy))];
    const naglowki = d.pakiety
      .map((p, i) => `<th scope="col"${p.wyrozniony ? ' class="wyrozniony"' : ''}${atrOkresu(p)}><span class="tab-nazwa"${aN(i)}>${esc(p.nazwa)}</span>${cena(p, aCena(i))}</th>`)
      .join('');
    const wiersze = wszystkie
      .map(
        (c) =>
          `<tr><th scope="row">${esc(c)}</th>${d.pakiety
            .map((p) => `<td${p.wyrozniony ? ' class="wyrozniony"' : ''}${atrOkresu(p)}>${p.cechy.includes(c) ? `${ikona('check')}<span class="sr">Tak</span>` : '<span class="brak" aria-hidden="true"></span><span class="sr">Nie</span>'}</td>`)
            .join('')}</tr>`,
      )
      .join('');
    // Wiersze cech tabeli łączą cechy wielu pakietów – edycja cech w formularzu, nie w podglądzie.
    const stopka = `<tr class="tab-akcje"><td></td>${d.pakiety.map((p, i) => `<td${atrOkresu(p)}>${przyciskPakietu(k, p, aP(i))}</td>`).join('')}</tr>`;
    return sekcja(
      k,
      sek,
      `<div class="kontener${poj}">${g}<div class="tabela-przewijana" role="region" aria-labelledby="${esc(sek.id)}-tytul" tabindex="0"><table class="tabela-cen"><caption class="sr">${esc(d.naglowek)}</caption><thead><tr><td></td>${naglowki}</tr></thead><tbody>${wiersze}${stopka}</tbody></table></div>${uwaga}</div>`,
    );
  }

  // cennik-kolumny – wyróżniony pakiet w odwróconych kolorach (kontekst tła ciemnego albo akcentu)
  const odwr = tloSekcji(sek) === 'ciemne' ? 'tlo-akcent' : 'tlo-ciemne';
  const karty = d.pakiety
    .map(
      (p, i) =>
        `<li class="pakiet${p.wyrozniony ? ` wyrozniony ${odwr}` : ''}"${atrOkresu(p)}>${p.wyrozniony ? '<span class="odznaka">Polecany</span>' : ''}<h3${aN(i)}>${esc(p.nazwa)}</h3>${p.opis ? `<p class="pakiet-opis"${aO(i)}>${esc(p.opis)}</p>` : ''}` +
        `${cena(p, aCena(i))}${cechy(p, aC(i))}<div class="pakiet-akcja">${przyciskPakietu(k, p, aP(i))}</div></li>`,
    )
    .join('');
  return sekcja(k, sek, `<div class="kontener${poj}">${g}<ul class="pakiety pakiety-${Math.min(d.pakiety.length, 4)}">${karty}</ul>${uwaga}</div>`);
}

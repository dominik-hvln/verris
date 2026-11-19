/**
 * Kreator marki – stopka e-mail HTML (koncepcja 3.8): tabele i style inline (programy pocztowe ignorują `<style>`
 * i źle obsługują flex/grid), logo jako `<img src>` PNG z hostingu klienta (SVG w poczcie bywa blokowane), `alt`,
 * dane kontaktowe z DaneKontaktoweMarki, kolory marki. Każdy tekst przez `esc()`; adresy linków budowane
 * z walidowanych wartości (tel:, mailto:, https://).
 */
import type { DaneKontaktoweMarki, KoloryMarki } from './model.ts';
import { esc } from '../render/esc.ts';

export interface WejscieStopki {
  nazwa: string;
  kolory: KoloryMarki;
  kontakt: DaneKontaktoweMarki;
  /** Adres PNG logo (https://…) – np. /marka/logo-stopka.png na hostingu klienta. */
  logoUrl?: string;
  /** Wymiary logo w px (wyświetlane; plik w 2× dla ekranów retina). */
  logoSzer?: number;
  logoWys?: number;
  /** Krój tekstu marki – pierwszy w stosie, z bezpiecznymi zamiennikami. */
  font?: string;
}

const httpsUrl = (u: string | undefined) => (u && /^https:\/\/[^\s"'<>]+$/.test(u) ? u : null);

function wwwHref(www: string): string | null {
  const t = www.trim();
  const pelny = /^https?:\/\//i.test(t) ? t : `https://${t}`;
  return /^https?:\/\/[A-Za-z0-9.-]+\.[A-Za-z]{2,}(\/[^\s"'<>]*)?$/.test(pelny) ? pelny : null;
}

const wwwTekst = (www: string) => www.trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');

export function stopkaEmailHtml(we: WejscieStopki): string {
  const k = we.kolory;
  const d = we.kontakt;
  const stos = `${we.font ? `'${we.font.replace(/['"<>]/g, '')}', ` : ''}Arial, Helvetica, sans-serif`;
  const tekst = `font-family:${esc(stos)};font-size:13px;line-height:19px;color:${k.paleta.tekst};`;
  const link = `color:${k.paleta.akcentTekst};text-decoration:none;`;
  const wiersze: string[] = [];
  if (d.imie) wiersze.push(`<div style="font-size:15px;line-height:21px;font-weight:bold;color:${k.glowny};">${esc(d.imie)}</div>`);
  if (d.stanowisko) wiersze.push(`<div style="color:${k.paleta.tekstPrzygaszony};">${esc(d.stanowisko)}</div>`);
  wiersze.push(`<div style="font-weight:bold;color:${k.glowny};padding-top:${d.imie || d.stanowisko ? 6 : 0}px;">${esc(we.nazwa)}</div>`);
  if (d.telefon) wiersze.push(`<div><a href="tel:${esc(d.telefon.replace(/\s+/g, ''))}" style="${link}">${esc(d.telefon)}</a></div>`);
  if (d.email) wiersze.push(`<div><a href="mailto:${esc(d.email)}" style="${link}">${esc(d.email)}</a></div>`);
  const href = d.www ? wwwHref(d.www) : null;
  if (d.www) wiersze.push(`<div>${href ? `<a href="${esc(href)}" style="${link}">${esc(wwwTekst(d.www))}</a>` : esc(d.www)}</div>`);
  if (d.adres) wiersze.push(`<div style="color:${k.paleta.tekstPrzygaszony};">${esc(d.adres)}</div>`);
  const logo = httpsUrl(we.logoUrl);
  const sz = we.logoSzer ?? 120;
  const wy = we.logoWys ?? 48;
  const kolumnaLogo = logo
    ? `<td style="padding:0 16px 0 0;vertical-align:top;border-right:2px solid ${k.akcent};"><img src="${esc(logo)}" alt="${esc(we.nazwa)}" width="${sz}" height="${wy}" style="display:block;border:0;outline:none;width:${sz}px;height:${wy}px;"></td>`
    : '';
  const odstep = logo ? 'padding:0 0 0 16px;' : `padding:0 0 0 12px;border-left:2px solid ${k.akcent};`;
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;${tekst}">` +
    `<tr>${kolumnaLogo}<td style="${odstep}vertical-align:top;${tekst}">${wiersze.join('')}</td></tr></table>`
  );
}

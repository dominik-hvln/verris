import { Fragment, type ReactNode } from "react";

/**
 * Artykuł bazy wiedzy (Markdown) → elementy React. Te same reguły co strona pomoc.verris.pl
 * (apps/api/src/kb/kb-render.ts renderMarkdown): `#` → h2 (h1 to tytuł strony), nagłówki do h4, bloki kodu ```,
 * cytaty `> `, linia `---`, listy numerowane i punktowane, akapity; w tekście obrazy (tylko http/https), linki
 * (http/https, mailto i ścieżki `/…` — inne, np. `javascript:`, zostają zwykłym tekstem), `kod`, **pogrubienie**
 * i *kursywa*.
 *
 * Bezpieczeństwo: tekst idzie przez React (escapowany), bez dangerouslySetInnerHTML — znaczniki HTML w treści
 * pokazują się jako tekst. Wygląd nadaje wywołujący klasą na kontenerze (np. `[&_h2]:…`, `[&_pre]:…`): biblioteka
 * nie jest skanowana przez Tailwinda paneli, więc sama nie dokłada klas.
 */
export function MarkdownKb({ tekst, className }: { tekst: string; className?: string }) {
  return <div className={className}>{bloki(tekst)}</div>;
}

const LINK_OK = /^(https?:|mailto:|\/)/i;
const OBRAZ_OK = /^https?:\/\//i;
const POCZATEK_BLOKU = /^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|```)/;

function bloki(md: string): ReactNode[] {
  const lines = md.replace(/\r\n/g, "\n").split("\n");
  const out: ReactNode[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const k = out.length;
    if (!line.trim()) {
      i++;
      continue;
    }
    if (line.trim().startsWith("```")) {
      const buf: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) buf.push(lines[i++]);
      i++;
      out.push(
        <pre key={k}>
          <code>{buf.join("\n")}</code>
        </pre>,
      );
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) {
      const poziom = Math.min(h[1].length + 1, 4);
      const tresc = wTekscie(h[2]);
      out.push(poziom === 2 ? <h2 key={k}>{tresc}</h2> : poziom === 3 ? <h3 key={k}>{tresc}</h3> : <h4 key={k}>{tresc}</h4>);
      i++;
      continue;
    }
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) buf.push(lines[i++].slice(2));
      out.push(<blockquote key={k}>{wTekscie(buf.join(" "))}</blockquote>);
      continue;
    }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) {
      out.push(<hr key={k} />);
      i++;
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) items.push(<li key={items.length}>{wTekscie(lines[i++].replace(/^\d+\.\s+/, ""))}</li>);
      out.push(<ol key={k}>{items}</ol>);
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: ReactNode[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) items.push(<li key={items.length}>{wTekscie(lines[i++].replace(/^[-*]\s+/, ""))}</li>);
      out.push(<ul key={k}>{items}</ul>);
      continue;
    }
    const buf: string[] = [line];
    i++;
    while (i < lines.length && lines[i].trim() && !POCZATEK_BLOKU.test(lines[i])) buf.push(lines[i++]);
    out.push(<p key={k}>{wTekscie(buf.join(" "))}</p>);
  }
  return out;
}

/** Obraz, link, kod, pogrubienie, kursywa — w tej kolejności pierwszeństwa (jak kb-render.ts). */
const INLINE = /!\[([^\]]*)\]\(([^)]+)\)|\[([^\]]+)\]\(([^)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|\*([^*]+)\*/g;

function wTekscie(s: string): ReactNode {
  const out: ReactNode[] = [];
  let ostatni = 0;
  for (const m of s.matchAll(INLINE)) {
    const start = m.index ?? 0;
    if (start > ostatni) out.push(s.slice(ostatni, start));
    const k = out.length;
    const [caly, alt, src, etykieta, href, kod, mocny, kursywa] = m;
    if (src !== undefined) {
      const u = src.trim();
      if (OBRAZ_OK.test(u)) out.push(<img key={k} src={u} alt={alt} loading="lazy" />);
    } else if (href !== undefined) {
      const u = href.trim();
      if (LINK_OK.test(u)) {
        out.push(
          <a key={k} href={u} {...(/^https?:/i.test(u) ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            {wTekscie(etykieta)}
          </a>,
        );
      } else {
        out.push(etykieta);
      }
    } else if (kod !== undefined) {
      out.push(<code key={k}>{kod}</code>);
    } else if (mocny !== undefined) {
      out.push(<strong key={k}>{mocny}</strong>);
    } else if (kursywa !== undefined) {
      out.push(<em key={k}>{kursywa}</em>);
    } else {
      out.push(caly);
    }
    ostatni = start + caly.length;
  }
  if (ostatni < s.length) out.push(s.slice(ostatni));
  return out.length === 1 ? out[0] : <Fragment>{out}</Fragment>;
}

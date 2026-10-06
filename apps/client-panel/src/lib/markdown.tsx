import * as React from "react";

/**
 * Minimal, safe-by-construction Markdown → React renderer for legal documents.
 *
 * We deliberately avoid `react-markdown` / `marked` / `remark-gfm` to keep the
 * panel bundle small and the trust surface minimal. Legal docs use a tightly
 * scoped subset of Markdown (headers, paragraphs, lists with indented
 * sub-points "1)", tables, blockquotes, links, **bold**, *italic*,
 * `inline code`) so we can render them with a small parser.
 *
 * Security stance:
 *  - All text is escaped via React (we never call `dangerouslySetInnerHTML`).
 *  - Only `http(s)` and `mailto` links are honored; anything else is treated
 *    as plain text.
 *  - HTML tags inside the source are rendered literally (escaped).
 *
 * Kolory z tokenów panelu (text-foreground, text-verris-body, text-data-hi…),
 * więc treść działa w motywie jasnym i ciemnym (klasa `.v2-content` u przodka).
 */

interface RenderOptions {
  /** Optional className applied to the wrapping <div> for prose styling. */
  className?: string;
}

export interface LegalHeading {
  level: number;
  text: string;
  id: string;
}

const URL_RE = /^(https?:\/\/|mailto:)/i;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const LIST_RE = /^(\d+)\.\s+(.*)$|^[-*]\s+(.*)$/;
const SUB_RE = /^\s+(?:\d+[.)]|[a-z]\)|[-*])\s+/;
const TABLE_SEP_RE = /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/;

/** Tekst nagłówka bez znaczników inline (do spisu treści i kotwic). */
function plain(text: string): string {
  return text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

function slug(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return s || "sekcja";
}

/**
 * Wszystkie nagłówki dokumentu z unikalnymi kotwicami — w tej samej kolejności,
 * w jakiej renderer nadaje im `id`. Spis treści i treść korzystają z tej funkcji,
 * więc linki ze spisu zawsze trafiają w istniejący nagłówek.
 */
export function legalHeadings(source: string): LegalHeading[] {
  const seen = new Map<string, number>();
  const out: LegalHeading[] = [];
  for (const raw of source.split(/\r?\n/)) {
    const m = HEADING_RE.exec(raw.trimEnd());
    if (!m) continue;
    const text = plain(m[2]);
    const base = slug(text);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    out.push({ level: m[1].length, text, id: n === 1 ? base : `${base}-${n}` });
  }
  return out;
}

/**
 * Spis treści: nagłówki `##` i `###`. Pojedynczy `#` to tytuł dokumentu
 * (strona ma własny h1), więc go pomijamy.
 */
export function legalToc(source: string): LegalHeading[] {
  return legalHeadings(source).filter((h) => h.level === 2 || h.level === 3);
}

function renderInline(line: string, keyPrefix: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let cursor = 0;
  // Iterate via regex covering links, bold, italic, inline code in priority.
  const pattern = /(\[[^\]]+\]\([^)]+\))|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(`[^`]+`)/g;
  let match: RegExpExecArray | null;
  let i = 0;
  while ((match = pattern.exec(line))) {
    const before = line.slice(cursor, match.index);
    if (before) out.push(<React.Fragment key={`${keyPrefix}-t-${i++}`}>{before}</React.Fragment>);

    const token = match[0];
    if (token.startsWith("[")) {
      const linkMatch = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(token);
      if (linkMatch && URL_RE.test(linkMatch[2])) {
        out.push(
          <a
            key={`${keyPrefix}-a-${i++}`}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="text-data-hi underline underline-offset-2 hover:text-foreground"
          >
            {linkMatch[1]}
          </a>,
        );
      } else {
        out.push(<React.Fragment key={`${keyPrefix}-as-${i++}`}>{token}</React.Fragment>);
      }
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-foreground">
          {token.slice(2, -2)}
        </strong>,
      );
    } else if (token.startsWith("*")) {
      out.push(
        <em key={`${keyPrefix}-i-${i++}`} className="italic">
          {token.slice(1, -1)}
        </em>,
      );
    } else if (token.startsWith("`")) {
      out.push(
        <code
          key={`${keyPrefix}-c-${i++}`}
          className="rounded bg-raised px-1.5 py-0.5 font-mono text-[0.85em] text-foreground [overflow-wrap:anywhere]"
        >
          {token.slice(1, -1)}
        </code>,
      );
    }
    cursor = match.index + token.length;
  }
  const tail = line.slice(cursor);
  if (tail) out.push(<React.Fragment key={`${keyPrefix}-tail`}>{tail}</React.Fragment>);
  return out;
}

const cells = (row: string) =>
  row
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const HEADING_CLS = [
  "font-display text-2xl font-extrabold tracking-tight text-foreground mt-2 mb-6",
  "font-display text-xl font-bold tracking-tight text-foreground mt-12 mb-4",
  "font-display text-lg font-bold text-foreground mt-8 mb-3",
  "text-base font-semibold text-foreground mt-6 mb-2",
  "text-base font-semibold text-foreground mt-4 mb-2",
  "text-sm font-semibold uppercase tracking-wider text-foreground mt-3 mb-2",
];

export function renderLegalMarkdown(source: string, opts: RenderOptions = {}): React.ReactElement {
  const lines = source.split(/\r?\n/);
  const headings = legalHeadings(source);
  let headingIdx = 0;
  const blocks: React.ReactElement[] = [];
  let i = 0;
  let blockId = 0;
  const nextKey = () => `b-${blockId++}`;

  while (i < lines.length) {
    const line = lines[i].trimEnd();

    if (line.length === 0) {
      i += 1;
      continue;
    }

    // Headers
    const hm = HEADING_RE.exec(line);
    if (hm) {
      const level = hm[1].length;
      const text = hm[2];
      const id = headings[headingIdx++]?.id;
      // Strona dokumentu ma własny h1 (tytuł) — nagłówki treści o poziom niżej, jeden h1 na stronie (WCAG 1.3.1).
      const Tag = `h${Math.min(level + 1, 6)}` as keyof React.JSX.IntrinsicElements;
      // „§12. Domeny” — numer paragrafu wyróżniony, żeby łatwo było go odnaleźć wzrokiem.
      const par = /^(§\s*\d+[a-z]?\.?)\s+(.*)$/.exec(text);
      blocks.push(
        <Tag key={nextKey()} id={id} className={`${HEADING_CLS[level - 1]} scroll-mt-24`}>
          {par ? (
            <>
              <span className="mr-2 font-mono text-[0.85em] font-medium text-data-hi">{par[1]}</span>
              {renderInline(par[2], `${blockId}`)}
            </>
          ) : (
            renderInline(text, `${blockId}`)
          )}
        </Tag>,
      );
      i += 1;
      continue;
    }

    // Blockquote
    if (line.startsWith("> ")) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith("> ")) {
        buf.push(lines[i].slice(2));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={nextKey()}
          className="my-5 border-l-2 border-line-strong py-1 pl-4 text-muted-foreground"
        >
          {buf.map((bl, k) => (
            <p key={k} className="mb-2 last:mb-0">
              {renderInline(bl, `${blockId}-${k}`)}
            </p>
          ))}
        </blockquote>,
      );
      continue;
    }

    // Table (GFM): wiersz nagłówka + wiersz separatora.
    if (line.startsWith("|") && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1].trim())) {
      const head = cells(line);
      const rows: string[][] = [];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        rows.push(cells(lines[i]));
        i += 1;
      }
      const k = nextKey();
      blocks.push(
        <table key={k} className="legal-table my-6 w-full border-collapse text-left text-[0.92em] leading-normal">
          <thead>
            <tr>
              {head.map((h, c) => (
                <th key={c} scope="col" className="border-b border-line-strong px-3 py-2 align-bottom font-semibold text-foreground">
                  {renderInline(h, `${k}-h${c}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, ri) => (
              <tr key={ri} className="border-b border-line">
                {head.map((h, c) => (
                  <td key={c} data-label={plain(h)} className="px-3 py-2 align-top [overflow-wrap:anywhere]">
                    {renderInline(r[c] ?? "", `${k}-${ri}-${c}`)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      );
      continue;
    }

    // Lists (ordered / unordered) z wciętymi podpunktami („1) …”), które zostają przy swoim punkcie.
    const lm = LIST_RE.exec(line);
    if (lm) {
      const ordered = lm[1] !== undefined;
      const start = ordered ? Number(lm[1]) : 1;
      const items: { text: string; sub: string[] }[] = [];
      while (i < lines.length) {
        const cur = lines[i].trimEnd();
        const m2 = LIST_RE.exec(cur);
        if (m2 && (m2[1] !== undefined) === ordered) {
          items.push({ text: m2[2] ?? m2[3], sub: [] });
        } else if (items.length > 0 && SUB_RE.test(cur)) {
          items[items.length - 1].sub.push(cur.trim());
        } else if (items.length > 0 && /^\s+\S/.test(cur)) {
          // Wcięta kontynuacja: dopisujemy do ostatniego podpunktu albo punktu.
          const last = items[items.length - 1];
          if (last.sub.length > 0) last.sub[last.sub.length - 1] += ` ${cur.trim()}`;
          else last.text += ` ${cur.trim()}`;
        } else {
          break;
        }
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={nextKey()}
          start={ordered && start !== 1 ? start : undefined}
          className={`my-4 space-y-2 pl-6 marker:text-muted-foreground ${ordered ? "list-decimal" : "list-disc"}`}
        >
          {items.map((it, idx) => (
            <li key={idx} className="pl-1">
              {renderInline(it.text, `${blockId}-${idx}`)}
              {it.sub.length > 0 && (
                <ul className="mt-2 space-y-1.5">
                  {it.sub.map((s, si) => (
                    <li key={si}>{renderInline(s, `${blockId}-${idx}-${si}`)}</li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="my-10 border-line" />);
      i += 1;
      continue;
    }

    // Plain paragraph (gather subsequent non-blank, non-special lines)
    const paragraph: string[] = [line.trim()];
    i += 1;
    while (i < lines.length) {
      const peek = lines[i].trimEnd();
      if (
        peek.length === 0 ||
        HEADING_RE.test(peek) ||
        peek.startsWith("> ") ||
        peek.startsWith("|") ||
        LIST_RE.test(peek) ||
        /^-{3,}$/.test(peek)
      ) {
        break;
      }
      paragraph.push(peek.trim());
      i += 1;
    }
    blocks.push(
      <p key={nextKey()} className="my-4">
        {renderInline(paragraph.join(" "), `${blockId}-p`)}
      </p>,
    );
  }

  return <div className={opts.className ?? "legal-prose text-verris-body"}>{blocks}</div>;
}

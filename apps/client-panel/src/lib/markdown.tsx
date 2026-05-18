import * as React from "react";

/**
 * Minimal, safe-by-construction Markdown → React renderer for legal documents.
 *
 * We deliberately avoid `react-markdown` / `marked` / `remark-gfm` to keep the
 * panel bundle small and the trust surface minimal. Legal docs use a tightly
 * scoped subset of Markdown (headers, paragraphs, lists, blockquotes, links,
 * **bold**, *italic*, `inline code`) so we can render them with a small parser.
 *
 * Security stance:
 *  - All text is escaped via React (we never call `dangerouslySetInnerHTML`).
 *  - Only `http(s)` and `mailto` links are honored; anything else is treated
 *    as plain text.
 *  - HTML tags inside the source are rendered literally (escaped).
 */

interface RenderOptions {
  /** Optional className applied to the wrapping <div> for prose styling. */
  className?: string;
}

const URL_RE = /^(https?:\/\/|mailto:)/i;

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
      if (linkMatch) {
        const text = linkMatch[1];
        const href = linkMatch[2];
        if (URL_RE.test(href)) {
          out.push(
            <a
              key={`${keyPrefix}-a-${i++}`}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sky-400 hover:text-sky-300 underline underline-offset-2"
            >
              {text}
            </a>,
          );
        } else {
          out.push(<React.Fragment key={`${keyPrefix}-as-${i++}`}>{token}</React.Fragment>);
        }
      } else {
        out.push(<React.Fragment key={`${keyPrefix}-bk-${i++}`}>{token}</React.Fragment>);
      }
    } else if (token.startsWith("**")) {
      out.push(
        <strong key={`${keyPrefix}-b-${i++}`} className="font-semibold text-white">
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
          className="rounded bg-neutral-800/60 px-1.5 py-0.5 font-mono text-[0.85em] text-sky-300"
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

export function renderLegalMarkdown(source: string, opts: RenderOptions = {}): React.ReactElement {
  const lines = source.split(/\r?\n/);
  const blocks: React.ReactElement[] = [];
  let i = 0;
  let blockId = 0;
  const nextKey = () => `b-${blockId++}`;

  while (i < lines.length) {
    const raw = lines[i];
    const line = raw.trimEnd();

    if (line.length === 0) {
      i += 1;
      continue;
    }

    // Headers
    if (/^#{1,6}\s+/.test(line)) {
      const m = /^(#{1,6})\s+(.*)$/.exec(line)!;
      const level = m[1].length;
      const text = m[2];
      const Tag = (`h${Math.min(level, 6)}`) as keyof React.JSX.IntrinsicElements;
      const cls = [
        "text-3xl font-extrabold mt-10 mb-6 text-white tracking-tight",
        "text-2xl font-bold mt-8 mb-4 text-white",
        "text-xl font-semibold mt-6 mb-3 text-neutral-100",
        "text-lg font-semibold mt-5 mb-2 text-neutral-100",
        "text-base font-semibold mt-4 mb-2 text-neutral-200",
        "text-sm font-semibold mt-3 mb-2 text-neutral-200 uppercase tracking-wider",
      ][level - 1];
      blocks.push(
        <Tag key={nextKey()} className={cls}>
          {renderInline(text, `${blockId}`)}
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
          className="border-l-2 border-sky-500/50 pl-4 py-1 my-4 text-neutral-300 italic"
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

    // Lists (ordered / unordered)
    const listMatch = /^(\s*)(\d+\.|[-*])\s+(.*)$/.exec(line);
    if (listMatch) {
      const ordered = /\d+\./.test(listMatch[2]);
      const items: string[] = [];
      while (i < lines.length) {
        const m2 = /^(\s*)(\d+\.|[-*])\s+(.*)$/.exec(lines[i]);
        if (!m2) break;
        items.push(m2[3]);
        i += 1;
      }
      const ListTag = ordered ? "ol" : "ul";
      blocks.push(
        <ListTag
          key={nextKey()}
          className={`my-3 space-y-1.5 pl-6 text-neutral-300 ${
            ordered ? "list-decimal" : "list-disc"
          }`}
        >
          {items.map((it, idx) => (
            <li key={idx}>{renderInline(it, `${blockId}-${idx}`)}</li>
          ))}
        </ListTag>,
      );
      continue;
    }

    // Horizontal rule
    if (/^-{3,}$/.test(line)) {
      blocks.push(<hr key={nextKey()} className="my-8 border-white/10" />);
      i += 1;
      continue;
    }

    // Plain paragraph (gather subsequent non-blank, non-special lines)
    const paragraph: string[] = [line];
    i += 1;
    while (i < lines.length) {
      const peek = lines[i].trimEnd();
      if (
        peek.length === 0 ||
        /^#{1,6}\s+/.test(peek) ||
        peek.startsWith("> ") ||
        /^(\s*)(\d+\.|[-*])\s+/.test(peek) ||
        /^-{3,}$/.test(peek)
      ) {
        break;
      }
      paragraph.push(peek);
      i += 1;
    }
    blocks.push(
      <p key={nextKey()} className="leading-relaxed my-3 text-neutral-300">
        {renderInline(paragraph.join(" "), `${blockId}-p`)}
      </p>,
    );
  }

  return (
    <div className={opts.className ?? "prose prose-invert max-w-none text-neutral-200"}>
      {blocks}
    </div>
  );
}

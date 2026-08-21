// Prosty ekstraktor czystego tekstu z treści Lexical (Payload richText).
// Używany przez /llms-full.txt — nie renderuje HTML, tylko zbiera tekst z węzłów.

type LexNode = {
  type?: string;
  tag?: string;
  text?: string;
  children?: LexNode[];
  root?: LexNode;
  [k: string]: unknown;
};

function walk(node: LexNode | undefined, out: string[]): void {
  if (!node) return;
  if (typeof node.text === 'string' && node.text.trim() !== '') {
    out.push(node.text);
  }
  const kids = Array.isArray(node.children) ? node.children : [];
  for (const child of kids) walk(child, out);

  // Akapity, nagłówki i elementy list rozdzielamy nową linią.
  const block = ['paragraph', 'heading', 'listitem', 'quote'];
  if (node.type && block.includes(node.type)) out.push('\n');
}

export function lexicalToText(content: unknown): string {
  try {
    const root = (content as LexNode | undefined)?.root;
    if (!root) return '';
    const out: string[] = [];
    walk(root, out);
    return out
      .join(' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  } catch {
    return '';
  }
}

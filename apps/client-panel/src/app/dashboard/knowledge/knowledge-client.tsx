'use client';

import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Search } from 'lucide-react';
import { fetchKbArticle, type KbArticle, type KbListItem } from './knowledge-actions';

/** Lekki render Markdown → HTML na potrzeby czytnika w panelu (treść od zespołu). */
function mdToHtml(md: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, l: string, u: string) => `<a href="${u}" target="_blank" rel="noopener" style="color:#34e5a0">${l}</a>`)
      .replace(/`([^`]+)`/g, '<code style="background:rgba(255,255,255,.08);padding:1px 5px;border-radius:4px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const l = Math.min(h[1].length + 1, 4); out.push(`<h${l}>${inline(h[2])}</h${l}>`); i++; continue; }
    if (/^\d+\.\s+/.test(line)) {
      const it: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { it.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol>${it.join('')}</ol>`); continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const it: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { it.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i++; }
      out.push(`<ul>${it.join('')}</ul>`); continue;
    }
    const buf: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

export function KnowledgeClient({
  articles,
  initialArticleId,
  initialQuery = '',
}: {
  articles: KbListItem[];
  initialArticleId: string | null;
  initialQuery?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [openId, setOpenId] = useState<string | null>(initialArticleId);
  const [article, setArticle] = useState<KbArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!openId) { setArticle(null); return; }
    setLoading(true);
    void fetchKbArticle(openId).then(setArticle).finally(() => setLoading(false));
  }, [openId]);

  const filtered = articles.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()));
  const html = useMemo(() => (article ? mdToHtml(article.content) : ''), [article]);

  // --- Reading view ---
  if (openId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => setOpenId(null)} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Wróć do listy
        </button>
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : article ? (
          <article className="max-w-3xl">
            <h1 className="text-xl font-bold text-white">{article.title}</h1>
            <p className="mt-1 text-xs text-neutral-500">
              {article.category ? `${article.category} · ` : ''}
              {article.readingMin ? `⏱ ${article.readingMin} min · ` : ''}
              Aktualizacja: {new Date(article.updatedAt).toLocaleDateString('pl-PL')}
            </p>
            <div
              className="mt-4 text-sm leading-relaxed text-neutral-200 [&_a]:text-emerald-400 [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-white [&_li]:my-1 [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc"
              dangerouslySetInnerHTML={{ __html: html }}
            />
            {article.faq && article.faq.length > 0 ? (
              <section className="mt-6">
                <h2 className="text-lg font-bold text-white">Najczęstsze pytania</h2>
                <div className="mt-2 divide-y divide-white/10 rounded-xl border border-white/10">
                  {article.faq.map((f, i) => (
                    <details key={i} className="p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-white">{f.q}</summary>
                      <p className="mt-2 text-sm text-neutral-300">{f.a}</p>
                    </details>
                  ))}
                </div>
              </section>
            ) : null}
            {article.related && article.related.length > 0 ? (
              <section className="mt-6">
                <h2 className="text-sm font-bold uppercase tracking-wide text-neutral-400">Powiązane</h2>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {article.related.map((r) => (
                    <button
                      key={r.slug}
                      type="button"
                      onClick={() => setOpenId(r.slug)}
                      className="rounded-lg border border-white/10 bg-white/[0.02] p-3 text-left hover:bg-white/[0.05]"
                    >
                      <span className="block text-sm font-medium text-white">{r.title}</span>
                      {r.excerpt ? <span className="block text-xs text-neutral-500">{r.excerpt}</span> : null}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}
            <a
              href={`https://pomoc.verris.pl/a/${article.id}`}
              target="_blank"
              rel="noopener"
              className="mt-6 inline-flex items-center gap-1.5 text-sm text-emerald-400 hover:text-emerald-300"
            >
              Otwórz w pełnej Bazie wiedzy <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </article>
        ) : (
          <p className="py-12 text-center text-sm text-neutral-400">Nie znaleziono artykułu.</p>
        )}
      </div>
    );
  }

  // --- List view ---
  return (
    <div className="space-y-4">
      <label className="relative block max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj w bazie wiedzy…"
          className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-sm text-white outline-none focus:border-white/30"
        />
      </label>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-12 text-center text-sm text-neutral-500">
          <BookOpen className="h-8 w-8 opacity-20" />
          {articles.length === 0 ? 'Baza wiedzy jest jeszcze pusta.' : 'Brak artykułów pasujących do wyszukiwania.'}
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {filtered.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => setOpenId(a.id)}
              className="flex items-start gap-3 rounded-xl border border-white/10 bg-white/[0.02] p-4 text-left hover:bg-white/[0.05]"
            >
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-emerald-300" />
              <span>
                <span className="block text-sm font-medium text-white">{a.title}</span>
                {a.category ? <span className="block text-xs text-neutral-500">{a.category}</span> : null}
              </span>
            </button>
          ))}
        </div>
      )}

      <p className="pt-2 text-xs text-neutral-500">
        Pełna baza wiedzy dostępna też publicznie na{' '}
        <a href="https://pomoc.verris.pl" target="_blank" rel="noopener" className="text-emerald-400 hover:underline">
          pomoc.verris.pl
        </a>
        .
      </p>
    </div>
  );
}

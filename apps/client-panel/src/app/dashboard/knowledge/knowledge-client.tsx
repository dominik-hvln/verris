'use client';

import { useEffect, useState } from 'react';
import { MarkdownKb } from '@verris/ui/markdown-kb';
import { ArrowLeft, BookOpen, ExternalLink, Loader2, Search } from 'lucide-react';
import { fetchKbArticle, type KbArticle, type KbListItem } from './knowledge-actions';

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
  // Artykuł z URL-a ładuje się od razu po montażu.
  const [loading, setLoading] = useState(Boolean(initialArticleId));

  // Stan „ładowanie / brak artykułu” ustawiamy przy samej zmianie, efekt tylko pobiera.
  const openArticle = (id: string | null) => {
    if (id === openId) return;
    setOpenId(id);
    if (id) setLoading(true);
    else setArticle(null);
  };

  useEffect(() => {
    if (!openId) return;
    void fetchKbArticle(openId).then(setArticle).finally(() => setLoading(false));
  }, [openId]);

  const filtered = articles.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()));

  // --- Reading view ---
  if (openId) {
    return (
      <div className="space-y-4">
        <button type="button" onClick={() => openArticle(null)} className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white">
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
            {/* Ten sam renderer co obsługa (@verris/ui/markdown-kb, reguły pomoc.verris.pl) — bez wstawiania HTML. */}
            <MarkdownKb
              tekst={article.content}
              className="mt-4 text-sm leading-relaxed text-neutral-200 [&_a]:text-emerald-400 [&_a]:underline [&_h2]:mt-5 [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-white [&_h4]:mt-3 [&_h4]:font-semibold [&_h4]:text-white [&_li]:my-1 [&_ol]:my-2 [&_ol]:pl-5 [&_ol]:list-decimal [&_p]:my-2 [&_ul]:my-2 [&_ul]:pl-5 [&_ul]:list-disc [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-white/10 [&_pre]:bg-black/40 [&_pre]:p-3 [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_blockquote]:my-3 [&_blockquote]:border-l-2 [&_blockquote]:border-emerald-400/60 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-400 [&_hr]:my-4 [&_hr]:border-white/10 [&_img]:max-w-full [&_img]:rounded-lg"
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
                      onClick={() => openArticle(r.slug)}
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
          aria-label="Szukaj w bazie wiedzy"
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
              onClick={() => openArticle(a.id)}
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
        <a href="https://pomoc.verris.pl" target="_blank" rel="noopener" className="text-emerald-400 underline">
          pomoc.verris.pl
        </a>
        .
      </p>
    </div>
  );
}

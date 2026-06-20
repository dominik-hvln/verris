'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, BookOpen, Loader2, Search } from 'lucide-react';
import { fetchKbArticle, type KbArticle, type KbListItem } from './knowledge-actions';

export function KnowledgeClient({
  articles,
  initialArticleId,
}: {
  articles: KbListItem[];
  initialArticleId: string | null;
}) {
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(initialArticleId);
  const [article, setArticle] = useState<KbArticle | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!openId) {
      setArticle(null);
      return;
    }
    setLoading(true);
    void fetchKbArticle(openId)
      .then(setArticle)
      .finally(() => setLoading(false));
  }, [openId]);

  const filtered = articles.filter((a) => a.title.toLowerCase().includes(query.trim().toLowerCase()));

  // --- Reading view ---
  if (openId) {
    return (
      <div className="space-y-4">
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="inline-flex items-center gap-1.5 text-sm text-neutral-400 hover:text-white"
        >
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
              Aktualizacja: {new Date(article.updatedAt).toLocaleDateString('pl-PL')}
            </p>
            <div className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-neutral-200">
              {article.content}
            </div>
          </article>
        ) : (
          <p className="py-12 text-center text-sm text-neutral-400">
            Nie znaleziono artykułu (mógł zostać usunięty).
          </p>
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
          {articles.length === 0
            ? 'Baza wiedzy jest jeszcze pusta.'
            : 'Brak artykułów pasujących do wyszukiwania.'}
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
              <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
              <span className="text-sm font-medium text-white">{a.title}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Pencil, Trash2, Save, Eye, FileText, FolderPlus } from 'lucide-react';
import {
  createArticle,
  createCategory,
  deleteArticle,
  deleteCategory,
  fetchArticles,
  fetchCategories,
  getArticle,
  updateArticle,
  updateCategory,
  type ArticleInput,
  type KbArticle,
  type KbArticleListItem,
  type KbCategory,
} from './actions';

/** Lekki renderer Markdown → HTML na potrzeby podglądu (treść od autora). */
function mdToHtml(md: string): string {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const inline = (s: string) =>
    esc(s)
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_m, a: string, u: string) =>
        /^https?:\/\//.test(u) ? `<img src="${u}" alt="${a}" style="max-width:100%;border-radius:8px"/>` : '')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, l: string, u: string) => `<a href="${u}" style="color:#34e5a0">${l}</a>`)
      .replace(/`([^`]+)`/g, '<code style="background:#12241b;padding:1px 5px;border-radius:4px">$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>');
  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    if (line.trim().startsWith('```')) {
      const buf: string[] = []; i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { buf.push(lines[i]); i++; }
      i++;
      out.push(`<pre style="background:#0b1712;padding:12px;border-radius:8px;overflow:auto"><code>${esc(buf.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,4})\s+(.*)$/.exec(line);
    if (h) { const l = Math.min(h[1].length + 1, 4); out.push(`<h${l}>${inline(h[2])}</h${l}>`); i++; continue; }
    if (line.startsWith('> ')) {
      const buf: string[] = [];
      while (i < lines.length && lines[i].startsWith('> ')) { buf.push(lines[i].slice(2)); i++; }
      out.push(`<blockquote style="border-left:3px solid #34e5a0;padding-left:12px;color:#9aa39c">${inline(buf.join(' '))}</blockquote>`);
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      const it: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { it.push(`<li>${inline(lines[i].replace(/^\d+\.\s+/, ''))}</li>`); i++; }
      out.push(`<ol style="padding-left:22px">${it.join('')}</ol>`); continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const it: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) { it.push(`<li>${inline(lines[i].replace(/^[-*]\s+/, ''))}</li>`); i++; }
      out.push(`<ul style="padding-left:22px">${it.join('')}</ul>`); continue;
    }
    const buf: string[] = [line]; i++;
    while (i < lines.length && lines[i].trim() && !/^(#{1,4}\s|[-*]\s|\d+\.\s|>\s|```)/.test(lines[i])) { buf.push(lines[i]); i++; }
    out.push(`<p>${inline(buf.join(' '))}</p>`);
  }
  return out.join('\n');
}

const EMPTY: ArticleInput = { title: '', categoryId: '', excerpt: '', bodyMarkdown: '', status: 'DRAFT', seoTitle: '', seoDescription: '' };

export function KbManager() {
  const [cats, setCats] = useState<KbCategory[]>([]);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [articles, setArticles] = useState<KbArticleListItem[]>([]);
  const [editing, setEditing] = useState<KbArticle | 'new' | null>(null);
  const [form, setForm] = useState<ArticleInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});

  async function reloadCats() {
    setCats(await fetchCategories());
  }
  useEffect(() => { void reloadCats(); }, []);
  useEffect(() => {
    if (selCat) void fetchArticles(selCat).then(setArticles);
    else setArticles([]);
  }, [selCat]);

  const tops = useMemo(() => cats.filter((c) => !c.parentId), [cats]);
  const childrenOf = (id: string) => cats.filter((c) => c.parentId === id);

  // ---- category actions
  async function addCategory(parentId: string | null) {
    const name = window.prompt(parentId ? 'Nazwa podkategorii:' : 'Nazwa kategorii:');
    if (!name?.trim()) return;
    const r = await createCategory({ name: name.trim(), parentId });
    if (!r.ok) setMsg({ err: r.error }); else void reloadCats();
  }
  async function renameCategory(c: KbCategory) {
    const name = window.prompt('Nowa nazwa:', c.name);
    if (!name?.trim() || name === c.name) return;
    const r = await updateCategory(c.id, { name: name.trim() });
    if (!r.ok) setMsg({ err: r.error }); else void reloadCats();
  }
  async function removeCategory(c: KbCategory) {
    if (!window.confirm(`Usunąć kategorię „${c.name}"? (musi być pusta)`)) return;
    const r = await deleteCategory(c.id);
    if (!r.ok) setMsg({ err: r.error });
    else { if (selCat === c.id) setSelCat(null); void reloadCats(); }
  }

  // ---- article actions
  function openNew() {
    if (!selCat) { setMsg({ err: 'Najpierw wybierz kategorię.' }); return; }
    setForm({ ...EMPTY, categoryId: selCat });
    setEditing('new');
    setMsg({});
  }
  async function openEdit(id: string) {
    const a = await getArticle(id);
    if (!a) { setMsg({ err: 'Nie udało się wczytać artykułu.' }); return; }
    setEditing(a);
    setForm({
      title: a.title, slug: a.slug, categoryId: a.categoryId, excerpt: a.excerpt ?? '',
      bodyMarkdown: a.bodyMarkdown, status: a.status, seoTitle: a.seoTitle ?? '', seoDescription: a.seoDescription ?? '',
    });
    setMsg({});
  }
  async function save() {
    setBusy(true); setMsg({});
    const payload: ArticleInput = { ...form, title: form.title.trim() };
    const r = editing === 'new' ? await createArticle(payload) : await updateArticle((editing as KbArticle).id, payload);
    setBusy(false);
    if (!r.ok) { setMsg({ err: r.error }); return; }
    setMsg({ ok: 'Zapisano.' });
    setEditing(r.ok ? (r.data as KbArticle) : null);
    if (selCat) setArticles(await fetchArticles(selCat));
  }
  async function removeArticle() {
    if (editing === 'new' || !editing) return;
    if (!window.confirm(`Usunąć artykuł „${editing.title}"?`)) return;
    const r = await deleteArticle(editing.id);
    if (!r.ok) { setMsg({ err: r.error }); return; }
    setEditing(null);
    if (selCat) setArticles(await fetchArticles(selCat));
  }

  const set = (k: keyof ArticleInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Kategorie */}
      <aside className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Kategorie</h2>
          <button onClick={() => void addCategory(null)} className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">
            <Plus className="h-3.5 w-3.5" /> Kategoria
          </button>
        </div>
        {tops.length === 0 ? <p className="text-xs text-white/40">Brak kategorii — dodaj pierwszą.</p> : null}
        <ul className="space-y-1">
          {tops.map((c) => (
            <li key={c.id}>
              <CatRow c={c} sel={selCat === c.id} onSelect={() => setSelCat(c.id)} onAddSub={() => void addCategory(c.id)} onRename={() => void renameCategory(c)} onDelete={() => void removeCategory(c)} />
              {childrenOf(c.id).length > 0 ? (
                <ul className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
                  {childrenOf(c.id).map((ch) => (
                    <li key={ch.id}>
                      <CatRow c={ch} sel={selCat === ch.id} onSelect={() => setSelCat(ch.id)} onRename={() => void renameCategory(ch)} onDelete={() => void removeCategory(ch)} />
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      </aside>

      {/* Prawa kolumna */}
      <section className="space-y-4">
        {msg.err ? <p className="rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300">{msg.err}</p> : null}
        {msg.ok ? <p className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-200">{msg.ok}</p> : null}

        {!editing ? (
          <>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">
                {selCat ? cats.find((c) => c.id === selCat)?.name ?? 'Artykuły' : 'Wybierz kategorię'}
              </h2>
              <button onClick={openNew} disabled={!selCat} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-40">
                <Plus className="h-4 w-4" /> Nowy artykuł
              </button>
            </div>
            {selCat ? (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
                {articles.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => void openEdit(a.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5">
                      <span className="flex items-center gap-2 text-white"><FileText className="h-4 w-4 text-white/40" />{a.title}</span>
                      <span className="flex items-center gap-3 text-xs">
                        <span className={a.status === 'PUBLISHED' ? 'rounded-md border border-emerald-500/30 bg-emerald-500/15 px-2 py-0.5 text-emerald-300' : 'rounded-md border border-white/15 bg-white/5 px-2 py-0.5 text-white/60'}>
                          {a.status === 'PUBLISHED' ? 'opublikowany' : 'szkic'}
                        </span>
                        <span className="text-white/30">{a.views} wyśw.</span>
                        <Pencil className="h-4 w-4 text-white/30" />
                      </span>
                    </button>
                  </li>
                ))}
                {articles.length === 0 ? <li className="px-4 py-8 text-center text-white/40">Brak artykułów w tej kategorii.</li> : null}
              </ul>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-center text-white/40">
                Wybierz kategorię z lewej, aby zobaczyć i edytować artykuły.
              </p>
            )}
          </>
        ) : (
          <Editor
            form={form} set={set} setForm={setForm} cats={cats} busy={busy}
            isNew={editing === 'new'}
            onSave={() => void save()} onDelete={() => void removeArticle()} onClose={() => setEditing(null)}
          />
        )}
      </section>
    </div>
  );
}

function CatRow({ c, sel, onSelect, onAddSub, onRename, onDelete }: {
  c: KbCategory; sel: boolean; onSelect: () => void; onAddSub?: () => void; onRename: () => void; onDelete: () => void;
}) {
  return (
    <div className={`group flex items-center justify-between rounded-lg px-2 py-1.5 ${sel ? 'bg-emerald-500/15 text-emerald-100' : 'text-white/80 hover:bg-white/5'}`}>
      <button onClick={onSelect} className="flex-1 truncate text-left text-sm">{c.name}</button>
      <span className="ml-1 hidden items-center gap-1 group-hover:flex">
        {onAddSub ? <button title="Podkategoria" onClick={onAddSub} className="text-white/40 hover:text-white"><FolderPlus className="h-3.5 w-3.5" /></button> : null}
        <button title="Zmień nazwę" onClick={onRename} className="text-white/40 hover:text-white"><Pencil className="h-3.5 w-3.5" /></button>
        <button title="Usuń" onClick={onDelete} className="text-white/40 hover:text-rose-400"><Trash2 className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  );
}

function Editor({ form, set, setForm, cats, busy, isNew, onSave, onDelete, onClose }: {
  form: ArticleInput;
  set: (k: keyof ArticleInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<ArticleInput>>;
  cats: KbCategory[]; busy: boolean; isNew: boolean;
  onSave: () => void; onDelete: () => void; onClose: () => void;
}) {
  const preview = useMemo(() => mdToHtml(form.bodyMarkdown || ''), [form.bodyMarkdown]);
  const inputCls = 'w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{isNew ? 'Nowy artykuł' : 'Edycja artykułu'}</h2>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10">Wróć</button>
          {!isNew ? <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-4 w-4" /> Usuń</button> : null}
          <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Tytuł</span>
          <input className={inputCls} value={form.title} onChange={set('title')} placeholder="Jak podpiąć domenę do hostingu" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Slug (opcjonalnie — auto z tytułu)</span>
          <input className={inputCls} value={form.slug ?? ''} onChange={set('slug')} placeholder="jak-podpiac-domene" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Kategoria</span>
          <select className={inputCls} value={form.categoryId} onChange={set('categoryId')}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{c.name}</option>)}
          </select></label>
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Status</span>
          <select className={inputCls} value={form.status} onChange={set('status')}>
            <option value="DRAFT">Szkic</option>
            <option value="PUBLISHED">Opublikowany</option>
          </select></label>
      </div>

      <label className="block space-y-1"><span className="text-xs font-medium text-white/70">Wstęp / lead (excerpt)</span>
        <input className={inputCls} value={form.excerpt ?? ''} onChange={set('excerpt')} placeholder="Krótkie streszczenie widoczne na liście i w wynikach Google." /></label>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Treść (Markdown)</span>
          <textarea className={`${inputCls} min-h-[420px] font-mono text-[13px] leading-relaxed`} value={form.bodyMarkdown} onChange={set('bodyMarkdown')}
            placeholder={'# Nagłówek\n\nAkapit tekstu z **pogrubieniem** i [linkiem](https://verris.pl).\n\n- punkt\n- punkt\n\n1. krok\n2. krok'} /></label>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-white/70"><Eye className="h-3.5 w-3.5" /> Podgląd</span>
          <div className="min-h-[420px] overflow-auto rounded-xl border border-white/10 bg-white p-5 text-[15px] leading-relaxed text-neutral-800 [&_a]:text-emerald-600 [&_blockquote]:text-neutral-500 [&_code]:text-neutral-900 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_li]:my-1 [&_p]:my-2 [&_pre]:text-white"
            dangerouslySetInnerHTML={{ __html: preview }} />
        </div>
      </div>

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white/80">SEO (opcjonalnie — nadpisuje tytuł/opis)</summary>
        <div className="mt-3 space-y-3">
          <label className="block space-y-1"><span className="text-xs font-medium text-white/70">SEO title</span>
            <input className={inputCls} value={form.seoTitle ?? ''} onChange={set('seoTitle')} /></label>
          <label className="block space-y-1"><span className="text-xs font-medium text-white/70">SEO description</span>
            <input className={inputCls} value={form.seoDescription ?? ''} onChange={set('seoDescription')} /></label>
        </div>
      </details>
    </div>
  );
}

'use client';

import { Select } from '@/components/select';
import { useEffect, useMemo, useState, useId } from 'react';
import { Loader2, Plus, Pencil, Trash2, Save, Eye, FileText, FolderPlus } from 'lucide-react';
import {
  createArticle,
  createCategory,
  deleteArticle,
  deleteCategory,
  fetchArticles,
  fetchCategories,
  fetchCta,
  getArticle,
  saveCta,
  updateArticle,
  updateCategory,
  type ArticleInput,
  type KbArticle,
  type KbArticleListItem,
  type KbCategory,
  type KbCtaConfig,
} from './actions';
import { potwierdz, zapytaj } from "@/components/potwierdz";
import { Checkbox } from '@/components/checkbox';
import { NieWczytano } from '@/components/nie-wczytano';
import { MarkdownKb } from '@verris/ui/markdown-kb';


const EMPTY: ArticleInput = { title: '', categoryId: '', excerpt: '', bodyMarkdown: '', status: 'DRAFT', seoTitle: '', seoDescription: '', faq: [], relatedSlugs: [] };

/** `blokada` — powód, gdy rola nie ma KB_MANAGE (API: zapis tylko z KB_MANAGE, odczyt każdy pracownik). */
export function KbManager({ blokada = null }: { blokada?: string | null } = {}) {
  const [cats, setCats] = useState<KbCategory[]>([]);
  const [selCat, setSelCat] = useState<string | null>(null);
  const [articles, setArticles] = useState<KbArticleListItem[]>([]);
  const [editing, setEditing] = useState<KbArticle | 'new' | null>(null);
  const [form, setForm] = useState<ArticleInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok?: string; err?: string }>({});
  // Fala 1B — błąd API to „Nie udało się wczytać” z ponowieniem, nie „Brak kategorii / artykułów”.
  const [bladKat, setBladKat] = useState(false);
  const [bladArt, setBladArt] = useState(false);

  // `.then` zamiast `await`: lint React Compilera nie śledzi `await` i brałby
  // setState po odpowiedzi za synchroniczny setState w efekcie.
  function reloadCats() {
    return fetchCategories().then((r) => {
      setBladKat(r === null);
      setCats(r ?? []);
    });
  }
  function reloadArticles(kat: string) {
    return fetchArticles(kat).then((r) => {
      setBladArt(r === null);
      setArticles(r ?? []);
    });
  }
  useEffect(() => { void reloadCats(); }, []);
  useEffect(() => {
    if (selCat) void reloadArticles(selCat);
  }, [selCat]);

  const tops = useMemo(() => cats.filter((c) => !c.parentId), [cats]);
  const childrenOf = (id: string) => cats.filter((c) => c.parentId === id);

  // ---- category actions
  async function addCategory(parentId: string | null) {
    const name = await zapytaj(parentId ? 'Nazwa podkategorii:' : 'Nazwa kategorii:', { tytul: parentId ? 'Nowa podkategoria' : 'Nowa kategoria', akcja: 'Utwórz' });
    if (!name?.trim()) return;
    const r = await createCategory({ name: name.trim(), parentId });
    if (!r.ok) setMsg({ err: r.error }); else void reloadCats();
  }
  async function renameCategory(c: KbCategory) {
    const name = await zapytaj(`Nowa nazwa dla „${c.name}”:`, { tytul: 'Zmień nazwę', akcja: 'Zmień', domyslna: c.name });
    if (!name?.trim() || name === c.name) return;
    const r = await updateCategory(c.id, { name: name.trim() });
    if (!r.ok) setMsg({ err: r.error }); else void reloadCats();
  }
  async function removeCategory(c: KbCategory) {
    if (!(await potwierdz(`Usunąć kategorię „${c.name}"? (musi być pusta)`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    const r = await deleteCategory(c.id);
    if (!r.ok) setMsg({ err: r.error });
    else {
      // Lista artykułów znika razem z zaznaczeniem usuniętej kategorii.
      if (selCat === c.id) { setSelCat(null); setArticles([]); }
      void reloadCats();
    }
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
      faq: a.faq ?? [], relatedSlugs: a.relatedSlugs ?? [],
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
    if (selCat) await reloadArticles(selCat);
  }
  async function removeArticle() {
    if (editing === 'new' || !editing) return;
    if (!(await potwierdz(`Usunąć artykuł „${editing.title}"?`, { akcja: 'Usuń', niebezpieczne: true }))) return;
    const r = await deleteArticle(editing.id);
    if (!r.ok) { setMsg({ err: r.error }); return; }
    setEditing(null);
    if (selCat) await reloadArticles(selCat);
  }

  const set = (k: keyof ArticleInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="space-y-6">
    {blokada ? <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-muted-foreground">Tylko podgląd. {blokada}.</p> : null}
    <CtaPanel blokada={blokada} />
    <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
      {/* Kategorie */}
      <aside className="space-y-2 rounded-2xl border border-white/10 bg-black/30 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-widest text-amber-400">Kategorie</h2>
          <button onClick={() => void addCategory(null)} disabled={!!blokada} title={blokada ?? undefined} className="disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10">
            <Plus className="h-3.5 w-3.5" /> Kategoria
          </button>
        </div>
        {bladKat ? (
          <NieWczytano co="kategorii" onPonow={() => void reloadCats()} />
        ) : tops.length === 0 ? (
          <p className="text-xs text-white/55">Brak kategorii — dodaj pierwszą.</p>
        ) : null}
        <ul className="space-y-1">
          {tops.map((c) => (
            <li key={c.id}>
              <CatRow c={c} sel={selCat === c.id} blokada={blokada} onSelect={() => setSelCat(c.id)} onAddSub={() => void addCategory(c.id)} onRename={() => void renameCategory(c)} onDelete={() => void removeCategory(c)} />
              {childrenOf(c.id).length > 0 ? (
                <ul className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-2">
                  {childrenOf(c.id).map((ch) => (
                    <li key={ch.id}>
                      <CatRow c={ch} sel={selCat === ch.id} blokada={blokada} onSelect={() => setSelCat(ch.id)} onRename={() => void renameCategory(ch)} onDelete={() => void removeCategory(ch)} />
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
              <button onClick={openNew} disabled={!selCat || !!blokada} title={blokada ?? undefined} className="disabled:cursor-not-allowed inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-40">
                <Plus className="h-4 w-4" /> Nowy artykuł
              </button>
            </div>
            {selCat ? (
              <ul className="divide-y divide-white/5 overflow-hidden rounded-2xl border border-white/10">
                {articles.map((a) => (
                  <li key={a.id}>
                    <button onClick={() => void openEdit(a.id)} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5">
                      <span className="flex items-center gap-2 text-white"><FileText className="h-4 w-4 text-white/55" />{a.title}</span>
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
                {bladArt ? (
                  <li className="p-3">
                    <NieWczytano co="artykułów" onPonow={() => void reloadArticles(selCat)} />
                  </li>
                ) : articles.length === 0 ? (
                  <li className="px-4 py-8 text-center text-white/55">Brak artykułów w tej kategorii.</li>
                ) : null}
              </ul>
            ) : (
              <p className="rounded-2xl border border-white/10 bg-black/20 px-4 py-10 text-center text-white/55">
                Wybierz kategorię z lewej, aby zobaczyć i edytować artykuły.
              </p>
            )}
          </>
        ) : (
          <Editor
            form={form} set={set} setForm={setForm} cats={cats} busy={busy}
            isNew={editing === 'new'}
            onSave={() => void save()} onDelete={() => void removeArticle()} onClose={() => setEditing(null)} blokada={blokada}
          />
        )}
      </section>
    </div>
    </div>
  );
}

function CtaPanel({ blokada }: { blokada: string | null }) {
  const [cta, setCta] = useState<KbCtaConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [blad, setBlad] = useState(false);
  const wczytaj = () =>
    fetchCta().then((r) => {
      setBlad(r === null);
      setCta(r);
    });
  useEffect(() => { void wczytaj(); }, []);
  // Fala 1B — błąd API: komunikat z ponowieniem zamiast cichego zniknięcia panelu banera.
  if (blad) return <NieWczytano co="ustawień banera" onPonow={() => void wczytaj()} />;
  if (!cta) return null;
  const upd = (k: keyof KbCtaConfig, v: unknown) => setCta((c) => (c ? { ...c, [k]: v } : c));
  const inputCls = 'w-full rounded-lg border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none';
  async function submit() {
    if (!cta) return;
    setSaving(true); setSaved(false);
    const r = await saveCta(cta);
    setSaving(false);
    if (r.ok) { setSaved(true); setTimeout(() => setSaved(false), 2500); }
  }
  return (
    <details className="rounded-2xl border border-white/10 bg-black/30 p-4">
      <summary className="cursor-pointer text-sm font-bold uppercase tracking-widest text-amber-400">
        Baner CTA (wspólny dla całej bazy wiedzy)
      </summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
          <Checkbox checked={cta.enabled} onChange={(e) => upd('enabled', e.target.checked)} /> Baner włączony
        </label>
        <label className="flex items-center gap-2 text-sm text-white sm:col-span-2">
          <Checkbox checked={cta.pattern !== false} onChange={(e) => upd('pattern', e.target.checked)} /> Wzorzec brandingowy w tle (siatka „V”)
        </label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs text-white/70">Nagłówek</span>
          <input className={inputCls} value={cta.headline} onChange={(e) => upd('headline', e.target.value)} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs text-white/70">Podtytuł</span>
          <input className={inputCls} value={cta.subtext} onChange={(e) => upd('subtext', e.target.value)} /></label>
        <label className="space-y-1 sm:col-span-2"><span className="text-xs text-white/70">Bullety (po jednym w linii) — cena, parametry, SLA</span>
          <textarea className={`${inputCls} min-h-[80px]`} value={cta.bullets.join('\n')} onChange={(e) => upd('bullets', e.target.value.split('\n').map((s) => s.trim()).filter(Boolean))} /></label>
        <label className="space-y-1"><span className="text-xs text-white/70">Tekst przycisku</span>
          <input className={inputCls} value={cta.buttonLabel} onChange={(e) => upd('buttonLabel', e.target.value)} /></label>
        <label className="space-y-1"><span className="text-xs text-white/70">URL przycisku</span>
          <input className={inputCls} value={cta.buttonUrl} onChange={(e) => upd('buttonUrl', e.target.value)} /></label>
        <label className="space-y-1"><span className="text-xs text-white/70">Link statusu (publiczny monitoring)</span>
          <input className={inputCls} value={cta.statusUrl} onChange={(e) => upd('statusUrl', e.target.value)} /></label>
        <label className="space-y-1"><span className="text-xs text-white/70">Etykieta linku statusu</span>
          <input className={inputCls} value={cta.statusLabel} onChange={(e) => upd('statusLabel', e.target.value)} /></label>
      </div>
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={() => void submit()} disabled={saving || !!blokada} title={blokada ?? undefined} className="disabled:cursor-not-allowed inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz baner
        </button>
        {saved ? <span className="text-sm text-emerald-300">Zapisano.</span> : null}
      </div>
    </details>
  );
}

/** Weryfikacja 11.10 — bez KB_MANAGE akcje kategorii są widoczne, ale wyszarzone z powodem (wcześniej znikały). */
export function CatRow({ c, sel, blokada = null, onSelect, onAddSub, onRename, onDelete }: {
  c: KbCategory; sel: boolean; blokada?: string | null; onSelect: () => void; onAddSub?: () => void; onRename: () => void; onDelete: () => void;
}) {
  const akcja = 'text-white/55 hover:text-white disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:text-white/55';
  return (
    <div className={`group flex items-center justify-between rounded-lg px-2 py-1.5 ${sel ? 'bg-emerald-500/15 text-emerald-100' : 'text-white/80 hover:bg-white/5'}`}>
      <button onClick={onSelect} className="flex-1 truncate text-left text-sm">{c.name}</button>
      <span className="ml-1 hidden items-center gap-1 group-focus-within:flex group-hover:flex">
        {onAddSub ? <button title={blokada ?? 'Podkategoria'} aria-label="Podkategoria" disabled={!!blokada} onClick={onAddSub} className={akcja}><FolderPlus className="h-3.5 w-3.5" /></button> : null}
        <button title={blokada ?? 'Zmień nazwę'} aria-label="Zmień nazwę" disabled={!!blokada} onClick={onRename} className={akcja}><Pencil className="h-3.5 w-3.5" /></button>
        <button title={blokada ?? 'Usuń'} aria-label="Usuń" disabled={!!blokada} onClick={onDelete} className={`${akcja} hover:text-rose-400`}><Trash2 className="h-3.5 w-3.5" /></button>
      </span>
    </div>
  );
}

export function Editor({ form, set, setForm, cats, busy, isNew, onSave, onDelete, onClose, blokada }: {
  form: ArticleInput;
  set: (k: keyof ArticleInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => void;
  setForm: React.Dispatch<React.SetStateAction<ArticleInput>>;
  cats: KbCategory[]; busy: boolean; isNew: boolean;
  onSave: () => void; onDelete: () => void; onClose: () => void; blokada: string | null;
}) {
  const kbFieldId = useId();
  const inputCls = 'w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2 text-sm text-white focus:border-emerald-500/40 focus:outline-none';
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-bold text-white">{isNew ? 'Nowy artykuł' : blokada ? 'Podgląd artykułu' : 'Edycja artykułu'}</h2>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 text-sm text-white hover:bg-white/10">Wróć</button>
          {!isNew ? <button onClick={onDelete} disabled={!!blokada} title={blokada ?? undefined} className="disabled:cursor-not-allowed disabled:opacity-50 inline-flex items-center gap-1.5 rounded-xl border border-rose-500/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-300 hover:bg-rose-500/20"><Trash2 className="h-4 w-4" /> Usuń</button> : null}
          <button onClick={onSave} disabled={busy || !!blokada} title={blokada ?? undefined} className="disabled:cursor-not-allowed inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Zapisz
          </button>
        </div>
      </div>
      {blokada ? <p className="text-xs text-muted-foreground">{blokada}.</p> : null}

      {/* Weryfikacja 11.10 — bez KB_MANAGE pola i przyciski formularza wyszarzone (natywnie przez fieldset disabled). */}
      <fieldset disabled={!!blokada} data-tylko-odczyt={blokada ? '' : undefined} className="m-0 min-w-0 space-y-4 border-0 p-0 disabled:opacity-70">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Tytuł</span>
          <input className={inputCls} value={form.title} onChange={set('title')} placeholder="Jak podpiąć domenę do hostingu" /></label>
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Slug (opcjonalnie — auto z tytułu)</span>
          <input className={inputCls} value={form.slug ?? ''} onChange={set('slug')} placeholder="jak-podpiac-domene" /></label>
        {/* Etykiety obok, nie owijające — klik w listę nie może ponownie aktywować przycisku. */}
        <div className="space-y-1"><label htmlFor={`${kbFieldId}-cat`} className="text-xs font-medium text-white/70">Kategoria</label>
          <Select id={`${kbFieldId}-cat`} className={inputCls} value={form.categoryId} onChange={(v) => setForm((f) => ({ ...f, categoryId: v }))}
            options={cats.map((c) => ({ value: c.id, label: `${c.parentId ? '— ' : ''}${c.name}` }))} /></div>
        <div className="space-y-1"><label htmlFor={`${kbFieldId}-status`} className="text-xs font-medium text-white/70">Status</label>
          <Select id={`${kbFieldId}-status`} className={inputCls} value={form.status} onChange={(v) => setForm((f) => ({ ...f, status: v as ArticleInput['status'] }))}
            options={[{ value: 'DRAFT', label: 'Szkic' }, { value: 'PUBLISHED', label: 'Opublikowany' }]} /></div>
      </div>

      <label className="block space-y-1"><span className="text-xs font-medium text-white/70">Wstęp / lead (excerpt)</span>
        <input className={inputCls} value={form.excerpt ?? ''} onChange={set('excerpt')} placeholder="Krótkie streszczenie widoczne na liście i w wynikach Google." /></label>

      <div className="grid gap-3 lg:grid-cols-2">
        <label className="space-y-1"><span className="text-xs font-medium text-white/70">Treść (Markdown)</span>
          <textarea className={`${inputCls} min-h-[420px] font-mono text-[13px] leading-relaxed`} value={form.bodyMarkdown} onChange={set('bodyMarkdown')}
            placeholder={'# Nagłówek\n\nAkapit tekstu z **pogrubieniem** i [linkiem](https://verris.pl).\n\n- punkt\n- punkt\n\n1. krok\n2. krok'} /></label>
        <div className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-white/70"><Eye className="h-3.5 w-3.5" /> Podgląd</span>
          {/* Ten sam renderer co panel klienta i obsługa (@verris/ui/markdown-kb) — bez wstawiania HTML z treści. */}
          <MarkdownKb tekst={form.bodyMarkdown || ''}
            className="min-h-[420px] overflow-auto rounded-xl border border-white/10 bg-white p-5 text-[15px] leading-relaxed text-neutral-800 [&_a]:text-emerald-600 [&_a]:underline [&_blockquote]:border-l-[3px] [&_blockquote]:border-emerald-400 [&_blockquote]:pl-3 [&_blockquote]:text-neutral-500 [&_code]:rounded [&_code]:bg-neutral-100 [&_code]:px-1 [&_code]:text-neutral-900 [&_h2]:mt-4 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-3 [&_h3]:text-lg [&_h3]:font-semibold [&_h4]:mt-3 [&_h4]:font-semibold [&_hr]:my-4 [&_img]:max-w-full [&_img]:rounded-lg [&_li]:my-1 [&_ol]:list-decimal [&_ol]:pl-[22px] [&_p]:my-2 [&_pre]:my-2 [&_pre]:overflow-auto [&_pre]:rounded-lg [&_pre]:bg-[#0b1712] [&_pre]:p-3 [&_pre]:text-white [&_pre_code]:bg-transparent [&_pre_code]:p-0 [&_pre_code]:text-white [&_ul]:list-disc [&_ul]:pl-[22px]" />
        </div>
      </div>

      <div className="space-y-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-white/80">FAQ (rich snippets w Google)</h3>
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, faq: [...(f.faq ?? []), { q: '', a: '' }] }))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs text-white hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" /> Pytanie
          </button>
        </div>
        {(form.faq ?? []).length === 0 ? (
          <p className="text-xs text-white/55">Brak pytań. Dodaj FAQ, aby zwiększyć szansę na rich snippet w Google.</p>
        ) : null}
        {(form.faq ?? []).map((item, idx) => (
          <div key={idx} className="space-y-2 rounded-xl border border-white/5 bg-black/30 p-3">
            <div className="flex items-center gap-2">
              <input
                className={inputCls}
                value={item.q}
                onChange={(e) => setForm((f) => { const faq = [...(f.faq ?? [])]; faq[idx] = { ...faq[idx], q: e.target.value }; return { ...f, faq }; })}
                placeholder="Pytanie (np. Jak podpiąć domenę?)"
              />
              <button type="button" onClick={() => setForm((f) => ({ ...f, faq: (f.faq ?? []).filter((_, i) => i !== idx) }))} className="text-white/55 hover:text-rose-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <textarea
              className={`${inputCls} min-h-[70px]`}
              value={item.a}
              onChange={(e) => setForm((f) => { const faq = [...(f.faq ?? [])]; faq[idx] = { ...faq[idx], a: e.target.value }; return { ...f, faq }; })}
              placeholder="Odpowiedź (zwięźle, 1–3 zdania)"
            />
          </div>
        ))}
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-white/70">Powiązane artykuły — slugi po przecinku (puste = auto po kategorii)</span>
        <input
          className={inputCls}
          value={(form.relatedSlugs ?? []).join(', ')}
          onChange={(e) => setForm((f) => ({ ...f, relatedSlugs: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) }))}
          placeholder="jak-podpiac-domene, certyfikat-ssl"
        />
      </label>

      <details className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <summary className="cursor-pointer text-sm font-semibold text-white/80">SEO (opcjonalnie — nadpisuje tytuł/opis)</summary>
        <div className="mt-3 space-y-3">
          <label className="block space-y-1"><span className="text-xs font-medium text-white/70">SEO title</span>
            <input className={inputCls} value={form.seoTitle ?? ''} onChange={set('seoTitle')} /></label>
          <label className="block space-y-1"><span className="text-xs font-medium text-white/70">SEO description</span>
            <input className={inputCls} value={form.seoDescription ?? ''} onChange={set('seoDescription')} /></label>
        </div>
      </details>
      </fieldset>
    </div>
  );
}

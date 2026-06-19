'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  ArrowUp,
  ChevronRight,
  Download,
  File as FileIcon,
  FilePen,
  Folder,
  FolderPlus,
  Loader2,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import {
  fmDelete,
  fmDownload,
  fmList,
  fmMkdir,
  fmRead,
  fmRename,
  fmUpload,
  fmWrite,
  type FmEntry,
} from './data';

const EDITABLE = /\.(txt|md|html?|css|js|mjs|cjs|ts|jsx|tsx|json|xml|ya?ml|ini|conf|env|htaccess|php|py|sh|sql|log)$/i;

function formatSize(bytes: number): string {
  if (!bytes) return '—';
  const units = ['B', 'KB', 'MB', 'GB'];
  let n = bytes;
  let i = 0;
  while (n >= 1024 && i < units.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n < 10 && i > 0 ? 1 : 0)} ${units[i]}`;
}

export function FileManagerClient({ serviceId, domain }: { serviceId: string; domain?: string }) {
  const [path, setPath] = useState('/');
  const [entries, setEntries] = useState<FmEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<{ name: string; content: string } | null>(null);
  const [editorSaving, setEditorSaving] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (p: string) => {
      setLoading(true);
      try {
        const res = await fmList(serviceId, p);
        setPath(res.path);
        setEntries(res.entries);
      } catch (e) {
        toast.error('Nie udało się wczytać katalogu', {
          description: e instanceof Error ? e.message : undefined,
        });
      } finally {
        setLoading(false);
      }
    },
    [serviceId],
  );

  useEffect(() => {
    void load('/');
  }, [load]);

  const segments = path.split('/').filter(Boolean);
  const goUp = () => {
    if (segments.length === 0) return;
    void load('/' + segments.slice(0, -1).join('/'));
  };
  const enterDir = (name: string) => void load(`${path === '/' ? '' : path}/${name}`);
  const breadcrumbTo = (i: number) => void load('/' + segments.slice(0, i + 1).join('/'));

  const onNewFolder = async () => {
    const name = window.prompt('Nazwa nowego folderu:');
    if (!name) return;
    setBusy(true);
    try {
      await fmMkdir(serviceId, path, name);
      toast.success('Folder utworzony');
      await load(path);
    } catch (e) {
      toast.error('Nie udało się utworzyć folderu', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onRename = async (name: string) => {
    const next = window.prompt('Nowa nazwa:', name);
    if (!next || next === name) return;
    setBusy(true);
    try {
      await fmRename(serviceId, path, name, next);
      toast.success('Zmieniono nazwę');
      await load(path);
    } catch (e) {
      toast.error('Nie udało się zmienić nazwy', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (entry: FmEntry) => {
    if (!window.confirm(`Usunąć „${entry.name}"? Tej operacji nie można cofnąć.`)) return;
    setBusy(true);
    try {
      await fmDelete(serviceId, path, [entry.name]);
      toast.success('Usunięto');
      await load(path);
    } catch (e) {
      toast.error('Nie udało się usunąć', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onDownload = async (name: string) => {
    setBusy(true);
    try {
      const filePath = `${path === '/' ? '' : path}/${name}`;
      const res = await fmDownload(serviceId, filePath);
      if ('error' in res) {
        toast.error(res.error);
        return;
      }
      const bin = atob(res.base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const url = URL.createObjectURL(new Blob([bytes]));
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error('Nie udało się pobrać pliku', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onEdit = async (name: string) => {
    setBusy(true);
    try {
      const filePath = `${path === '/' ? '' : path}/${name}`;
      const res = await fmRead(serviceId, filePath);
      setEditing({ name, content: res.content });
    } catch (e) {
      toast.error('Nie udało się otworzyć pliku', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  const onSaveEdit = async () => {
    if (!editing) return;
    setEditorSaving(true);
    try {
      await fmWrite(serviceId, path, editing.name, editing.content);
      toast.success('Zapisano plik');
      setEditing(null);
      await load(path);
    } catch (e) {
      toast.error('Nie udało się zapisać', {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setEditorSaving(false);
    }
  };

  const onUploadChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setBusy(true);
      try {
        const form = new FormData();
        form.append('id', serviceId);
        form.append('dir', path);
        form.append('file', file);
        const res = await fmUpload(form);
        if ('error' in res) toast.error('Nie udało się wgrać pliku', { description: res.error });
        else {
          toast.success('Wgrano plik');
          await load(path);
        }
      } finally {
        setBusy(false);
        if (fileInput.current) fileInput.current.value = '';
      }
    }
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={goUp}
          disabled={segments.length === 0 || busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
        >
          <ArrowUp className="h-4 w-4" /> W górę
        </button>
        <button
          type="button"
          onClick={onNewFolder}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
        >
          <FolderPlus className="h-4 w-4" /> Nowy folder
        </button>
        <button
          type="button"
          onClick={() => fileInput.current?.click()}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
        >
          <Upload className="h-4 w-4" /> Wgraj plik
        </button>
        <input ref={fileInput} type="file" hidden onChange={onUploadChange} />
        <button
          type="button"
          onClick={() => void load(path)}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-white hover:bg-white/10 disabled:opacity-40"
        >
          <RefreshCw className="h-4 w-4" /> Odśwież
        </button>
        {domain ? <span className="ml-auto text-xs text-neutral-500">{domain}</span> : null}
      </div>

      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-1 text-sm text-neutral-400">
        <button onClick={() => void load('/')} className="hover:text-white">
          /
        </button>
        {segments.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <ChevronRight className="h-3 w-3 text-neutral-600" />
            <button onClick={() => breadcrumbTo(i)} className="hover:text-white">
              {s}
            </button>
          </span>
        ))}
      </div>

      {/* Listing */}
      <div className="overflow-hidden rounded-xl border border-white/10">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Wczytywanie…
          </div>
        ) : entries.length === 0 ? (
          <p className="py-12 text-center text-sm text-neutral-500">Pusty katalog.</p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10 text-left text-xs text-neutral-500">
                <th className="px-4 py-2 font-medium">Nazwa</th>
                <th className="px-4 py-2 font-medium">Rozmiar</th>
                <th className="px-4 py-2 font-medium">Zmodyfikowano</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.name} className="border-b border-white/5 hover:bg-white/[0.02]">
                  <td className="px-4 py-2">
                    <button
                      type="button"
                      onClick={() =>
                        entry.type === 'dir'
                          ? enterDir(entry.name)
                          : EDITABLE.test(entry.name)
                            ? void onEdit(entry.name)
                            : void onDownload(entry.name)
                      }
                      className="inline-flex items-center gap-2 text-left text-white hover:text-violet-300"
                    >
                      {entry.type === 'dir' ? (
                        <Folder className="h-4 w-4 shrink-0 text-violet-300" />
                      ) : (
                        <FileIcon className="h-4 w-4 shrink-0 text-neutral-400" />
                      )}
                      {entry.name}
                    </button>
                  </td>
                  <td className="px-4 py-2 text-neutral-400">
                    {entry.type === 'dir' ? '—' : formatSize(entry.sizeBytes)}
                  </td>
                  <td className="px-4 py-2 text-neutral-500">{entry.modified ?? '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center justify-end gap-1">
                      {entry.type === 'file' && EDITABLE.test(entry.name) ? (
                        <IconBtn title="Edytuj" onClick={() => void onEdit(entry.name)}>
                          <FilePen className="h-4 w-4" />
                        </IconBtn>
                      ) : null}
                      {entry.type === 'file' ? (
                        <IconBtn title="Pobierz" onClick={() => void onDownload(entry.name)}>
                          <Download className="h-4 w-4" />
                        </IconBtn>
                      ) : null}
                      <IconBtn title="Zmień nazwę" onClick={() => void onRename(entry.name)}>
                        <FilePen className="h-4 w-4 opacity-0" />
                        <span className="text-xs">Aa</span>
                      </IconBtn>
                      <IconBtn title="Usuń" danger onClick={() => void onDelete(entry)}>
                        <Trash2 className="h-4 w-4" />
                      </IconBtn>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Editor overlay */}
      {editing ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="flex h-[80vh] w-full max-w-3xl flex-col rounded-2xl border border-white/10 bg-neutral-950">
            <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
              <p className="font-semibold text-white">{editing.name}</p>
              <button onClick={() => setEditing(null)} className="text-neutral-400 hover:text-white">
                <X className="h-5 w-5" />
              </button>
            </div>
            <textarea
              value={editing.content}
              onChange={(e) => setEditing({ ...editing, content: e.target.value })}
              spellCheck={false}
              className="flex-1 resize-none bg-transparent p-4 font-mono text-sm text-neutral-200 outline-none"
            />
            <div className="flex justify-end gap-2 border-t border-white/10 px-4 py-3">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg px-4 py-2 text-sm text-neutral-300 hover:text-white"
              >
                Anuluj
              </button>
              <button
                onClick={() => void onSaveEdit()}
                disabled={editorSaving}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-4 py-2 text-sm font-bold text-black hover:bg-neutral-200 disabled:opacity-50"
              >
                {editorSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Zapisz
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function IconBtn({
  children,
  title,
  onClick,
  danger,
}: {
  children: React.ReactNode;
  title: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`inline-flex h-7 w-7 items-center justify-center rounded-md border border-white/10 bg-white/5 hover:bg-white/10 ${
        danger ? 'text-rose-300 hover:text-rose-200' : 'text-neutral-300'
      }`}
    >
      {children}
    </button>
  );
}

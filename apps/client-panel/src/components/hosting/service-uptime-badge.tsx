'use client';

import { useState } from 'react';
import { Copy, Check } from 'lucide-react';

const EMBED_SNIPPET = (src: string) =>
  `<a href="https://verris.pl" title="Hosting Verris"><img src="${src}" alt="Status uptime" height="20" /></a>`;

export function ServiceUptimeBadge({ serviceId }: { serviceId: string }) {
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const badgeUrl = `${apiUrl}/public/services/${serviceId}/uptime-badge.svg`;
  const [copied, setCopied] = useState<'url' | 'html' | null>(null);

  const copy = async (kind: 'url' | 'html') => {
    const text = kind === 'url' ? badgeUrl : EMBED_SNIPPET(badgeUrl);
    await navigator.clipboard.writeText(text);
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="text-[10px] font-bold uppercase tracking-widest text-neutral-500">
        Publiczny badge uptime
      </p>
      <p className="mt-1 text-xs text-neutral-400">
        Osadź na swojej stronie — odświeża się automatycznie (SVG z API).
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-4">
        <img src={badgeUrl} alt="Uptime badge" className="h-6" />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void copy('url')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
          >
            {copied === 'url' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            URL badge
          </button>
          <button
            type="button"
            onClick={() => void copy('html')}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-neutral-300 hover:bg-white/10"
          >
            {copied === 'html' ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            Kod HTML
          </button>
        </div>
      </div>
      <code className="mt-3 block break-all rounded-lg bg-black/40 px-3 py-2 text-[11px] text-neutral-400">
        {badgeUrl}
      </code>
    </div>
  );
}

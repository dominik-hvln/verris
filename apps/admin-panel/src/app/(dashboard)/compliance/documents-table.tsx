import { AlertCircle, CheckCircle2, FileText } from "lucide-react";
import type { CurrentDocsMap } from "./data";

const KIND_LABELS: Record<string, string> = {
  TERMS: "Regulamin",
  PRIVACY: "Polityka prywatności",
  COOKIES: "Polityka cookies",
  DPA: "DPA",
};

export function DocumentsTable({
  docs,
  error,
}: {
  docs: CurrentDocsMap;
  error: string | null;
}) {
  if (error) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
        <AlertCircle className="h-4 w-4" />
        Nie udało się pobrać listy dokumentów: {error}
      </div>
    );
  }

  const entries = (Object.keys(KIND_LABELS) as Array<keyof CurrentDocsMap>).map(
    (k) => ({ kind: k, doc: docs[k] }),
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-black/30 overflow-hidden">
      <table className="w-full text-left text-sm">
        <thead className="bg-white/[0.04] border-b border-white/10 text-xs uppercase text-muted-foreground">
          <tr>
            <th className="px-6 py-3 font-medium">Dokument</th>
            <th className="px-6 py-3 font-medium">Aktualna wersja</th>
            <th className="px-6 py-3 font-medium">Opublikowana</th>
            <th className="px-6 py-3 font-medium">Status</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-white">
          {entries.map(({ kind, doc }) => (
            <tr key={kind} className="hover:bg-white/[0.02]">
              <td className="px-6 py-4">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-indigo-400" />
                  <span className="font-medium">{KIND_LABELS[kind]}</span>
                </div>
              </td>
              <td className="px-6 py-4 font-mono text-xs">
                {doc?.version ?? <span className="text-rose-400">brak</span>}
              </td>
              <td className="px-6 py-4 text-muted-foreground text-xs">
                {doc?.publishedAt
                  ? new Date(doc.publishedAt).toLocaleString("pl-PL")
                  : "—"}
              </td>
              <td className="px-6 py-4">
                {doc ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" />
                    Opublikowany
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                    <AlertCircle className="h-3 w-3" />
                    NIE opublikowany — blokuje rejestrację
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

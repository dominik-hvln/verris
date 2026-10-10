import Link from "next/link";
import { staffApi } from "@/lib/staff-api";
import { BladStrony } from "@/components/blad-strony";
import { MarkdownKb } from "@verris/ui/markdown-kb";

export const dynamic = "force-dynamic";

/**
 * Treść artykułu: Markdown tym samym rendererem co baza wiedzy klienta (@verris/ui/markdown-kb, reguły pomoc.verris.pl),
 * bez dangerouslySetInnerHTML. Wcześniej obsługa widziała surowe „##” i ``` zamiast nagłówków i bloków kodu.
 */
const TRESC = [
  "mt-2 text-[13.5px] leading-[1.55] text-[color:var(--verris-body)]",
  "[&_h2]:mt-4 [&_h2]:mb-1.5 [&_h2]:font-display [&_h2]:text-[15px] [&_h2]:font-bold [&_h2]:text-foreground",
  "[&_h3]:mt-3 [&_h3]:mb-1 [&_h3]:font-semibold [&_h3]:text-foreground [&_h4]:mt-3 [&_h4]:font-semibold",
  "[&_p]:my-2 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-0.5",
  "[&_a]:underline [&_img]:max-w-full [&_img]:rounded-lg [&_hr]:my-3 [&_hr]:border-line",
  "[&_blockquote]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-line-strong [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground",
  "[&_code]:rounded [&_code]:bg-[rgba(127,127,127,0.14)] [&_code]:px-1 [&_code]:font-mono [&_code]:text-[12.5px]",
  "[&_pre]:my-2 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:border [&_pre]:border-line [&_pre]:bg-[rgba(127,127,127,0.1)] [&_pre]:p-3",
  "[&_pre_code]:bg-transparent [&_pre_code]:p-0",
].join(" ");

interface KbKategoria {
  id: string;
  name: string;
  order: number;
}

interface KbArtykul {
  id: string;
  title: string;
  excerpt: string | null;
  bodyMarkdown: string;
  categoryId: string;
  updatedAt: string;
}

/**
 * Pozycja 18 — baza wiedzy dla obsługi: opublikowane artykuły KB (te same, które widzi klient), tylko odczyt.
 * Wcześniej strona pokazywała szablony odpowiedzi i renderowała nieistniejące pole `body` (pusta treść).
 * Szablony mają własną stronę „Baza odpowiedzi” (/knowledge/odpowiedzi). Treść zmienia osoba z KB_MANAGE
 * w panelu admina.
 */
export default async function BazaWiedzyPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const szukaj = q?.trim() ?? "";
  let kategorie: KbKategoria[];
  let artykuly: KbArtykul[];
  try {
    [kategorie, artykuly] = await Promise.all([
      staffApi<KbKategoria[]>("/admin/kb/categories"),
      staffApi<KbArtykul[]>(`/admin/kb/articles?status=PUBLISHED${szukaj ? `&q=${encodeURIComponent(szukaj)}` : ""}`),
    ]);
  } catch (e) {
    return <BladStrony blad={e} tytul="Baza wiedzy" powrot={{ href: "/", label: "Powrót do skrzynki" }} />;
  }

  const znane = new Set(kategorie.map((k) => k.id));
  const grupy = [
    ...[...kategorie].sort((a, b) => a.order - b.order).map((k) => ({ nazwa: k.name, lista: artykuly.filter((a) => a.categoryId === k.id) })),
    { nazwa: "Bez kategorii", lista: artykuly.filter((a) => !znane.has(a.categoryId)) },
  ].filter((g) => g.lista.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Wiedza</span>
        <h1 className="font-display text-[30px] font-extrabold tracking-[-0.02em]">Baza wiedzy</h1>
        <p className="text-sm text-muted-foreground">
          Opublikowane artykuły pomocy — te same, które widzi klient. Gotowe odpowiedzi do zgłoszeń są w{" "}
          <Link href="/knowledge/odpowiedzi" className="underline">bazie odpowiedzi</Link>.
        </p>
      </header>
      <form className="flex gap-2" role="search">
        <input
          name="q"
          defaultValue={szukaj}
          placeholder="Szukaj w tytułach…"
          aria-label="Szukaj artykułu"
          className="w-full max-w-sm rounded-lg border border-line-strong bg-card px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-lg border border-line-strong px-3 py-2 text-sm font-semibold">Szukaj</button>
      </form>
      {grupy.length === 0 ? (
        <p className="rounded-[10px] border border-line bg-card p-8 text-center text-sm text-muted-foreground">
          {szukaj ? "Brak artykułów o takim tytule." : "Brak opublikowanych artykułów."}
        </p>
      ) : (
        grupy.map((g) => (
          <section key={g.nazwa} className="overflow-hidden rounded-[10px] border border-line bg-card" aria-label={g.nazwa}>
            <h2 className="px-4 py-3 font-display text-[15px] font-bold">
              {g.nazwa} <span className="font-mono text-xs font-normal text-muted-foreground">{g.lista.length}</span>
            </h2>
            {g.lista.map((a) => (
              <details key={a.id} className="border-t border-line px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold">{a.title}</summary>
                {a.excerpt ? <p className="mt-2 text-[13px] text-muted-foreground">{a.excerpt}</p> : null}
                <MarkdownKb tekst={a.bodyMarkdown} className={TRESC} />
              </details>
            ))}
          </section>
        ))
      )}
    </div>
  );
}

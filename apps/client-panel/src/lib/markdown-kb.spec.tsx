import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { MarkdownKb } from '@verris/ui/markdown-kb';

/**
 * Baza wiedzy w panelu klienta i obsługi — wspólny renderer @verris/ui/markdown-kb (reguły pomoc.verris.pl,
 * apps/api/src/kb/kb-render.ts). Wcześniej panel klienta wstawiał HTML przez dangerouslySetInnerHTML, a adres
 * linku szedł do atrybutu bez sprawdzenia (cudzysłów w adresie = własny atrybut, `javascript:` = skrypt po kliknięciu).
 */
const html = (md: string) => renderToStaticMarkup(<MarkdownKb tekst={md} />);

describe('MarkdownKb — renderer artykułów bazy wiedzy', () => {
  it('bloki: # → h2, ## → h3, blok kodu, cytat, linia, listy, akapit sklejony z linii', () => {
    expect(html('# Tytuł\n## Pod\n#### Mały')).toBe('<div><h2>Tytuł</h2><h3>Pod</h3><h4>Mały</h4></div>');
    expect(html('```bash\nls -la\n  cd /home\n```')).toBe('<div><pre><code>ls -la\n  cd /home</code></pre></div>');
    expect(html('> uwaga\n> druga')).toBe('<div><blockquote>uwaga druga</blockquote></div>');
    expect(html('---')).toBe('<div><hr/></div>');
    expect(html('1. raz\n2. dwa\n\n- a\n* b')).toBe('<div><ol><li>raz</li><li>dwa</li></ol><ul><li>a</li><li>b</li></ul></div>');
    expect(html('linia pierwsza\nlinia druga\n## Nagłówek')).toBe('<div><p>linia pierwsza linia druga</p><h3>Nagłówek</h3></div>');
  });

  it('w tekście: pogrubienie, kursywa, kod, link https/mailto/ścieżka, obraz tylko http(s)', () => {
    expect(html('**mocno** i *lekko* oraz `kod`')).toBe('<div><p><strong>mocno</strong> i <em>lekko</em> oraz <code>kod</code></p></div>');
    expect(html('[pomoc](https://pomoc.verris.pl) [mail](mailto:pomoc@verris.pl) [panel](/dashboard)')).toBe(
      '<div><p><a href="https://pomoc.verris.pl" target="_blank" rel="noopener noreferrer">pomoc</a> <a href="mailto:pomoc@verris.pl">mail</a> <a href="/dashboard">panel</a></p></div>',
    );
    expect(html('![zrzut](https://cdn.verris.pl/a.png) ![zly](data:image/png;base64,AAA)')).toBe(
      '<div><p><img src="https://cdn.verris.pl/a.png" alt="zrzut" loading="lazy"/> </p></div>',
    );
  });

  it('bezpieczeństwo: javascript: i cudzysłów w adresie nie dają linku ani atrybutu, HTML z treści to tekst', () => {
    expect(html('[klik](javascript:zlo(1))')).toBe('<div><p>klik)</p></div>');
    // Cudzysłów zostaje częścią adresu (escapowany przez React) — nie zamyka atrybutu href.
    expect(html('[x](https://a.pl" onmouseover="zlo(1))')).toBe(
      '<div><p><a href="https://a.pl&quot; onmouseover=&quot;zlo(1" target="_blank" rel="noopener noreferrer">x</a>)</p></div>',
    );
    expect(html('<img src=x onerror=zlo(1)>')).toBe('<div><p>&lt;img src=x onerror=zlo(1)&gt;</p></div>');
    expect(html('```\n<script>zlo(1)</script>\n```')).toBe('<div><pre><code>&lt;script&gt;zlo(1)&lt;/script&gt;</code></pre></div>');
  });

  it('czytnik bazy wiedzy w panelu klienta używa wspólnego renderera, bez dangerouslySetInnerHTML', () => {
    const zrodlo = readFileSync(join(__dirname, '../app/dashboard/knowledge/knowledge-client.tsx'), 'utf8');
    expect(zrodlo).toContain("from '@verris/ui/markdown-kb'");
    expect(zrodlo).not.toContain('dangerouslySetInnerHTML');
  });
});

import { RichText } from '@payloadcms/richtext-lexical/react';
import { kotwice, poziomWTresci, tekstWezla } from '@/lib/blog';

/**
 * Treść wpisu z Payload (Lexical) na serwerze. Nagłówki dostają kotwice spisu treści (te same co `spisTresci`),
 * h1 z edytora staje się h2 (jedno H1 na stronie), a h4–h6 — h3 (bez przeskoków poziomów).
 */
export function TrescWpisu({ data }: { data: unknown }) {
  const nowa = kotwice();
  return (
    <RichText
      data={data as never}
      disableContainer
      converters={({ defaultConverters }) => ({
        ...defaultConverters,
        heading: ({ node, nodesToJSX }) => {
          const Tag = poziomWTresci(node.tag);
          const id = nowa(tekstWezla(node as never).trim());
          return <Tag id={id}>{nodesToJSX({ nodes: node.children })}</Tag>;
        },
      })}
    />
  );
}

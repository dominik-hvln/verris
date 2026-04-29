/**
 * Tiny RFC 4180-ish CSV serializer.
 *
 * We don't pull in a CSV library because the rows we emit are well-defined
 * and small. The serializer:
 *   - Quotes any field containing a delimiter, quote, CR, or LF.
 *   - Escapes embedded quotes by doubling them.
 *   - Uses `\r\n` line terminators (max compatibility, including Excel).
 *   - Always renders the header row first.
 *
 * The result is `\uFEFF`-prefixed (UTF-8 BOM) so that Excel opens it with
 * UTF-8 encoding by default — without this, Polish characters render as
 * mojibake on Windows.
 */
export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number | null | undefined;
}

const NEEDS_QUOTING = /[",\r\n]/;

export function rowsToCsv<T>(rows: readonly T[], columns: ReadonlyArray<CsvColumn<T>>): string {
  const lines: string[] = [];
  lines.push(columns.map((c) => quoteField(c.header)).join(','));
  for (const row of rows) {
    lines.push(
      columns
        .map((c) => {
          const v = c.value(row);
          if (v === null || v === undefined) return '';
          return quoteField(String(v));
        })
        .join(','),
    );
  }
  return '\uFEFF' + lines.join('\r\n') + '\r\n';
}

function quoteField(value: string): string {
  if (!NEEDS_QUOTING.test(value)) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

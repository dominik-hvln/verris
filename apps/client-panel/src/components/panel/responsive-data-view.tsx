import type { ReactNode } from 'react';
import { cx } from './cx';

export type ResponsiveColumn<T> = {
  key: string;
  header: string;
  headerClassName?: string;
  cellClassName?: string;
  cell: (row: T) => ReactNode;
};

export function ResponsiveDataView<T>({
  rows,
  rowKey,
  columns,
  renderMobileCard,
  empty,
  tableClassName,
  mobileClassName,
}: {
  rows: T[];
  rowKey: (row: T) => string;
  columns: ResponsiveColumn<T>[];
  renderMobileCard: (row: T) => ReactNode;
  empty?: ReactNode;
  tableClassName?: string;
  mobileClassName?: string;
}) {
  if (rows.length === 0) {
    return empty ?? null;
  }

  return (
    <>
      <div className={cx('space-y-3 md:hidden', mobileClassName)}>
        {rows.map((row) => (
          <div key={rowKey(row)}>{renderMobileCard(row)}</div>
        ))}
      </div>
      <div className={cx('hidden overflow-x-auto rounded-[10px] border border-line bg-card md:block', tableClassName)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left">
              {columns.map((col) => (
                <th key={col.key} className={cx('whitespace-nowrap px-3 pb-2.5 pt-3 font-mono text-[11px] font-medium uppercase tracking-[0.07em] text-muted-foreground', col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="hover:bg-raised/40">
                {columns.map((col) => (
                  <td key={col.key} className={cx('border-t border-line px-3 py-[11px] align-middle text-verris-body', col.cellClassName)}>
                    {col.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

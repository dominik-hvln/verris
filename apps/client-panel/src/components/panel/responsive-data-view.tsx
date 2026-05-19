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
      <div className={cx('hidden md:block overflow-x-auto', tableClassName)}>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-muted-foreground border-b border-white/10">
              {columns.map((col) => (
                <th key={col.key} className={cx('py-2 pr-4 font-semibold', col.headerClassName)}>
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={rowKey(row)} className="border-b border-white/5">
                {columns.map((col) => (
                  <td key={col.key} className={cx('py-2 pr-4', col.cellClassName)}>
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

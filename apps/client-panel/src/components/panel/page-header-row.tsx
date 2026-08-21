import type { ReactNode } from 'react';
import { PanelPageHeader } from './panel-shell';
import { PageActions } from './page-actions';
import { cx } from './cx';

export function PageHeaderRow({
  title,
  description,
  icon,
  actions,
  className,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        'flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between',
        className,
      )}
    >
      <PanelPageHeader title={title} description={description} icon={icon} className="min-w-0 flex-1" />
      {actions ? <PageActions>{actions}</PageActions> : null}
    </div>
  );
}

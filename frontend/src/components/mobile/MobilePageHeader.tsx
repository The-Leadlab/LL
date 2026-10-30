import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MobilePageHeaderProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  className?: string;
};

/** Compact page header for phone layouts (`md:hidden` sibling of desktop headers). */
export function MobilePageHeader({
  title,
  subtitle,
  actions,
  className,
}: MobilePageHeaderProps) {
  return (
    <div
      className={cn(
        'mb-4 flex items-start justify-between gap-3 md:hidden',
        className
      )}
    >
      <div className="min-w-0">
        <h1 className="truncate text-xl font-bold text-neutral-900 dark:text-neutral-50">
          {title}
        </h1>
        {subtitle ? (
          <p className="mt-0.5 text-sm text-neutral-600 dark:text-neutral-400">
            {subtitle}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}

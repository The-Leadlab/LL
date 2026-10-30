import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type MobileCardListProps = {
  children: ReactNode;
  className?: string;
};

export function MobileCardList({ children, className }: MobileCardListProps) {
  return (
    <ul className={cn('flex flex-col gap-3 md:hidden', className)}>{children}</ul>
  );
}

type MobileCardProps = {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
};

export function MobileCard({ children, onClick, className }: MobileCardProps) {
  const Comp = onClick ? 'button' : 'div';
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'w-full rounded-xl border border-neutral-200 bg-white p-4 text-left shadow-sm dark:border-neutral-700 dark:bg-neutral-800',
        onClick && 'active:scale-[0.99] transition-transform',
        className
      )}
    >
      {children}
    </Comp>
  );
}

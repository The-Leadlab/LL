import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  noPadding?: boolean;
}

export function PageContainer({ children, className, noPadding = false }: PageContainerProps) {
  return (
    <div
      className={cn(
        'w-full min-h-full bg-background text-foreground font-sans',
        !noPadding && 'p-4 md:p-6',
        className
      )}
    >
      <div className="w-full min-h-full">{children}</div>
    </div>
  );
}

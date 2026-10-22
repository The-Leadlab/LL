import { ReactNode } from 'react';
import { cn } from '../../lib/utils';

interface PageContainerProps {
  children: ReactNode;
  className?: string;
  /** Centers the content vertically */
  centerContent?: boolean;
  /** Removes the default max-width constraint */
  fullWidth?: boolean;
  /** Removes the default padding */
  noPadding?: boolean;
}

export function PageContainer({ 
  children, 
  className = '',
  centerContent = false,
  fullWidth = false,
  noPadding = false
}: PageContainerProps) {
  return (
    <div 
      className={cn(
        'min-h-[calc(100vh-4rem)]',
        'bg-background text-foreground dark:bg-background',
        centerContent && 'flex items-center justify-center',
        className
      )}
    >
      <div 
        className={cn(
          'w-full mx-auto transition-all duration-300 ease-in-out',
          !noPadding && 'px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8',
          !fullWidth && 'max-w-[1400px]'
        )}
      >
        {children}
      </div>
    </div>
  );
}

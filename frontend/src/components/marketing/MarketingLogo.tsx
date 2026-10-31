import { cn } from '@/lib/utils'

type MarketingLogoProps = {
  className?: string
  alt?: string
}

/**
 * LeadLab wordmark: light asset by default; dedicated inverted asset in dark mode.
 */
export function MarketingLogo({ className, alt = 'LeadLab' }: MarketingLogoProps) {
  return (
    <span className={cn('relative inline-flex items-center', className)}>
      <img
        src="/images/leadlab-logo.png"
        alt={alt}
        className="h-9 w-auto sm:h-10 dark:hidden"
      />
      <img
        src="/images/leadlab-logo-dark.png"
        alt=""
        aria-hidden
        className="hidden h-9 w-auto sm:h-10 dark:block"
      />
    </span>
  )
}

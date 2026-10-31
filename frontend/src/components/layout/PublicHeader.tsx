import { Link } from 'react-router-dom'
import { MarketingLogo } from '../marketing/MarketingLogo'
import { ThemeToggle } from '../marketing/ThemeToggle'

/** Compact public header — follows app theme. */
export function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
      <div className="mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex-shrink-0" aria-label="LeadLab">
            <MarketingLogo className="[&_img]:h-12" />
          </Link>
          <ThemeToggle />
        </div>
      </div>
    </header>
  )
}

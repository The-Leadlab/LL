import type { ReactNode } from 'react'
import { MarketingNav } from '../marketing/MarketingNav'

type PublicAuthShellProps = {
  children: ReactNode
  maxWidthClassName?: string
  cardClassName?: string
  withCard?: boolean
}

/** Public auth chrome — always light/white, even if CRM dark mode is on. */
export function PublicAuthShell({
  children,
  maxWidthClassName = 'max-w-md',
  cardClassName = '',
  withCard = true,
}: PublicAuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50 font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <MarketingNav />
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className={`w-full ${maxWidthClassName}`}>
          {withCard ? (
            <div
              className={`rounded-xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-900 sm:p-8 ${cardClassName}`}
            >
              {children}
            </div>
          ) : (
            children
          )}
        </div>
      </main>
    </div>
  )
}

export const publicAuthCtaClassName =
  'w-full inline-flex justify-center items-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600 disabled:opacity-50 disabled:cursor-not-allowed transition-[background-color,opacity] duration-150'

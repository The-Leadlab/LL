import type { ReactNode } from 'react'
import { MarketingNav } from '../marketing/MarketingNav'

type PublicAuthShellProps = {
  children: ReactNode
  maxWidthClassName?: string
  cardClassName?: string
  withCard?: boolean
}

/**
 * Atlas auth chrome — cool ink atmosphere, solid primary CTA (no indigo gradients).
 */
export function PublicAuthShell({
  children,
  maxWidthClassName = 'max-w-md',
  cardClassName = '',
  withCard = true,
}: PublicAuthShellProps) {
  return (
    <div className="relative flex min-h-screen flex-col bg-background font-sans">
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(37,99,235,0.08),_transparent_55%)]"
        aria-hidden
      />
      <MarketingNav />
      <main className="relative flex flex-1 items-center justify-center px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className={`w-full ${maxWidthClassName}`}>
          {withCard ? (
            <div
              className={`rounded-xl border border-border bg-card p-8 shadow-md ${cardClassName}`}
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

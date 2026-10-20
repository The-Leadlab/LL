import type { ReactNode } from 'react'
import { MarketingNav } from '../marketing/MarketingNav'

type PublicAuthShellProps = {
  children: ReactNode
  /** Wider container for multi-column forms (e.g. signup, invite). */
  maxWidthClassName?: string
  /** Extra classes on the white card wrapper. */
  cardClassName?: string
  /** When false, only nav + gradient — children provide their own cards. */
  withCard?: boolean
}

/**
 * Shared chrome for unauthenticated public pages:
 * MarketingNav + slate/blue/indigo wash + optional centered white card.
 */
export function PublicAuthShell({
  children,
  maxWidthClassName = 'max-w-md',
  cardClassName = '',
  withCard = true,
}: PublicAuthShellProps) {
  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <MarketingNav />
      <main className="flex flex-1 items-center justify-center px-4 pb-16 pt-24 sm:px-6 lg:px-8">
        <div className={`w-full ${maxWidthClassName}`}>
          {withCard ? (
            <div
              className={`rounded-2xl border border-blue-100 bg-white p-8 shadow-xl ${cardClassName}`}
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

/** Primary CTA for public auth/marketing forms. */
export const publicAuthCtaClassName =
  'w-full inline-flex justify-center items-center rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:from-blue-700 hover:to-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all'

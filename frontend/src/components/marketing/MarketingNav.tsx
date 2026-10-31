import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, Menu, X } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { cn } from '@/lib/utils'

const navLink =
  'text-sm font-medium text-muted-foreground hover:text-foreground transition-colors duration-150 whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm'

export function MarketingNav() {
  const { t } = useTranslation('nav')
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path ? 'text-primary-600 font-semibold' : ''

  const links = (
    <>
      <Link to="/" className={cn(navLink, isActive('/'))} onClick={() => setOpen(false)}>
        {t('home')}
      </Link>
      <a href="/#about" className={navLink} onClick={() => setOpen(false)}>
        {t('about')}
      </a>
      <a href="/#services" className={navLink} onClick={() => setOpen(false)}>
        {t('services')}
      </a>
      <a href="/#pricing" className={navLink} onClick={() => setOpen(false)}>
        {t('pricing')}
      </a>
      <Link to="/intake/business-diagnostic" className={navLink} onClick={() => setOpen(false)}>
        {t('businessDiagnostic')}
      </Link>
      <Link to="/intake/data-request" className={navLink} onClick={() => setOpen(false)}>
        {t('dataRequest')}
      </Link>
      <Link to="/intake/pitch-your-idea" className={navLink} onClick={() => setOpen(false)}>
        {t('pitchYourIdea')}
      </Link>
      <Link to="/contact" className={cn(navLink, isActive('/contact'))} onClick={() => setOpen(false)}>
        {t('contact')}
      </Link>
      <Link to="/report" className={cn(navLink, isActive('/report'))} onClick={() => setOpen(false)}>
        {t('reportIssue')}
      </Link>
    </>
  )

  return (
    <header className="fixed z-50 flex min-h-16 w-full items-center border-b border-border bg-card/90 px-4 backdrop-blur-md sm:px-6 lg:px-8">
      <div className="container mx-auto flex items-center justify-between gap-4 py-3">
        <Link to="/" className="flex shrink-0 items-center" aria-label="LeadLab">
          <img src="/images/leadlab-logo.png" alt="LeadLab" className="h-12 w-auto sm:h-14" />
        </Link>

        <nav className="hidden flex-1 flex-wrap items-center justify-end gap-x-5 gap-y-2 xl:flex">{links}</nav>

        <div className="hidden shrink-0 items-center gap-2 xl:flex">
          <LanguageSwitcher />
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          >
            <Calendar className="h-4 w-4" />
            {t('bookDemo')}
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              {t('goToDashboard')}
            </Link>
          ) : (
            <Link
              to="/signin"
              className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              {t('signIn')}
            </Link>
          )}
        </div>

        <button
          type="button"
          className="rounded-lg border border-border p-2 xl:hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('common:openNavigation')}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {open && (
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto border-t border-border bg-card px-4 py-4 xl:hidden">
          {links}
          <div className="flex justify-center">
            <LanguageSwitcher size="md" onChanged={() => setOpen(false)} />
          </div>
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-border px-4 py-2 text-center text-sm font-medium"
            onClick={() => setOpen(false)}
          >
            {t('bookDemo')}
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white"
              onClick={() => setOpen(false)}
            >
              {t('goToDashboard')}
            </Link>
          ) : (
            <Link
              to="/signin"
              className="rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white"
              onClick={() => setOpen(false)}
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      )}
    </header>
  )
}

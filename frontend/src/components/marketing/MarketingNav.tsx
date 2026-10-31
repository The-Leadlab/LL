import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { Calendar, Menu, X } from 'lucide-react'
import { useAuthStore } from '../../store/auth'
import { LanguageSwitcher } from '../LanguageSwitcher'
import { MarketingLogo } from './MarketingLogo'
import { ThemeToggle } from './ThemeToggle'
import { cn } from '@/lib/utils'

const navLink =
  'text-sm font-medium text-slate-600 transition-colors duration-150 whitespace-nowrap hover:text-primary-600 dark:text-slate-300 dark:hover:text-primary-400'

export function MarketingNav() {
  const { t } = useTranslation('nav')
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path ? 'text-primary-600 font-semibold dark:text-primary-400' : ''

  const close = () => setOpen(false)

  const primaryLinks = (
    <>
      <Link to="/" className={cn(navLink, isActive('/'))} onClick={close}>
        {t('home')}
      </Link>
      <a href="/#about" className={navLink} onClick={close}>
        {t('about')}
      </a>
      <a href="/#services" className={navLink} onClick={close}>
        {t('services')}
      </a>
      <a href="/#pricing" className={navLink} onClick={close}>
        {t('pricing')}
      </a>
      <Link to="/contact" className={cn(navLink, isActive('/contact'))} onClick={close}>
        {t('contact')}
      </Link>
    </>
  )

  const secondaryLinks = (
    <>
      <Link to="/intake/business-diagnostic" className={navLink} onClick={close}>
        {t('businessDiagnostic')}
      </Link>
      <Link to="/intake/data-request" className={navLink} onClick={close}>
        {t('dataRequest')}
      </Link>
      <Link to="/intake/pitch-your-idea" className={navLink} onClick={close}>
        {t('pitchYourIdea')}
      </Link>
      <Link to="/report" className={cn(navLink, isActive('/report'))} onClick={close}>
        {t('reportIssue')}
      </Link>
    </>
  )

  return (
    <header className="fixed inset-x-0 top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center" aria-label="LeadLab">
          <MarketingLogo />
        </Link>

        <nav className="ml-auto hidden items-center gap-x-5 lg:flex">{primaryLinks}</nav>

        <div className="hidden shrink-0 items-center gap-2 lg:flex">
          <ThemeToggle />
          <LanguageSwitcher />
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-800 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-800"
          >
            <Calendar className="h-4 w-4" />
            {t('bookDemo')}
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('goToDashboard')}
            </Link>
          ) : (
            <Link
              to="/signin"
              className="rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              {t('signIn')}
            </Link>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2 lg:hidden">
          <ThemeToggle />
          <button
            type="button"
            className="rounded-lg border border-slate-200 p-2 text-slate-800 dark:border-slate-700 dark:text-slate-100"
            aria-label={t('common:openNavigation')}
            onClick={() => setOpen((o) => !o)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {open && (
        <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto border-t border-slate-200 bg-white px-4 py-4 dark:border-slate-800 dark:bg-slate-950 lg:hidden">
          {primaryLinks}
          {secondaryLinks}
          <div className="flex justify-center">
            <LanguageSwitcher size="md" onChanged={close} />
          </div>
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-lg border border-slate-200 px-4 py-2 text-center text-sm font-medium text-slate-800 dark:border-slate-700 dark:text-slate-100"
            onClick={close}
          >
            {t('bookDemo')}
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              className="rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white"
              onClick={close}
            >
              {t('goToDashboard')}
            </Link>
          ) : (
            <Link
              to="/signin"
              className="rounded-lg bg-primary-600 px-4 py-2 text-center text-sm font-medium text-white"
              onClick={close}
            >
              {t('signIn')}
            </Link>
          )}
        </div>
      )}
    </header>
  )
}

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { driver, type DriveStep } from 'driver.js'
import 'driver.js/dist/driver.css'
import { LanguageSwitcher } from '@/components/LanguageSwitcher'
import { useAuthStore } from '@/store/auth'
import {
  TOUR_START_EVENT,
  clearTourCompleted,
  isTourCompleted,
  markTourCompleted,
} from '@/lib/productTour'

type StartDetail = { force?: boolean }

function stepElement(selector: string): Element | undefined {
  return document.querySelector(selector) ?? undefined
}

export function WelcomeTour() {
  const { t, i18n } = useTranslation('tour')
  const user = useAuthStore((s) => s.user)
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [open, setOpen] = useState(false)
  const drivingRef = useRef(false)

  const completeAndClose = useCallback(() => {
    markTourCompleted(user?.id)
    setOpen(false)
    drivingRef.current = false
  }, [user?.id])

  const runSpotlight = useCallback(() => {
    if (drivingRef.current) return
    drivingRef.current = true
    setOpen(false)

    const mk = (key: string): { title: string; description: string } => ({
      title: t(`steps.${key}.title`),
      description: t(`steps.${key}.description`),
    })

    const candidates: { selector: string; key: string }[] = [
      { selector: '[data-tour="sidebar"]', key: 'sidebar' },
      { selector: '[data-tour="leads"]', key: 'leads' },
      { selector: '[data-tour="deals"]', key: 'deals' },
      { selector: '[data-tour="tasks"]', key: 'tasks' },
      { selector: '[data-tour="email"]', key: 'email' },
      { selector: '[data-tour="language"]', key: 'languageSettings' },
    ]

    const steps: DriveStep[] = candidates
      .map(({ selector, key }) => {
        const el = stepElement(selector)
        if (!el) return null
        const pop = mk(key)
        return {
          element: selector,
          popover: {
            title: pop.title,
            description: pop.description,
            side: 'right' as const,
            align: 'start' as const,
          },
        }
      })
      .filter(Boolean) as DriveStep[]

    if (steps.length === 0) {
      completeAndClose()
      return
    }

    const d = driver({
      showProgress: true,
      animate: true,
      allowClose: true,
      overlayOpacity: 0.55,
      nextBtnText: t('next'),
      prevBtnText: t('previous'),
      doneBtnText: t('done'),
      steps,
      onDestroyed: () => {
        completeAndClose()
      },
    })

    // Let dialog unmount paint before spotlight
    requestAnimationFrame(() => {
      d.drive()
    })
  }, [completeAndClose, t])

  const handleSkip = () => {
    completeAndClose()
  }

  const handleStart = () => {
    runSpotlight()
  }

  useEffect(() => {
    if (!isAuthenticated || !user?.id) return
    if (isTourCompleted(user.id)) return
    // Small delay so layout chrome (data-tour) is mounted
    const id = window.setTimeout(() => setOpen(true), 400)
    return () => window.clearTimeout(id)
  }, [isAuthenticated, user?.id])

  useEffect(() => {
    const onStart = (event: Event) => {
      const detail = (event as CustomEvent<StartDetail>).detail
      if (detail?.force) {
        clearTourCompleted(user?.id)
      }
      setOpen(true)
    }
    window.addEventListener(TOUR_START_EVENT, onStart)
    return () => window.removeEventListener(TOUR_START_EVENT, onStart)
  }, [user?.id])

  // Refresh driver button labels if language changes mid-dialog
  useEffect(() => {
    void i18n.language
  }, [i18n.language])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
    >
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <h2
          id="welcome-tour-title"
          className="text-xl font-semibold text-neutral-900 dark:text-neutral-50"
        >
          {t('welcomeTitle')}
        </h2>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          {t('welcomeBody')}
        </p>

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
            {t('chooseLanguage')}
          </p>
          <LanguageSwitcher size="md" />
        </div>

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={handleSkip}
            className="min-h-[44px] rounded-lg px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {t('skip')}
          </button>
          <button
            type="button"
            onClick={handleStart}
            className="min-h-[44px] rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('start')}
          </button>
        </div>
      </div>
    </div>
  )
}

import { useTranslation } from 'react-i18next'
import type { AppLanguage } from '@/i18n/types'

type LanguageSwitcherProps = {
  className?: string
  /** Compact pill for nav bars */
  size?: 'sm' | 'md'
  /** Called after language change (e.g. close mobile menu) */
  onChanged?: () => void
}

export function LanguageSwitcher({
  className,
  size = 'sm',
  onChanged,
}: LanguageSwitcherProps) {
  const { i18n, t } = useTranslation('common')
  const current: AppLanguage = i18n.language?.startsWith('fr') ? 'fr' : 'en'

  const setLang = async (lang: AppLanguage) => {
    if (lang === current) return
    // Dynamic import avoids pulling axios/auth into the marketing boot graph
    const { setAppLanguage } = await import('@/i18n/setAppLanguage')
    await setAppLanguage(lang)
    onChanged?.()
  }

  const btn =
    size === 'sm'
      ? 'px-2 py-1 text-xs font-semibold min-h-[32px]'
      : 'px-3 py-1.5 text-sm font-semibold min-h-[40px]'

  const rootClass =
    'inline-flex items-center rounded-lg border border-neutral-200 bg-white p-0.5 dark:border-neutral-700 dark:bg-neutral-800' +
    (className ? ` ${className}` : '')

  return (
    <div
      className={rootClass}
      role="group"
      aria-label={t('language')}
    >
      <button
        type="button"
        aria-pressed={current === 'en'}
        className={`${btn} rounded-md transition-colors ${
          current === 'en'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
        }`}
        onClick={() => void setLang('en')}
      >
        EN
      </button>
      <button
        type="button"
        aria-pressed={current === 'fr'}
        className={`${btn} rounded-md transition-colors ${
          current === 'fr'
            ? 'bg-blue-600 text-white shadow-sm'
            : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700'
        }`}
        onClick={() => void setLang('fr')}
      >
        FR
      </button>
    </div>
  )
}

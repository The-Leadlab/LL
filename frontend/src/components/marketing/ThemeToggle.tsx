import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDarkMode } from '@/components/ThemeProvider'
import { cn } from '@/lib/utils'

type ThemeToggleProps = {
  className?: string
  /** Compact icon button for the marketing nav. */
  size?: 'sm' | 'md'
}

export function ThemeToggle({ className, size = 'sm' }: ThemeToggleProps) {
  const { t } = useTranslation('nav')
  const { actualTheme, setTheme } = useDarkMode()
  const isDark = actualTheme === 'dark'

  return (
    <button
      type="button"
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={cn(
        'inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-800 transition-colors hover:bg-slate-50',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800',
        size === 'sm' ? 'h-9 w-9' : 'h-10 w-10',
        className
      )}
      aria-label={isDark ? t('themeSwitchToLight', { defaultValue: 'Switch to light mode' }) : t('themeSwitchToDark', { defaultValue: 'Switch to dark mode' })}
      title={isDark ? t('themeSwitchToLight', { defaultValue: 'Switch to light mode' }) : t('themeSwitchToDark', { defaultValue: 'Switch to dark mode' })}
    >
      {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </button>
  )
}

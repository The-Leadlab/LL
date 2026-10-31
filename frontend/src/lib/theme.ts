/**
 * Single source of truth for LeadLab color mode.
 * Dark is opt-in; product default is light (marketing and CRM stay aligned).
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'leadlab-theme'
const THEME_MIGRATION_KEY = 'leadlab-theme-v2'
const LEGACY_KEYS = ['theme', 'dashboard-theme'] as const

export function getSystemTheme(): ResolvedTheme {
  if (typeof window === 'undefined') return 'light'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return getSystemTheme()
  return preference
}

export function readStoredTheme(): ThemePreference {
  if (typeof window === 'undefined') return 'light'
  try {
    const migrated = localStorage.getItem(THEME_MIGRATION_KEY) === '1'
    const raw =
      localStorage.getItem(THEME_STORAGE_KEY) ||
      localStorage.getItem('theme') ||
      localStorage.getItem('dashboard-theme')

    // One-time: stop surprising users whose OS is dark while marketing looked light.
    // Explicit light/dark choices are kept; bare "system" / missing → light.
    if (!migrated) {
      const next: ThemePreference =
        raw === 'dark' || raw === 'light' ? raw : 'light'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      localStorage.setItem(THEME_MIGRATION_KEY, '1')
      for (const key of LEGACY_KEYS) localStorage.removeItem(key)
      return next
    }

    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw
    }
    return 'light'
  } catch {
    return 'light'
  }
}

export function writeStoredTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
    localStorage.setItem(THEME_MIGRATION_KEY, '1')
    for (const key of LEGACY_KEYS) localStorage.removeItem(key)
  } catch {
    /* private mode */
  }
}

export function applyThemeClass(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  root.classList.add(resolved)
  root.style.colorScheme = resolved
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', resolved === 'dark' ? '#020617' : '#ffffff')
  }
}

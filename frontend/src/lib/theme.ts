/**
 * Single source of truth for LeadLab color mode.
 * Default follows the OS (system); users can pin light or dark.
 */

export type ThemePreference = 'light' | 'dark' | 'system'
export type ResolvedTheme = 'light' | 'dark'

export const THEME_STORAGE_KEY = 'leadlab-theme'
const THEME_MIGRATION_KEY = 'leadlab-theme-v3'
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
  if (typeof window === 'undefined') return 'system'
  try {
    const migrated = localStorage.getItem(THEME_MIGRATION_KEY) === '1'
    const raw =
      localStorage.getItem(THEME_STORAGE_KEY) ||
      localStorage.getItem('theme') ||
      localStorage.getItem('dashboard-theme')

    if (!migrated) {
      // Re-enable OS detection for the prior v2 "force light" cohort.
      // Keep an explicit dark pin; everything else starts on system.
      const next: ThemePreference = raw === 'dark' ? 'dark' : 'system'
      localStorage.setItem(THEME_STORAGE_KEY, next)
      localStorage.setItem(THEME_MIGRATION_KEY, '1')
      localStorage.setItem('leadlab-theme-v2', '1')
      for (const key of LEGACY_KEYS) localStorage.removeItem(key)
      return next
    }

    if (raw === 'light' || raw === 'dark' || raw === 'system') {
      return raw
    }
    return 'system'
  } catch {
    return 'system'
  }
}

export function writeStoredTheme(preference: ThemePreference): void {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, preference)
    localStorage.setItem(THEME_MIGRATION_KEY, '1')
    localStorage.setItem('leadlab-theme-v2', '1')
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

/**
 * App color-mode provider — light by default; dark is opt-in.
 */

import { createContext, useContext, useEffect, useState } from 'react'
import {
  applyThemeClass,
  readStoredTheme,
  resolveTheme,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemePreference,
} from '@/lib/theme'

interface ThemeContextType {
  theme: ThemePreference
  actualTheme: ResolvedTheme
  setTheme: (theme: ThemePreference) => void
  /** Switches between light and dark only (does not land on system). */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

export function DarkModeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>(() => readStoredTheme())
  const [actualTheme, setActualTheme] = useState<ResolvedTheme>(() =>
    resolveTheme(readStoredTheme())
  )

  const apply = (preference: ThemePreference) => {
    const resolved = resolveTheme(preference)
    applyThemeClass(resolved)
    setActualTheme(resolved)
    void import('@/native/capacitorBootstrap').then(({ syncStatusBarWithTheme }) =>
      syncStatusBarWithTheme(resolved)
    )
  }

  const setTheme = (newTheme: ThemePreference) => {
    setThemeState(newTheme)
    writeStoredTheme(newTheme)
    apply(newTheme)
  }

  const toggleTheme = () => {
    setTheme(actualTheme === 'dark' ? 'light' : 'dark')
  }

  useEffect(() => {
    apply(theme)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount once with stored preference
  }, [])

  useEffect(() => {
    if (theme !== 'system') return

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleChange = () => apply('system')
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [theme])

  return (
    <ThemeContext.Provider value={{ theme, actualTheme, setTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useDarkMode() {
  const context = useContext(ThemeContext)
  if (context === undefined) {
    throw new Error('useDarkMode must be used within a DarkModeProvider')
  }
  return context
}

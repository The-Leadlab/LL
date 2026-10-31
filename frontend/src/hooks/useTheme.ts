/**
 * @deprecated Prefer useDarkMode from ThemeProvider — kept as a thin alias.
 */
import { useDarkMode } from '@/components/ThemeProvider'

export const useTheme = () => {
  const { actualTheme, toggleTheme } = useDarkMode()
  return { theme: actualTheme, toggleTheme }
}

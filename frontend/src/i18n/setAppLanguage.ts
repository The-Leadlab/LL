import i18n from './index'
import { isAppLanguage, type AppLanguage } from './types'

export type SetAppLanguageOptions = {
  /** Persist to user_settings when authenticated. Default true. */
  syncSettings?: boolean
}

/**
 * Apply UI language: i18n, document.lang, axios Accept-Language, optional settings sync.
 * Axios/settings are loaded lazily to avoid circular imports at boot
 * (utils/LanguageSwitcher → setAppLanguage → axios → auth → …).
 */
export async function setAppLanguage(
  lang: AppLanguage,
  options: SetAppLanguageOptions = {},
): Promise<void> {
  const { syncSettings = true } = options
  if (!isAppLanguage(lang)) return

  await i18n.changeLanguage(lang)
  document.documentElement.lang = lang
  localStorage.setItem('leadlab_language', lang)

  try {
    const { default: api } = await import('@/lib/axios')
    api.defaults.headers.common['Accept-Language'] = lang
  } catch {
    /* interceptor still reads localStorage */
  }

  if (syncSettings) {
    const token =
      localStorage.getItem('token') || sessionStorage.getItem('token')
    if (token) {
      try {
        const { updateUserSettings } = await import('@/services/settings')
        await updateUserSettings({ language: lang })
      } catch {
        // Non-fatal: local preference still applied
      }
    }
  }
}

/** Apply Accept-Language from current i18n language (safe after app mount). */
export async function applyAcceptLanguageHeader(): Promise<void> {
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en'
  try {
    const { default: api } = await import('@/lib/axios')
    api.defaults.headers.common['Accept-Language'] = lang
  } catch {
    /* ignore */
  }
}

/** Hydrate language from user settings after login. */
export async function applyLanguageFromSettings(
  language: string | undefined | null,
): Promise<void> {
  if (!isAppLanguage(language)) return
  await setAppLanguage(language, { syncSettings: false })
}

export function getDateFnsLocale(): 'enUS' | 'fr' {
  return i18n.language?.startsWith('fr') ? 'fr' : 'enUS'
}

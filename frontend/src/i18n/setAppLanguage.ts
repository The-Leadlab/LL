import i18n from './index'
import { isAppLanguage, type AppLanguage } from './types'
import api from '@/lib/axios'
import { updateUserSettings } from '@/services/settings'

export type SetAppLanguageOptions = {
  /** Persist to user_settings when authenticated. Default true. */
  syncSettings?: boolean
}

/**
 * Apply UI language: i18n, document.lang, axios Accept-Language, optional settings sync.
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

  api.defaults.headers.common['Accept-Language'] = lang

  if (syncSettings) {
    const token =
      localStorage.getItem('token') || sessionStorage.getItem('token')
    if (token) {
      try {
        await updateUserSettings({ language: lang })
      } catch {
        // Non-fatal: local preference still applied
      }
    }
  }
}

/** Apply Accept-Language from current i18n language (call once at boot). */
export function applyAcceptLanguageHeader(): void {
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en'
  api.defaults.headers.common['Accept-Language'] = lang
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

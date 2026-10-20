export const APP_LANGUAGES = ['en', 'fr'] as const
export type AppLanguage = (typeof APP_LANGUAGES)[number]

export function isAppLanguage(value: unknown): value is AppLanguage {
  return value === 'en' || value === 'fr'
}

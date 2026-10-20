import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import LanguageDetector from 'i18next-browser-languagedetector'

import enCommon from './locales/en/common.json'
import enNav from './locales/en/nav.json'
import enMarketing from './locales/en/marketing.json'
import enAuth from './locales/en/auth.json'
import enSettings from './locales/en/settings.json'
import enLeads from './locales/en/leads.json'
import enDeals from './locales/en/deals.json'
import enTasks from './locales/en/tasks.json'
import enEmails from './locales/en/emails.json'
import enCalendar from './locales/en/calendar.json'
import enMessages from './locales/en/messages.json'
import enAdmin from './locales/en/admin.json'
import enErrors from './locales/en/errors.json'
import enValidation from './locales/en/validation.json'
import enModules from './locales/en/modules.json'

import frCommon from './locales/fr/common.json'
import frNav from './locales/fr/nav.json'
import frMarketing from './locales/fr/marketing.json'
import frAuth from './locales/fr/auth.json'
import frSettings from './locales/fr/settings.json'
import frLeads from './locales/fr/leads.json'
import frDeals from './locales/fr/deals.json'
import frTasks from './locales/fr/tasks.json'
import frEmails from './locales/fr/emails.json'
import frCalendar from './locales/fr/calendar.json'
import frMessages from './locales/fr/messages.json'
import frAdmin from './locales/fr/admin.json'
import frErrors from './locales/fr/errors.json'
import frValidation from './locales/fr/validation.json'
import frModules from './locales/fr/modules.json'

export const I18N_NAMESPACES = [
  'common',
  'nav',
  'marketing',
  'auth',
  'settings',
  'leads',
  'deals',
  'tasks',
  'emails',
  'calendar',
  'messages',
  'admin',
  'errors',
  'validation',
  'modules',
] as const

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        common: enCommon,
        nav: enNav,
        marketing: enMarketing,
        auth: enAuth,
        settings: enSettings,
        leads: enLeads,
        deals: enDeals,
        tasks: enTasks,
        emails: enEmails,
        calendar: enCalendar,
        messages: enMessages,
        admin: enAdmin,
        errors: enErrors,
        validation: enValidation,
        modules: enModules,
      },
      fr: {
        common: frCommon,
        nav: frNav,
        marketing: frMarketing,
        auth: frAuth,
        settings: frSettings,
        leads: frLeads,
        deals: frDeals,
        tasks: frTasks,
        emails: frEmails,
        calendar: frCalendar,
        messages: frMessages,
        admin: frAdmin,
        errors: frErrors,
        validation: frValidation,
        modules: frModules,
      },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'fr'],
    defaultNS: 'common',
    ns: [...I18N_NAMESPACES],
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'leadlab_language',
      caches: ['localStorage'],
    },
    react: { useSuspense: false },
  })

if (typeof document !== 'undefined') {
  const lang = i18n.language?.startsWith('fr') ? 'fr' : 'en'
  document.documentElement.lang = lang
}

i18n.on('languageChanged', (lng) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lng?.startsWith('fr') ? 'fr' : 'en'
  }
})

export default i18n

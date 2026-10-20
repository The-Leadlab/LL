import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { BarChart3, Database, Lightbulb, ArrowRight } from 'lucide-react'
import { MarketingNav } from '../components/marketing/MarketingNav'

const options = [
  {
    slug: 'business-diagnostic' as const,
    titleKey: 'diagnosticTitle',
    descriptionKey: 'intake.select.diagnosticDescription',
    icon: BarChart3,
    color: 'from-blue-600 to-indigo-600',
    border: 'hover:border-blue-300',
  },
  {
    slug: 'data-request' as const,
    titleKey: 'dataRequestTitle',
    descriptionKey: 'intake.select.dataRequestDescription',
    icon: Database,
    color: 'from-indigo-600 to-violet-600',
    border: 'hover:border-indigo-300',
  },
  {
    slug: 'pitch-your-idea' as const,
    titleKey: 'pitchTitle',
    descriptionKey: 'intake.select.pitchDescription',
    icon: Lightbulb,
    color: 'from-violet-600 to-fuchsia-600',
    border: 'hover:border-violet-300',
  },
]

export function IntakeSelectPage() {
  const { t } = useTranslation('marketing')
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <MarketingNav />
      <main className="pt-28 pb-20 px-4">
        <div className="max-w-4xl mx-auto">
          <p className="text-center text-sm font-medium text-blue-600 mb-2">{t('intake.select.eyebrow')}</p>
          <h1 className="text-3xl md:text-4xl font-bold text-center text-gray-900 mb-3">{t('intake.select.title')}</h1>
          <p className="text-center text-gray-600 mb-10 max-w-2xl mx-auto">
            {t('intake.select.subtitle')}
          </p>
          <div className="grid gap-4 md:gap-6">
            {options.map(({ slug, titleKey, descriptionKey, icon: Icon, color, border }) => (
              <Link
                key={slug}
                to={`/intake/${slug}`}
                className={`group flex flex-col sm:flex-row sm:items-center gap-4 p-6 rounded-2xl bg-white border border-gray-200 shadow-sm ${border} hover:shadow-md transition-all`}
              >
                <div
                  className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${color} text-white shadow-md`}
                >
                  <Icon className="h-7 w-7" aria-hidden />
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-semibold text-gray-900 group-hover:text-blue-700 transition-colors">{t(titleKey)}</h2>
                  <p className="text-sm text-gray-600 mt-1">{t(descriptionKey)}</p>
                </div>
                <span className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 shrink-0">
                  {t('intake.select.continue')}
                  <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
              </Link>
            ))}
          </div>

          <p className="text-center mt-10">
            <Link to="/" className="text-sm text-gray-500 hover:text-blue-600">
              {t('intake.select.backHome')}
            </Link>
          </p>
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { Trans, useTranslation } from 'react-i18next'
import { ArrowLeft, CheckCircle } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { MarketingNav } from '../components/marketing/MarketingNav'
import { submitMarketingForm } from '../services/marketingFormsApi'
import { DataRequestForm } from '../components/intake/DataRequestForm'
import { inputClass, labelClass } from '../components/intake/intakeFieldClasses'

const SLUGS = ['business-diagnostic', 'data-request', 'pitch-your-idea'] as const
type IntakeSlug = (typeof SLUGS)[number]

function isIntakeSlug(s: string | undefined): s is IntakeSlug {
  return !!s && (SLUGS as readonly string[]).includes(s)
}

export function IntakeFormPage() {
  const { t } = useTranslation('marketing')
  const { formSlug } = useParams<{ formSlug: string }>()
  const slug = isIntakeSlug(formSlug) ? formSlug : null

  const [step, setStep] = useState<'form' | 'nda' | 'success'>('form')

  const [bdLoading, setBdLoading] = useState(false)
  const [bdFullName, setBdFullName] = useState('')
  const [bdEmail, setBdEmail] = useState('')
  const [bdCompany, setBdCompany] = useState('')
  const [bdPhone, setBdPhone] = useState('')
  const [bdIndustry, setBdIndustry] = useState('')
  const [bdTeamSize, setBdTeamSize] = useState('')
  const [bdLeadVolume, setBdLeadVolume] = useState('')
  const [bdBiggestPain, setBdBiggestPain] = useState('')
  const [bdTools, setBdTools] = useState('')
  const [bdGoals, setBdGoals] = useState('')

  const [piLoading, setPiLoading] = useState(false)
  const [piFullName, setPiFullName] = useState('')
  const [piEmail, setPiEmail] = useState('')
  const [piCompany, setPiCompany] = useState('')
  const [piPhone, setPiPhone] = useState('')
  const [piProjectTitle, setPiProjectTitle] = useState('')
  const [piElevatorPitch, setPiElevatorPitch] = useState('')
  const [piProblemSolved, setPiProblemSolved] = useState('')
  const [piTargetUser, setPiTargetUser] = useState('')
  const [piMustHaves, setPiMustHaves] = useState('')
  const [piNiceToHaves, setPiNiceToHaves] = useState('')
  const [piBudgetRange, setPiBudgetRange] = useState('')
  const [piTimeline, setPiTimeline] = useState('')
  const [piLinks, setPiLinks] = useState('')
  const [piWhyLeadLab, setPiWhyLeadLab] = useState('')

  const [ndaAccepted, setNdaAccepted] = useState(false)
  const [ndaSignature, setNdaSignature] = useState('')

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [step, slug])

  const titleForSlug: Record<IntakeSlug, string> = {
    'business-diagnostic': t('diagnosticTitle'),
    'data-request': t('dataRequestTitle'),
    'pitch-your-idea': t('pitchTitle'),
  }

  const continueFromForm = (e: React.FormEvent) => {
    e.preventDefault()
    const form = e.currentTarget as HTMLFormElement
    if (!form.checkValidity()) {
      form.reportValidity()
      return
    }
    setStep('nda')
  }

  const onSubmitBusinessDiagnostic = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ndaAccepted || !ndaSignature.trim()) {
      toast.error(t('intake.form.ndaRequired'))
      return
    }
    setBdLoading(true)
    try {
      await submitMarketingForm({
        form_type: 'business_diagnostic',
        full_name: bdFullName,
        email: bdEmail,
        company: bdCompany || undefined,
        phone: bdPhone || undefined,
        subject: `Diagnostic — ${bdCompany || bdEmail}`,
        payload: {
          industry: bdIndustry,
          team_size: bdTeamSize,
          monthly_lead_volume: bdLeadVolume,
          biggest_pain_point: bdBiggestPain,
          current_tools: bdTools,
          twelve_month_goals: bdGoals,
          nda_accepted: ndaAccepted,
          nda_signature: ndaSignature,
          nda_signed_at: new Date().toISOString(),
        },
      })
      setStep('success')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('intake.form.submitFailed'))
    } finally {
      setBdLoading(false)
    }
  }

  const onSubmitPitchYourIdea = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!ndaAccepted || !ndaSignature.trim()) {
      toast.error(t('intake.form.ndaRequired'))
      return
    }
    setPiLoading(true)
    try {
      await submitMarketingForm({
        form_type: 'pitch_your_idea',
        full_name: piFullName,
        email: piEmail,
        company: piCompany || undefined,
        phone: piPhone || undefined,
        subject: piProjectTitle || `Pitch — ${piCompany || piEmail}`,
        payload: {
          project_title: piProjectTitle,
          elevator_pitch: piElevatorPitch,
          problem_solved: piProblemSolved,
          target_user: piTargetUser,
          must_have_features: piMustHaves,
          nice_to_have: piNiceToHaves,
          budget_range: piBudgetRange,
          timeline: piTimeline,
          reference_links: piLinks,
          why_the_lead_lab: piWhyLeadLab,
          nda_accepted: ndaAccepted,
          nda_signature: ndaSignature,
          nda_signed_at: new Date().toISOString(),
        },
      })
      setStep('success')
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('intake.form.submitFailed'))
    } finally {
      setPiLoading(false)
    }
  }

  if (!slug) {
    return <Navigate to="/intake" replace />
  }

  const ndaBlock = (
    <div className="border-t pt-6">
      <h4 className="text-lg font-semibold text-gray-900 mb-2">{t('intake.form.nda.title')}</h4>
      <p className="text-sm text-gray-600 mb-4">
        {t('intake.form.nda.description')}
      </p>
      <label className="flex items-start gap-3 text-sm text-gray-700">
        <input
          type="checkbox"
          checked={ndaAccepted}
          onChange={(e) => setNdaAccepted(e.target.checked)}
          className="mt-1"
        />
        <span>{t('intake.form.nda.agree')}</span>
      </label>
      <div className="mt-4">
        <label className={labelClass}>{t('intake.form.nda.signature')}</label>
        <input
          className={inputClass}
          value={ndaSignature}
          onChange={(e) => setNdaSignature(e.target.value)}
          placeholder={t('intake.form.nda.signaturePlaceholder')}
        />
      </div>
    </div>
  )

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <MarketingNav />
      <main className="pt-28 pb-20 px-4">
        <div className={`mx-auto ${slug === 'data-request' ? 'max-w-4xl' : 'max-w-3xl'}`}>
          <Link
            to="/intake"
            className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-blue-600 mb-8"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('intake.form.backToOptions')}
          </Link>

          {step === 'success' ? (
            <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-8 sm:p-10 text-center">
              <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-green-700 mb-6">
                <CheckCircle className="h-9 w-9" />
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{t('intake.form.successTitle')}</h1>
              <p className="text-gray-600 leading-relaxed max-w-lg mx-auto mb-2">
                {slug === 'data-request'
                  ? t('intake.form.successDataRequest')
                  : t('intake.form.successDefault')}
              </p>
              <p className="text-sm text-gray-500 mb-8">{t('intake.form.successWait')}</p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center">
                <Link
                  to="/"
                  className="inline-flex justify-center px-6 py-3 rounded-xl font-medium text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                >
                  {t('intake.form.backToHome')}
                </Link>
                <Link
                  to="/intake"
                  className="inline-flex justify-center px-6 py-3 rounded-xl font-medium border border-gray-300 text-gray-800 hover:border-blue-400"
                >
                  {t('intake.form.submitAnother')}
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">{titleForSlug[slug]}</h1>
              <p className="text-gray-600 mb-8">
                {slug === 'data-request'
                  ? t('intake.form.introDataRequest')
                  : step === 'form'
                    ? t('intake.form.introForm')
                    : t('intake.form.introNda')}
              </p>

              {step === 'form' && slug === 'business-diagnostic' && (
                <form
                  onSubmit={continueFromForm}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-6"
                >
                  <h2 className="text-xl font-bold text-gray-900">{t('intake.form.diagnostic.sectionTitle')}</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.fullName')}</label>
                      <input
                        className={inputClass}
                        required
                        value={bdFullName}
                        onChange={(e) => setBdFullName(e.target.value)}
                      />
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.workEmail')}</label>
                      <input
                        className={inputClass}
                        type="email"
                        required
                        value={bdEmail}
                        onChange={(e) => setBdEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.company')}</label>
                      <input className={inputClass} value={bdCompany} onChange={(e) => setBdCompany(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.phone')}</label>
                      <input className={inputClass} type="tel" value={bdPhone} onChange={(e) => setBdPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.diagnostic.industry')}</label>
                    <input
                      className={inputClass}
                      value={bdIndustry}
                      onChange={(e) => setBdIndustry(e.target.value)}
                      placeholder={t('intake.form.diagnostic.industryPlaceholder')}
                    />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.diagnostic.teamSize')}</label>
                      <select className={inputClass} value={bdTeamSize} onChange={(e) => setBdTeamSize(e.target.value)}>
                        <option value="">{t('intake.form.select')}</option>
                        <option value="1">{t('intake.form.diagnostic.teamSolo')}</option>
                        <option value="2-5">{t('intake.form.diagnostic.teamRange1')}</option>
                        <option value="6-20">{t('intake.form.diagnostic.teamRange2')}</option>
                        <option value="21+">{t('intake.form.diagnostic.teamRange3')}</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.diagnostic.leadVolume')}</label>
                      <input
                        className={inputClass}
                        value={bdLeadVolume}
                        onChange={(e) => setBdLeadVolume(e.target.value)}
                        placeholder={t('intake.form.diagnostic.leadVolumePlaceholder')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.diagnostic.biggestPain')}</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      value={bdBiggestPain}
                      onChange={(e) => setBdBiggestPain(e.target.value)}
                      placeholder={t('intake.form.diagnostic.biggestPainPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.diagnostic.tools')}</label>
                    <textarea
                      className={inputClass}
                      rows={2}
                      value={bdTools}
                      onChange={(e) => setBdTools(e.target.value)}
                      placeholder={t('intake.form.diagnostic.toolsPlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.diagnostic.goals')}</label>
                    <textarea className={inputClass} rows={3} value={bdGoals} onChange={(e) => setBdGoals(e.target.value)} />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all"
                  >
                    {t('intake.form.continueToNda')}
                  </button>
                </form>
              )}

              {slug === 'data-request' && step === 'form' && (
                <DataRequestForm onSuccess={() => setStep('success')} />
              )}

              {step === 'form' && slug === 'pitch-your-idea' && (
                <form
                  onSubmit={continueFromForm}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-6"
                >
                  <h2 className="text-xl font-bold text-gray-900">{t('pitchTitle')}</h2>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.fullName')}</label>
                      <input className={inputClass} required value={piFullName} onChange={(e) => setPiFullName(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.workEmail')}</label>
                      <input
                        className={inputClass}
                        type="email"
                        required
                        value={piEmail}
                        onChange={(e) => setPiEmail(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.companyOrg')}</label>
                      <input className={inputClass} value={piCompany} onChange={(e) => setPiCompany(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.phone')}</label>
                      <input className={inputClass} type="tel" value={piPhone} onChange={(e) => setPiPhone(e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.workingTitle')}</label>
                    <input
                      className={inputClass}
                      required
                      value={piProjectTitle}
                      onChange={(e) => setPiProjectTitle(e.target.value)}
                      placeholder={t('intake.form.pitch.workingTitlePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.elevatorPitch')}</label>
                    <textarea
                      className={inputClass}
                      rows={4}
                      required
                      value={piElevatorPitch}
                      onChange={(e) => setPiElevatorPitch(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.problemSolved')}</label>
                    <textarea
                      className={inputClass}
                      rows={3}
                      required
                      value={piProblemSolved}
                      onChange={(e) => setPiProblemSolved(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.primaryUser')}</label>
                    <textarea className={inputClass} rows={2} value={piTargetUser} onChange={(e) => setPiTargetUser(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.mustHaves')}</label>
                    <textarea className={inputClass} rows={3} value={piMustHaves} onChange={(e) => setPiMustHaves(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.niceToHave')}</label>
                    <textarea className={inputClass} rows={2} value={piNiceToHaves} onChange={(e) => setPiNiceToHaves(e.target.value)} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <label className={labelClass}>{t('intake.form.pitch.budgetRange')}</label>
                      <select className={inputClass} value={piBudgetRange} onChange={(e) => setPiBudgetRange(e.target.value)}>
                        <option value="">{t('intake.form.pitch.budgetNone')}</option>
                        <option value="under-5k">{t('intake.form.pitch.budgetUnder5k')}</option>
                        <option value="5k-25k">{t('intake.form.pitch.budget5k25k')}</option>
                        <option value="25k-100k">{t('intake.form.pitch.budget25k100k')}</option>
                        <option value="100k+">{t('intake.form.pitch.budget100k')}</option>
                        <option value="enterprise">{t('intake.form.pitch.budgetEnterprise')}</option>
                      </select>
                    </div>
                    <div>
                      <label className={labelClass}>{t('intake.form.pitch.timeline')}</label>
                      <input
                        className={inputClass}
                        value={piTimeline}
                        onChange={(e) => setPiTimeline(e.target.value)}
                        placeholder={t('intake.form.pitch.timelinePlaceholder')}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.links')}</label>
                    <textarea className={inputClass} rows={2} value={piLinks} onChange={(e) => setPiLinks(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelClass}>{t('intake.form.pitch.whyLeadLab')}</label>
                    <textarea className={inputClass} rows={2} value={piWhyLeadLab} onChange={(e) => setPiWhyLeadLab(e.target.value)} />
                  </div>
                  <button
                    type="submit"
                    className="w-full py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 transition-all"
                  >
                    {t('intake.form.continueToNda')}
                  </button>
                </form>
              )}

              {step === 'nda' && slug === 'business-diagnostic' && (
                <form
                  onSubmit={onSubmitBusinessDiagnostic}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-6"
                >
                  <h2 className="text-xl font-bold text-gray-900">{t('intake.form.reviewSubmit')}</h2>
                  <p className="text-sm text-gray-600">
                    <Trans
                      i18nKey="intake.form.diagnostic.aboutToSubmit"
                      ns="marketing"
                      values={{ name: bdFullName, email: bdEmail }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                  {ndaBlock}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNdaAccepted(false)
                        setNdaSignature('')
                        setStep('form')
                      }}
                      className="flex-1 py-3 rounded-xl font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
                    >
                      {t('intake.form.backToForm')}
                    </button>
                    <button
                      type="submit"
                      disabled={bdLoading}
                      className="flex-1 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
                    >
                      {bdLoading ? t('intake.form.sending') : t('intake.form.submitRequest')}
                    </button>
                  </div>
                </form>
              )}

              {step === 'nda' && slug === 'pitch-your-idea' && (
                <form
                  onSubmit={onSubmitPitchYourIdea}
                  className="bg-white rounded-2xl shadow-lg border border-gray-100 p-6 sm:p-8 space-y-6"
                >
                  <h2 className="text-xl font-bold text-gray-900">{t('intake.form.reviewSubmit')}</h2>
                  <p className="text-sm text-gray-600">
                    <Trans
                      i18nKey="intake.form.pitch.aboutToSubmit"
                      ns="marketing"
                      values={{
                        title: piProjectTitle || t('intake.form.pitch.yourPitch'),
                        name: piFullName,
                        email: piEmail,
                      }}
                      components={{ strong: <strong /> }}
                    />
                  </p>
                  {ndaBlock}
                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNdaAccepted(false)
                        setNdaSignature('')
                        setStep('form')
                      }}
                      className="flex-1 py-3 rounded-xl font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
                    >
                      {t('intake.form.backToForm')}
                    </button>
                    <button
                      type="submit"
                      disabled={piLoading}
                      className="flex-1 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-700 hover:to-indigo-700 disabled:opacity-60"
                    >
                      {piLoading ? t('intake.form.sending') : t('intake.form.submitRequest')}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  )
}

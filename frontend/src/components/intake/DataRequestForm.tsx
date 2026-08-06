import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { submitMarketingForm } from '@/services/marketingFormsApi'
import { CheckboxGroup } from './CheckboxGroup'
import { CountryMultiSelect } from './CountryMultiSelect'
import {
  BUSINESS_SECTORS,
  COMPANY_SIZE_OPTIONS,
  DATA_REQUEST_STEPS,
  DataRequestStepId,
  LEAD_INFO_OPTIONS,
  LEAD_SOURCING_OPTIONS,
  SALES_REP_COUNTS,
  TERMS_URL,
} from './dataRequestFormConfig'
import { inputClass, labelClass } from './intakeFieldClasses'

interface DataRequestFormProps {
  onSuccess: () => void
}

const stepOrder: DataRequestStepId[] = DATA_REQUEST_STEPS.map((s) => s.id)

export function DataRequestForm({ onSuccess }: DataRequestFormProps) {
  const [step, setStep] = useState<DataRequestStepId>('welcome')
  const [loading, setLoading] = useState(false)

  const [businessSectors, setBusinessSectors] = useState<string[]>([])
  const [businessSectorOther, setBusinessSectorOther] = useState('')
  const [salesReps, setSalesReps] = useState('')
  const [leadsPerWeek, setLeadsPerWeek] = useState('')
  const [leadSourcing, setLeadSourcing] = useState<string[]>([])
  const [leadSourcingOther, setLeadSourcingOther] = useState('')

  const [countries, setCountries] = useState<string[]>([])
  const [countriesOther, setCountriesOther] = useState('')
  const [idealCompanies, setIdealCompanies] = useState('')
  const [countriesOutOfBounds, setCountriesOutOfBounds] = useState('')
  const [targetIndustry, setTargetIndustry] = useState('')
  const [jobTitles, setJobTitles] = useState('')
  const [companySizes, setCompanySizes] = useState<string[]>([])

  const [linkedinExample, setLinkedinExample] = useState('')
  const [idealCustomer, setIdealCustomer] = useState('')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [company, setCompany] = useState('')

  const [leadInfoRequired, setLeadInfoRequired] = useState<string[]>([])
  const [additionalNotes, setAdditionalNotes] = useState('')
  const [weeklyLeadVolume, setWeeklyLeadVolume] = useState('')
  const [termsAccepted, setTermsAccepted] = useState(false)

  const stepIndex = stepOrder.indexOf(step)
  const progress = step === 'welcome' ? 0 : Math.round((stepIndex / (stepOrder.length - 1)) * 100)

  const payload = useMemo(
    () => ({
      business_sectors: businessSectors,
      business_sector_other: businessSectorOther || undefined,
      sales_representatives: salesReps,
      leads_per_week: leadsPerWeek || undefined,
      lead_sourcing: leadSourcing,
      lead_sourcing_other: leadSourcingOther || undefined,
      countries,
      countries_other: countriesOther || undefined,
      ideal_customer_companies: idealCompanies || undefined,
      countries_out_of_bounds: countriesOutOfBounds || undefined,
      target_industry: targetIndustry,
      job_titles: jobTitles,
      company_sizes: companySizes,
      linkedin_prospect_example: linkedinExample || undefined,
      ideal_customer: idealCustomer || undefined,
      lead_info_required: leadInfoRequired,
      additional_notes: additionalNotes || undefined,
      weekly_lead_volume: weeklyLeadVolume,
      terms_accepted: termsAccepted,
      terms_url: TERMS_URL,
      submitted_at: new Date().toISOString(),
    }),
    [
      businessSectors,
      businessSectorOther,
      salesReps,
      leadsPerWeek,
      leadSourcing,
      leadSourcingOther,
      countries,
      countriesOther,
      idealCompanies,
      countriesOutOfBounds,
      targetIndustry,
      jobTitles,
      companySizes,
      linkedinExample,
      idealCustomer,
      leadInfoRequired,
      additionalNotes,
      weeklyLeadVolume,
      termsAccepted,
    ],
  )

  const goNext = () => {
    const idx = stepOrder.indexOf(step)
    if (idx < stepOrder.length - 1) setStep(stepOrder[idx + 1])
  }

  const goBack = () => {
    const idx = stepOrder.indexOf(step)
    if (idx > 0) setStep(stepOrder[idx - 1])
  }

  const validateStep = (): boolean => {
    switch (step) {
      case 'business':
        if (businessSectors.length === 0) {
          toast.error('Select at least one business sector.')
          return false
        }
        if (!salesReps) {
          toast.error('Select how many sales representatives you have.')
          return false
        }
        if (leadSourcing.length === 0) {
          toast.error('Select at least one lead sourcing method.')
          return false
        }
        return true
      case 'audience':
        if (countries.length === 0 && !countriesOther.trim()) {
          toast.error('Select at least one country or region.')
          return false
        }
        if (!targetIndustry.trim()) {
          toast.error('Industry is required.')
          return false
        }
        if (!jobTitles.trim()) {
          toast.error('Job titles / roles are required.')
          return false
        }
        if (companySizes.length === 0) {
          toast.error('Select at least one company size.')
          return false
        }
        return true
      case 'contact':
        if (!firstName.trim() || !lastName.trim() || !phone.trim() || !email.trim() || !company.trim()) {
          toast.error('All contact fields are required.')
          return false
        }
        return true
      case 'requirements':
        if (!weeklyLeadVolume.trim() || Number.isNaN(Number(weeklyLeadVolume)) || Number(weeklyLeadVolume) < 1) {
          toast.error('Enter a valid weekly lead volume (number).')
          return false
        }
        return true
      case 'review':
        if (!termsAccepted) {
          toast.error('Please accept the Terms & Conditions.')
          return false
        }
        return true
      default:
        return true
    }
  }

  const handleContinue = (e?: React.FormEvent) => {
    e?.preventDefault()
    if (step === 'welcome') {
      setStep('business')
      return
    }
    if (!validateStep()) return
    if (step === 'review') {
      void handleSubmit()
      return
    }
    goNext()
  }

  const handleSubmit = async () => {
    if (!validateStep()) return
    setLoading(true)
    try {
      const fullName = `${firstName.trim()} ${lastName.trim()}`.trim()
      await submitMarketingForm({
        form_type: 'data_request',
        full_name: fullName,
        email: email.trim(),
        company: company.trim(),
        phone: phone.trim(),
        subject: `Data Request — ${company.trim()}`,
        payload,
        to_email: 'info@the-leadlab.com',
      })
      toast.success('Submitted — we will email you soon.')
      onSuccess()
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to submit. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-lg border border-gray-100 overflow-hidden">
      {step !== 'welcome' && (
        <div className="px-6 sm:px-8 pt-6">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>
              Step {stepIndex} of {stepOrder.length - 1}
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-blue-600 to-indigo-600 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      <form onSubmit={handleContinue} className="p-6 sm:p-8 space-y-6">
        {step === 'welcome' && (
          <>
            <div className="text-center py-4">
              <p className="text-sm font-medium text-indigo-600 mb-2">The Lead Lab</p>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-2">Welcome to The Lead Lab</h2>
              <p className="text-gray-600">Data Request Form</p>
              <p className="text-sm text-gray-500 mt-4 max-w-md mx-auto">
                Tell us about your business and ideal prospects so we can tailor lead generation to your needs.
              </p>
            </div>
          </>
        )}

        {step === 'business' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Your business</h2>
            <CheckboxGroup
              label="What does your business do?"
              description="What sector do you work in?"
              options={BUSINESS_SECTORS}
              value={businessSectors}
              onChange={setBusinessSectors}
              required
              allowOther
              otherValue={businessSectorOther}
              onOtherChange={setBusinessSectorOther}
            />
            <div>
              <label className={labelClass}>How many Sales Representatives are in your company or team? *</label>
              <select
                className={inputClass}
                value={salesReps}
                onChange={(e) => setSalesReps(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {SALES_REP_COUNTS.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>
                How many leads are Sales Representatives expected to target per week?
              </label>
              <p className="text-sm text-gray-500 mb-1">Feel free to specify; Cold, Existing, Follow ups… etc</p>
              <input className={inputClass} value={leadsPerWeek} onChange={(e) => setLeadsPerWeek(e.target.value)} />
            </div>
            <CheckboxGroup
              label="How are you currently sourcing leads?"
              options={LEAD_SOURCING_OPTIONS}
              value={leadSourcing}
              onChange={setLeadSourcing}
              required
              allowOther
              otherValue={leadSourcingOther}
              onOtherChange={setLeadSourcingOther}
            />
          </>
        )}

        {step === 'audience' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Target audience criteria</h2>
            <p className="text-sm text-gray-600">
              Define your ideal target audience so we can tailor the lead generation process to your specific needs.
            </p>
            <CountryMultiSelect
              value={countries}
              onChange={setCountries}
              otherValue={countriesOther}
              onOtherChange={setCountriesOther}
            />
            <div>
              <label className={labelClass}>What companies do your ideal customers work at?</label>
              <p className="text-sm text-gray-500 mb-1">Companies you have had success with or find interesting</p>
              <textarea
                className={inputClass}
                rows={3}
                value={idealCompanies}
                onChange={(e) => setIdealCompanies(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Countries out of bounds</label>
              <p className="text-sm text-gray-500 mb-1">Countries outside your scope or target areas</p>
              <input
                className={inputClass}
                value={countriesOutOfBounds}
                onChange={(e) => setCountriesOutOfBounds(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Industry *</label>
              <p className="text-sm text-gray-500 mb-1">
                Specify the industry or industries you are targeting for lead generation
              </p>
              <textarea
                className={inputClass}
                rows={2}
                required
                value={targetIndustry}
                onChange={(e) => setTargetIndustry(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Job titles / roles *</label>
              <p className="text-sm text-gray-500 mb-1">Job titles or roles of individuals you want to target</p>
              <input className={inputClass} required value={jobTitles} onChange={(e) => setJobTitles(e.target.value)} />
            </div>
            <CheckboxGroup
              label="Company size"
              description="Select company sizes based on number of employees"
              options={COMPANY_SIZE_OPTIONS}
              value={companySizes}
              onChange={setCompanySizes}
              required
            />
          </>
        )}

        {step === 'prospect' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Ideal prospect</h2>
            <div>
              <label className={labelClass}>Example LinkedIn profile for the perfect prospect</label>
              <input
                className={inputClass}
                type="url"
                value={linkedinExample}
                onChange={(e) => setLinkedinExample(e.target.value)}
                placeholder="https://www.linkedin.com/in/…"
              />
            </div>
            <div>
              <label className={labelClass}>Your ideal customer</label>
              <p className="text-sm text-gray-500 mb-1">
                e.g. Specific companies, industry leaders, or personas (LinkedIn URLs are especially helpful)
              </p>
              <textarea
                className={inputClass}
                rows={4}
                value={idealCustomer}
                onChange={(e) => setIdealCustomer(e.target.value)}
              />
            </div>
          </>
        )}

        {step === 'contact' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Your contact details</h2>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>First name *</label>
                <input className={inputClass} required value={firstName} onChange={(e) => setFirstName(e.target.value)} />
              </div>
              <div>
                <label className={labelClass}>Last name *</label>
                <input className={inputClass} required value={lastName} onChange={(e) => setLastName(e.target.value)} />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Phone number *</label>
                <input
                  className={inputClass}
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <div>
                <label className={labelClass}>Email *</label>
                <input
                  className={inputClass}
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className={labelClass}>Company *</label>
              <input className={inputClass} required value={company} onChange={(e) => setCompany(e.target.value)} />
            </div>
          </>
        )}

        {step === 'requirements' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Lead requirements</h2>
            <CheckboxGroup
              label="What information about your leads do you require?"
              description="Note any special requirements in the section below."
              options={LEAD_INFO_OPTIONS}
              value={leadInfoRequired}
              onChange={setLeadInfoRequired}
            />
            <div>
              <label className={labelClass}>Additional requests or notes</label>
              <textarea
                className={inputClass}
                rows={4}
                value={additionalNotes}
                onChange={(e) => setAdditionalNotes(e.target.value)}
              />
            </div>
            <div>
              <label className={labelClass}>Potential order volume (leads per week) *</label>
              <p className="text-sm text-gray-500 mb-1">How many leads does your sales team need per week?</p>
              <input
                className={inputClass}
                type="number"
                min={1}
                required
                value={weeklyLeadVolume}
                onChange={(e) => setWeeklyLeadVolume(e.target.value)}
              />
            </div>
          </>
        )}

        {step === 'review' && (
          <>
            <h2 className="text-xl font-bold text-gray-900">Review & submit</h2>
            <div className="text-sm text-gray-600 space-y-2 bg-gray-50 rounded-xl p-4 max-h-64 overflow-y-auto">
              <p>
                <strong>Contact:</strong> {firstName} {lastName} — {email} — {company}
              </p>
              <p>
                <strong>Sectors:</strong> {businessSectors.join(', ') || '—'}
              </p>
              <p>
                <strong>Sales reps:</strong> {salesReps}
              </p>
              <p>
                <strong>Countries:</strong> {[...countries, countriesOther].filter(Boolean).join(', ') || '—'}
              </p>
              <p>
                <strong>Industry:</strong> {targetIndustry}
              </p>
              <p>
                <strong>Weekly volume:</strong> {weeklyLeadVolume}
              </p>
            </div>
            <div className="border-t pt-4">
              <label className="flex items-start gap-3 text-sm text-gray-700">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                />
                <span>
                  I accept the{' '}
                  <a href={TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                    Terms & Conditions
                  </a>{' '}
                  before submitting this Data Request Form. *
                </span>
              </label>
            </div>
          </>
        )}

        <div className="flex flex-col-reverse sm:flex-row gap-3 pt-2">
          {step !== 'welcome' && (
            <button
              type="button"
              onClick={goBack}
              className="flex-1 inline-flex items-center justify-center gap-2 py-3 rounded-xl font-medium border border-gray-300 text-gray-800 hover:bg-gray-50"
            >
              <ChevronLeft className="h-4 w-4" />
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="flex-1 inline-flex items-center justify-center gap-2 py-4 rounded-xl font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 disabled:opacity-60"
          >
            {loading ? (
              'Sending…'
            ) : step === 'welcome' ? (
              'Start'
            ) : step === 'review' ? (
              'Submit data request'
            ) : (
              <>
                Continue
                <ChevronRight className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}

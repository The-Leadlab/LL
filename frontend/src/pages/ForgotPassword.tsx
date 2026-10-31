import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import {
  PublicAuthShell,
  publicAuthCtaClassName,
} from '../components/layout/PublicAuthShell'
import authService from '../services/auth'
import { getApiErrorMessage } from '../lib/apiError'
import { useTranslation } from 'react-i18next'

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30'

export function ForgotPassword() {
  const { t } = useTranslation('auth')
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await authService.forgotPassword({ email })
      toast.success(t('forgotPage.sentToast'))
      setEmailSent(true)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('forgotPage.sendFailed')))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error(t('forgotPage.enterEmailFirst'))
      return
    }

    setIsResending(true)
    try {
      await authService.resendPasswordReset({ email })
      toast.success(t('forgotPage.resentToast'))
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, t('forgotPage.resendFailed')))
    } finally {
      setIsResending(false)
    }
  }

  return (
    <PublicAuthShell>
      <div className="mb-8 text-center">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {t('resetPassword')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">{t('forgotPage.subtitle')}</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-800">
            {t('email')}
          </label>
          <input
            type="email"
            id="email"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value)
              setEmailSent(false)
            }}
            required
            className={fieldClass}
            placeholder={t('forgotPage.emailPlaceholder')}
          />
        </div>

        {emailSent && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4">
            <div className="flex items-start">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <div className="ml-3 flex-1">
                <p className="text-sm text-blue-700">{t('forgotPage.sentHelp')}</p>
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={isResending}
                  className="mt-2 text-sm font-medium text-blue-600 hover:text-indigo-700 disabled:opacity-50"
                >
                  {isResending ? (
                    <span className="flex items-center">
                      <div className="mr-2 h-3 w-3 animate-spin rounded-full border-b-2 border-blue-600" />
                      {t('forgotPage.resending')}
                    </span>
                  ) : (
                    t('forgotPage.resendEmail')
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        <button type="submit" disabled={isLoading} className={publicAuthCtaClassName}>
          {isLoading ? (
            <span className="flex items-center">
              <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
              {t('forgotPage.sending')}
            </span>
          ) : (
            t('forgotPage.sendInstructions')
          )}
        </button>
      </form>

      <div className="mt-6 text-center text-sm text-slate-600">
        {t('forgotPage.rememberPassword')}{' '}
        <Link to="/signin" className="font-medium text-primary-600 hover:text-primary-700">
          {t('backToSignIn')}
        </Link>
      </div>
    </PublicAuthShell>
  )
}

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { PublicHeader } from '../components/layout/PublicHeader'
import authService from '../services/auth'
import { getApiErrorMessage } from '../lib/apiError'
import { useTranslation } from 'react-i18next'

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
    <div className="flex flex-col min-h-screen">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center bg-background">
        <div className="w-full max-w-md mx-4">
          <div className="bg-card rounded-2xl shadow-xl p-8 border border-blue-100">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-foreground">{t('resetPassword')}</h1>
              <p className="text-muted-foreground mt-2">
                {t('forgotPage.subtitle')}
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-foreground mb-1"
                >
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
                  className="w-full px-4 py-2.5 border border-border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder={t('forgotPage.emailPlaceholder')}
                />
              </div>

              {emailSent && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-5 w-5 text-blue-500" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm text-blue-700">
                        {t('forgotPage.sentHelp')}
                      </p>
                      <button
                        type="button"
                        onClick={handleResend}
                        disabled={isResending}
                        className="mt-2 text-sm font-medium text-blue-600 hover:text-indigo-700 disabled:opacity-50"
                      >
                        {isResending ? (
                          <span className="flex items-center">
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-blue-600 mr-2" />
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

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    {t('forgotPage.sending')}
                  </div>
                ) : (
                  t('forgotPage.sendInstructions')
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-card text-muted-foreground">
                    {t('forgotPage.rememberPassword')}
                  </span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/signin"
                  className="font-medium text-blue-600 hover:text-indigo-700"
                >
                  {t('backToSignIn')}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

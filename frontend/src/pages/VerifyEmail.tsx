import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { PublicAuthShell, publicAuthCtaClassName } from '../components/layout/PublicAuthShell'
import { verifyEmail } from '../services/auth'

type VerifyMessageKey =
  | 'verifyEmailPage.verifying'
  | 'verifyEmailPage.missingToken'
  | 'verifyEmailPage.success'
  | 'verifyEmailPage.invalid'

export function VerifyEmail() {
  const { t } = useTranslation('auth')
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error')
  const [messageKey, setMessageKey] = useState<VerifyMessageKey>(
    token ? 'verifyEmailPage.verifying' : 'verifyEmailPage.missingToken',
  )

  useEffect(() => {
    if (!token) return
    let cancelled = false
    verifyEmail(token)
      .then(() => {
        if (cancelled) return
        setStatus('success')
        setMessageKey('verifyEmailPage.success')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setMessageKey('verifyEmailPage.invalid')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <PublicAuthShell>
      <div className="text-center">
        <img
          src="/images/leadlab-logo.png"
          alt="LeadLab"
          className="mx-auto mb-4 h-12 w-auto"
        />
        <h1 className="text-2xl font-bold tracking-tight text-foreground">{t('verifyEmailPage.title')}</h1>
        <p className={`mt-4 text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
          {t(messageKey)}
        </p>
        <Link to="/signin" className={`mt-6 inline-flex ${publicAuthCtaClassName}`}>
          {t('verifyEmailPage.goToSignIn')}
        </Link>
      </div>
    </PublicAuthShell>
  )
}

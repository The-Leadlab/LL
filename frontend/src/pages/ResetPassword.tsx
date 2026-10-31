import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import authService from '../services/auth'
import {
  PublicAuthShell,
  publicAuthCtaClassName,
} from '../components/layout/PublicAuthShell'
import { getApiErrorMessage } from '../lib/apiError'
import { useTranslation } from 'react-i18next'

const fieldClass =
  'w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 pr-11 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/30'

export function ResetPassword() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')

  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError('')

    if (formData.password !== formData.confirmPassword) {
      setError(t('resetPage.passwordsMismatch'))
      setIsLoading(false)
      return
    }

    if (formData.password.length < 8) {
      setError(t('resetPage.passwordMinLength'))
      setIsLoading(false)
      return
    }

    if (!token) {
      setError(t('resetPage.invalidToken'))
      setIsLoading(false)
      return
    }

    try {
      await authService.resetPassword({
        token,
        new_password: formData.password,
        password_confirmation: formData.confirmPassword,
      })
      setSuccess(true)
      toast.success(t('resetPage.successToast'))
      setTimeout(() => {
        navigate('/signin')
      }, 2500)
    } catch (err: unknown) {
      const errorMessage = getApiErrorMessage(err, t('resetPage.failed'))
      setError(errorMessage)
      toast.error(errorMessage)
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }

  if (!token) {
    return (
      <PublicAuthShell>
        <div className="text-center">
          <h1 className="mb-4 text-2xl font-bold text-slate-900">
            {t('resetPage.invalidLinkTitle')}
          </h1>
          <p className="mb-6 text-sm text-slate-600">{t('resetPage.invalidLinkBody')}</p>
          <Link to="/forgot-password" className={publicAuthCtaClassName}>
            {t('resetPage.requestNewLink')}
          </Link>
        </div>
      </PublicAuthShell>
    )
  }

  return (
    <PublicAuthShell>
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
          {success ? <CheckCircle2 className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
          {success ? t('resetPage.updatedTitle') : t('resetPage.title')}
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          {success ? t('resetPage.updatedSubtitle') : t('resetPage.subtitle')}
        </p>
      </div>

      {error ? (
        <div className="mb-6 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {success ? (
        <div className="space-y-4 text-center">
          <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800">
            {t('resetPage.successBanner')}
          </div>
          <Link to="/signin" className={publicAuthCtaClassName}>
            {t('verifyEmailPage.goToSignIn')}
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-800">
              {t('resetPage.newPassword')}
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
                minLength={8}
                autoComplete="new-password"
                className={fieldClass}
                placeholder={t('resetPage.newPasswordPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                aria-label={
                  showPassword ? t('signInPage.hidePassword') : t('signInPage.showPassword')
                }
              >
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>

          <div>
            <label
              htmlFor="confirmPassword"
              className="mb-1 block text-sm font-medium text-slate-800"
            >
              {t('resetPage.confirmNewPassword')}
            </label>
            <div className="relative">
              <input
                type={showConfirmPassword ? 'text' : 'password'}
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleChange}
                required
                minLength={8}
                autoComplete="new-password"
                className={fieldClass}
                placeholder={t('resetPage.confirmPlaceholder')}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword((v) => !v)}
                className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-slate-600"
                aria-label={
                  showConfirmPassword
                    ? t('signInPage.hidePassword')
                    : t('signInPage.showPassword')
                }
              >
                {showConfirmPassword ? (
                  <EyeOff className="h-5 w-5" />
                ) : (
                  <Eye className="h-5 w-5" />
                )}
              </button>
            </div>
          </div>

          <button type="submit" disabled={isLoading} className={publicAuthCtaClassName}>
            {isLoading ? (
              <span className="flex items-center justify-center">
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-b-2 border-white" />
                {t('resetPage.resetting')}
              </span>
            ) : (
              t('resetPage.updatePassword')
            )}
          </button>
        </form>
      )}
    </PublicAuthShell>
  )
}

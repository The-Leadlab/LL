import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Eye, EyeOff, Lock } from 'lucide-react'
import { toast } from 'react-hot-toast'
import authService from '../services/auth'
import { PublicHeader } from '../components/layout/PublicHeader'
import { getApiErrorMessage } from '../lib/apiError'
import { useTranslation } from 'react-i18next'

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <PublicHeader />
        <div className="flex items-center justify-center px-4 py-16">
          <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center border border-blue-100">
            <h1 className="text-2xl font-bold text-gray-900 mb-4">
              {t('resetPage.invalidLinkTitle')}
            </h1>
            <p className="text-gray-600 mb-6">
              {t('resetPage.invalidLinkBody')}
            </p>
            <Link
              to="/forgot-password"
              className="inline-flex items-center justify-center px-6 py-3 text-base font-medium rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 shadow-md"
            >
              {t('resetPage.requestNewLink')}
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 flex flex-col">
      <PublicHeader />

      <div className="container mx-auto px-4 py-4">
        <Link
          to="/signin"
          className="inline-flex items-center text-blue-600 hover:text-indigo-700 font-medium"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t('backToSignIn')}
        </Link>
      </div>

      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <div className="w-full max-w-md">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
            <div className="text-center mb-8">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-indigo-600 text-white shadow-md">
                {success ? <CheckCircle2 className="h-6 w-6" /> : <Lock className="h-6 w-6" />}
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">
                {success ? t('resetPage.updatedTitle') : t('resetPage.title')}
              </h1>
              <p className="text-gray-600 mt-2">
                {success
                  ? t('resetPage.updatedSubtitle')
                  : t('resetPage.subtitle')}
              </p>
            </div>

            {error ? (
              <div className="bg-red-50 text-red-700 p-4 rounded-xl mb-6 border border-red-100 text-sm">
                {error}
              </div>
            ) : null}

            {success ? (
              <div className="text-center space-y-4">
                <div className="bg-emerald-50 text-emerald-800 p-4 rounded-xl border border-emerald-100 text-sm">
                  {t('resetPage.successBanner')}
                </div>
                <Link
                  to="/signin"
                  className="inline-flex w-full items-center justify-center px-6 py-3 text-base font-semibold rounded-xl text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 transition-all shadow-md"
                >
                  {t('verifyEmailPage.goToSignIn')}
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div>
                  <label
                    htmlFor="password"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
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
                      className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('resetPage.newPasswordPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      aria-label={showPassword ? t('signInPage.hidePassword') : t('signInPage.showPassword')}
                    >
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="confirmPassword"
                    className="block text-sm font-medium text-gray-700 mb-1"
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
                      className="w-full px-4 py-2.5 pr-11 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder={t('resetPage.confirmPlaceholder')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      aria-label={showConfirmPassword ? t('signInPage.hidePassword') : t('signInPage.showPassword')}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-3 px-4 rounded-xl hover:from-blue-700 hover:to-indigo-700 transition-all duration-200 disabled:opacity-50 shadow-md font-semibold"
                >
                  {isLoading ? (
                    <div className="flex items-center justify-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      {t('resetPage.resetting')}
                    </div>
                  ) : (
                    t('resetPage.updatePassword')
                  )}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

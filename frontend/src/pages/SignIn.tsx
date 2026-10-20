import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Eye, EyeOff, Mail, Lock, LogIn } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { PublicAuthShell, publicAuthCtaClassName } from '../components/layout/PublicAuthShell'
import { motion } from 'framer-motion'
import authService from '../services/auth'
import { getApiErrorMessage } from '@/lib/apiError'
import { useTranslation } from 'react-i18next'

interface SignInForm {
  email?: string
  username?: string
  password: string
}

export function SignIn() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const location = useLocation()
  const { login, isAuthenticated, user, rememberMe: savedRememberMe } = useAuthStore()
  const [isLoading, setIsLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [formData, setFormData] = useState<SignInForm>({
    email: '',
    username: '',
    password: '',
  })
  const [loginType, setLoginType] = useState<'email' | 'username'>('email')
  const [rememberMe, setRememberMe] = useState(savedRememberMe ?? true)

  useEffect(() => {
    if (isAuthenticated && user) {
      const from = location.state?.from?.pathname || '/dashboard'
      navigate(from, { replace: true })
    }
  }, [isAuthenticated, user, navigate, location])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      const loginPayload: any = {
        password: formData.password
      }
      
      if (loginType === 'email' && formData.email) {
        loginPayload.email = formData.email
      } else if (loginType === 'username' && formData.username) {
        loginPayload.username = formData.username
      } else {
        toast.error(t('signInPage.enterEmailOrUsername'))
        setIsLoading(false)
        return
      }
      
      await login(loginPayload, rememberMe)
      toast.success(t('loginSuccess'))
    } catch (err: any) {
      console.error('Login error:', err)
      toast.error(getApiErrorMessage(err, t('signInPage.failed')))
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleGoogleSignIn = async () => {
    try {
      setIsLoading(true)
      const data = await authService.initGoogleSignIn(rememberMe)
      window.location.href = data.authorization_url
    } catch (err: any) {
      toast.error(err?.response?.data?.detail || t('signInPage.googleFailed'))
      setIsLoading(false)
    }
  }

  return (
    <PublicAuthShell maxWidthClassName="max-w-[480px]">
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mb-8 text-center"
      >
        <img
          src="/images/leadlab-logo.png"
          alt="LeadLab"
          className="mx-auto mb-4 h-12 w-auto"
        />
        <h2 className="text-3xl font-bold tracking-tight text-gray-900">
          {t('welcomeBack')}
        </h2>
        <p className="mt-2 text-sm text-gray-600">
          {t('signInPage.subtitle')}
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.05 }}
      >
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor={loginType} className="block text-sm font-medium leading-6 text-gray-900">
                    {loginType === 'email' ? t('signInPage.emailAddress') : t('signInPage.username')}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginType(loginType === 'email' ? 'username' : 'email')
                      setFormData({ ...formData, email: '', username: '' })
                    }}
                    className="text-xs text-blue-600 hover:text-blue-500 transition-colors"
                  >
                    {loginType === 'email' ? t('signInPage.useUsername') : t('signInPage.useEmail')}
                  </button>
                </div>
                <div className="mt-2 relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Mail className="h-5 w-5 text-gray-400" />
                  </div>
                  {loginType === 'email' ? (
                    <input
                      id="email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                      placeholder="you@example.com"
                      className="block w-full rounded-xl border-0 py-2.5 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 transition-all duration-200"
                    />
                  ) : (
                    <input
                      id="username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={formData.username}
                      onChange={handleChange}
                      placeholder={t('signInPage.usernamePlaceholder')}
                      className="block w-full rounded-xl border-0 py-2.5 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 transition-all duration-200"
                    />
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
                  {t('password')}
                </label>
                <div className="relative mt-2">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Lock className="h-5 w-5 text-gray-400" />
                  </div>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={formData.password}
                    onChange={handleChange}
                    placeholder="••••••••"
                    className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-blue-500 sm:text-sm sm:leading-6 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? t('signInPage.hidePassword') : t('signInPage.showPassword')}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600 transition-colors bg-transparent"
                  >
                    {showPassword ? (
                      <EyeOff className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <Eye className="h-5 w-5" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between mt-6">
                <div className="flex items-center">
                  <input
                    id="remember-me"
                    name="remember-me"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={() => setRememberMe(!rememberMe)}
                    className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-3 block text-sm leading-6 text-gray-700 cursor-pointer">
                    {t('rememberMe')}
                    <span className="block text-xs text-gray-500 font-normal">{t('signInPage.keepSignedIn')}</span>
                  </label>
                </div>

                <div className="text-sm leading-6">
                  <Link to="/forgot-password" className="font-semibold text-blue-600 hover:text-blue-500 transition-colors">
                    {t('forgotPassword')}
                  </Link>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`group relative ${publicAuthCtaClassName}`}
                >
                  <LogIn className="mr-2 h-5 w-5 text-blue-100" aria-hidden="true" />
                  {isLoading ? t('signInPage.signingIn') : t('signIn')}
                </button>
              </div>
            </form>

            <div className="mt-10">
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm font-medium leading-6">
                  <span className="bg-white px-6 text-gray-900">{t('common:or')}</span>
                </div>
              </div>

              <div className="mt-8 text-center text-sm text-gray-500">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="mb-4 inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  {t('signInPage.continueWithGoogle')}
                </button>
              </div>

              <div className="text-center text-sm text-gray-500">
                {t('noAccount')}{' '}
                <Link to="/signup" className="font-semibold leading-6 text-blue-600 hover:text-blue-500 transition-colors">
                  {t('signInPage.signUpNow')}
                </Link>
              </div>
            </div>

          <div className="mt-6 text-center text-xs text-gray-500">
            {t('legal.bySigningIn')}{' '}
            <Link to="/legal" className="text-blue-600 hover:text-blue-500 transition-colors">
              {t('legal.terms')}
            </Link>{' '}
            {t('legal.andThe')}{' '}
            <Link to="/legal" className="text-blue-600 hover:text-blue-500 transition-colors">
              {t('legal.privacy')}
            </Link>
          </div>
      </motion.div>
    </PublicAuthShell>
  )
}

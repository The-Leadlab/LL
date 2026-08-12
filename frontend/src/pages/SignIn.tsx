import { useState, useEffect } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/auth'
import { Eye, EyeOff, Mail, Lock, LogIn } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { PublicHeader } from '../components/layout/PublicHeader'
import { motion } from 'framer-motion'
import authService from '../services/auth'

interface SignInForm {
  email?: string
  username?: string
  password: string
}

export function SignIn() {
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
        toast.error('Please enter either email or username')
        setIsLoading(false)
        return
      }
      
      await login(loginPayload, rememberMe)
      toast.success('Login successful!')
    } catch (err: any) {
      console.error('Login error:', err)
      toast.error(err.response?.data?.message || err.response?.data?.detail || 'Failed to sign in')
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
      toast.error(err?.response?.data?.detail || 'Could not start Google sign in')
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100">
      <PublicHeader />
      
      <div className="flex min-h-full flex-1 flex-col justify-center py-12 sm:px-6 lg:px-8">
        <motion.div 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="sm:mx-auto sm:w-full sm:max-w-md"
        >
          <h2 className="mt-6 text-center text-3xl font-extrabold leading-9 tracking-tight text-gray-900">
            Welcome Back
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sign in to access your account
          </p>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-8 sm:mx-auto sm:w-full sm:max-w-[480px]"
        >
          <div className="bg-white px-6 py-12 shadow-lg sm:rounded-xl sm:px-12 border border-gray-100">
            <form className="space-y-6" onSubmit={handleSubmit}>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label htmlFor={loginType} className="block text-sm font-medium leading-6 text-gray-900">
                    {loginType === 'email' ? 'Email Address' : 'Username'}
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setLoginType(loginType === 'email' ? 'username' : 'email')
                      setFormData({ ...formData, email: '', username: '' })
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-500 transition-colors"
                  >
                    Use {loginType === 'email' ? 'username' : 'email'} instead
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
                      className="block w-full rounded-md border-0 py-2 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
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
                      placeholder="username"
                      className="block w-full rounded-md border-0 py-2 pl-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
                    />
                  )}
                </div>
              </div>

              <div>
                <label htmlFor="password" className="block text-sm font-medium leading-6 text-gray-900">
                  Password
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
                    className="block w-full rounded-md border-0 py-2 pl-10 pr-10 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6 transition-all duration-200"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
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
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                  />
                  <label htmlFor="remember-me" className="ml-3 block text-sm leading-6 text-gray-700 cursor-pointer">
                    Remember me
                    <span className="block text-xs text-gray-500 font-normal">Keep me signed in on this device</span>
                  </label>
                </div>

                <div className="text-sm leading-6">
                  <Link to="/forgot-password" className="font-semibold text-indigo-600 hover:text-indigo-500 transition-colors">
                    Forgot password?
                  </Link>
                </div>
              </div>

              <div className="mt-6">
                <button
                  type="submit"
                  disabled={isLoading}
                  className="group relative flex w-full justify-center items-center rounded-md bg-indigo-600 px-3 py-2.5 text-sm font-semibold leading-6 text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 ease-in-out"
                >
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                    <LogIn className="h-5 w-5 text-indigo-300 group-hover:text-indigo-200 transition-colors" aria-hidden="true" />
                  </span>
                  <span className="ml-2">
                    {isLoading ? 'Signing in...' : 'Sign in'}
                  </span>
                </button>
              </div>
            </form>

            <div className="mt-10">
              <div className="relative">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm font-medium leading-6">
                  <span className="bg-white px-6 text-gray-900">Or</span>
                </div>
              </div>

              <div className="mt-8 text-center text-sm text-gray-500">
                <button
                  type="button"
                  onClick={handleGoogleSignIn}
                  className="mb-4 inline-flex items-center justify-center rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Continue with Google
                </button>
              </div>

              <div className="text-center text-sm text-gray-500">
                Don't have an account?{' '}
                <Link to="/signup" className="font-semibold leading-6 text-indigo-600 hover:text-indigo-500 transition-colors">
                  Sign up now
                </Link>
              </div>
            </div>
          </div>
          
          <div className="mt-6 text-center text-xs text-gray-500">
            By signing in, you agree to our{' '}
            <Link to="/terms" className="text-indigo-600 hover:text-indigo-500 transition-colors">
              Terms of Service
            </Link>{' '}
            and{' '}
            <Link to="/privacy" className="text-indigo-600 hover:text-indigo-500 transition-colors">
              Privacy Policy
            </Link>
          </div>
        </motion.div>
      </div>
    </div>
  )
}

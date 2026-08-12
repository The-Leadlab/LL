import { useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'react-hot-toast'
import { PublicHeader } from '../components/layout/PublicHeader'
import authService from '../services/auth'
import { getApiErrorMessage } from '../lib/apiError'

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isResending, setIsResending] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)

    try {
      await authService.forgotPassword({ email })
      toast.success('Password reset instructions sent to your email')
      setEmailSent(true)
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to send reset instructions'))
    } finally {
      setIsLoading(false)
    }
  }

  const handleResend = async () => {
    if (!email) {
      toast.error('Please enter your email address first')
      return
    }

    setIsResending(true)
    try {
      await authService.resendPasswordReset({ email })
      toast.success('Password reset instructions resent to your email')
    } catch (err: unknown) {
      toast.error(getApiErrorMessage(err, 'Failed to resend reset instructions'))
    } finally {
      setIsResending(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PublicHeader />
      <main className="flex-1 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="w-full max-w-md mx-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 border border-blue-100">
            <div className="text-center mb-8">
              <h1 className="text-3xl font-bold tracking-tight text-gray-900">Reset Password</h1>
              <p className="text-gray-600 mt-2">
                Enter your email to receive reset instructions
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label
                  htmlFor="email"
                  className="block text-sm font-medium text-gray-700 mb-1"
                >
                  Email
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
                  className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter your email"
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
                        Instructions sent! Didn&apos;t receive the email? Check your spam folder or click below to resend.
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
                            Resending...
                          </span>
                        ) : (
                          'Resend Email'
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full flex justify-center py-3 px-4 border border-transparent rounded-xl shadow-md text-sm font-semibold text-white bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isLoading ? (
                  <div className="flex items-center">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                    Sending instructions...
                  </div>
                ) : (
                  'Send Reset Instructions'
                )}
              </button>
            </form>

            <div className="mt-6">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-2 bg-white text-gray-500">
                    Remember your password?
                  </span>
                </div>
              </div>

              <div className="mt-6 text-center">
                <Link
                  to="/signin"
                  className="font-medium text-blue-600 hover:text-indigo-700"
                >
                  Back to Sign In
                </Link>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PublicHeader } from '../components/layout/PublicHeader'
import { verifyEmail } from '../services/auth'

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') || ''
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(token ? 'loading' : 'error')
  const [message, setMessage] = useState(token ? 'Verifying your email…' : 'This verification link is missing a token.')

  useEffect(() => {
    if (!token) return
    let cancelled = false
    verifyEmail(token)
      .then(() => {
        if (cancelled) return
        setStatus('success')
        setMessage('Your email is verified. You can sign in now.')
      })
      .catch(() => {
        if (cancelled) return
        setStatus('error')
        setMessage('This verification link is invalid or has expired.')
      })
    return () => {
      cancelled = true
    }
  }, [token])

  return (
    <div className="flex min-h-screen flex-col">
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center bg-slate-50 px-4 py-12">
        <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Email verification</h1>
          <p className={`mt-4 text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>{message}</p>
          <Link
            to="/signin"
            className="mt-6 inline-flex rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go to sign in
          </Link>
        </div>
      </main>
    </div>
  )
}

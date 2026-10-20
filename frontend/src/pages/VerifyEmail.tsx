import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { PublicAuthShell, publicAuthCtaClassName } from '../components/layout/PublicAuthShell'
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
    <PublicAuthShell>
      <div className="text-center">
        <img
          src="/images/leadlab-logo.png"
          alt="LeadLab"
          className="mx-auto mb-4 h-12 w-auto"
        />
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Email verification</h1>
        <p className={`mt-4 text-sm ${status === 'error' ? 'text-red-600' : 'text-slate-600'}`}>
          {message}
        </p>
        <Link to="/signin" className={`mt-6 inline-flex ${publicAuthCtaClassName}`}>
          Go to sign in
        </Link>
      </div>
    </PublicAuthShell>
  )
}

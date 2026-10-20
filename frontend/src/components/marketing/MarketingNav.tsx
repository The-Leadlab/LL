import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Calendar, Menu, X } from 'lucide-react'
import { useAuthStore } from '../../store/auth'

const navLink =
  'text-sm font-medium text-gray-600 hover:text-blue-600 transition-colors whitespace-nowrap'

export function MarketingNav() {
  const { isAuthenticated } = useAuthStore()
  const location = useLocation()
  const [open, setOpen] = useState(false)

  const isActive = (path: string) =>
    location.pathname === path ? 'text-blue-600 font-semibold' : ''

  const links = (
    <>
      <Link to="/" className={`${navLink} ${isActive('/')}`} onClick={() => setOpen(false)}>
        Home
      </Link>
      <a
        href="/#about"
        className={`${navLink}`}
        onClick={() => setOpen(false)}
      >
        About
      </a>
      <a
        href="/#services"
        className={`${navLink}`}
        onClick={() => setOpen(false)}
      >
        Services
      </a>
      <a
        href="/#pricing"
        className={`${navLink}`}
        onClick={() => setOpen(false)}
      >
        Pricing
      </a>
      <Link to="/intake/business-diagnostic" className={navLink} onClick={() => setOpen(false)}>
        Business diagnostic
      </Link>
      <Link to="/intake/data-request" className={navLink} onClick={() => setOpen(false)}>
        Data request
      </Link>
      <Link to="/intake/pitch-your-idea" className={navLink} onClick={() => setOpen(false)}>
        Pitch your idea
      </Link>
      <Link to="/contact" className={`${navLink} ${isActive('/contact')}`} onClick={() => setOpen(false)}>
        Contact
      </Link>
      <Link to="/report" className={`${navLink} ${isActive('/report')}`} onClick={() => setOpen(false)}>
        Report an issue
      </Link>
    </>
  )

  return (
    <header className="fixed w-full px-4 sm:px-6 lg:px-8 min-h-16 flex items-center border-b bg-white/90 backdrop-blur-sm z-50 shadow-sm">
      <div className="container mx-auto flex items-center justify-between gap-4 py-3">
        <Link to="/" className="flex items-center shrink-0">
          <img src="/images/leadlab-logo.png" alt="The Lead Lab" className="h-12 sm:h-14 w-auto" />
        </Link>

        <nav className="hidden xl:flex items-center flex-wrap gap-x-5 gap-y-2 justify-end flex-1">{links}</nav>

        <div className="hidden xl:flex items-center gap-2 shrink-0">
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-lg hover:from-green-600 hover:to-emerald-700 flex items-center gap-1"
          >
            <Calendar className="w-4 h-4" />
            Book demo
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg"
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/signin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-2 rounded-lg"
            >
              Sign in
            </Link>
          )}
        </div>

        <button
          type="button"
          className="xl:hidden p-2 rounded-lg border border-gray-200"
          aria-label="Menu"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {open && (
        <div className="xl:hidden border-t bg-white px-4 py-4 flex flex-col gap-3 shadow-lg max-h-[70vh] overflow-y-auto">
          {links}
          <a
            href="https://calendly.com/joshua-the-leadlab/15min"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm font-medium bg-gradient-to-r from-green-500 to-emerald-600 text-white px-4 py-2 rounded-lg text-center"
            onClick={() => setOpen(false)}
          >
            Book demo
          </a>
          {isAuthenticated ? (
            <Link
              to="/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-medium text-blue-600"
              onClick={() => setOpen(false)}
            >
              Dashboard
            </Link>
          ) : (
            <Link
              to="/signin"
              target="_blank"
              rel="noopener noreferrer"
              className="text-center text-sm font-medium text-blue-600"
              onClick={() => setOpen(false)}
            >
              Sign in
            </Link>
          )}
        </div>
      )}
    </header>
  )
}

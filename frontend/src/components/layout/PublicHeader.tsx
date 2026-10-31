import { Link } from 'react-router-dom'
import logo from '../../assets/leadlab-logo.png'

/** Compact public header — always light, even when CRM dark mode is on. */
export function PublicHeader() {
  return (
    <header className="marketing-light border-b border-slate-200 bg-white">
      <div className="mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex-shrink-0">
            <img className="h-12 w-auto" src={logo} alt="LeadLab" />
          </Link>
        </div>
      </div>
    </header>
  )
}

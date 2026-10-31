import { Link } from 'react-router-dom';
import logo from '../../assets/leadlab-logo.png';

export function PublicHeader() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          <Link to="/" className="flex-shrink-0">
            <img className="h-12 w-auto" src={logo} alt="LeadLab" />
          </Link>
        </div>
      </div>
    </header>
  );
}

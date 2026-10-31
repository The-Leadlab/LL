import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { PublicHeader } from '../components/layout/PublicHeader';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="marketing-light flex h-full min-h-screen flex-col bg-white font-sans text-slate-900">
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
        <div className="text-center px-4">
          <div className="bg-white rounded-2xl shadow-xl p-8 md:p-12">
            <h1 className="text-6xl font-bold text-blue-600 mb-4">404</h1>
            <h2 className="text-2xl font-semibold text-gray-900 mb-4">Page Not Found</h2>
            <p className="text-gray-600 mb-8">
              The page you are looking for might have been removed, had its name changed,
              or is temporarily unavailable.
            </p>
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <Home size={20} className="mr-2" />
              Back to Home
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}

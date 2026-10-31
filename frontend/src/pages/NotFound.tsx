import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Home } from 'lucide-react';
import { PublicHeader } from '../components/layout/PublicHeader';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className="flex h-full min-h-screen flex-col bg-white font-sans text-slate-900 dark:bg-slate-950 dark:text-slate-50">
      <PublicHeader />
      <main className="flex flex-1 items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-slate-950 dark:to-slate-900">
        <div className="px-4 text-center">
          <div className="rounded-2xl bg-white p-8 shadow-xl dark:bg-slate-900 md:p-12">
            <h1 className="mb-4 text-6xl font-bold text-blue-600">404</h1>
            <h2 className="mb-4 text-2xl font-semibold text-gray-900 dark:text-slate-50">Page Not Found</h2>
            <p className="mb-8 text-gray-600 dark:text-slate-400">
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

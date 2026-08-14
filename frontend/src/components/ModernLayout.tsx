/**
 * Modern Layout — sidebar + main; mobile drawer navigation with overlay.
 */

import React, { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu } from 'lucide-react';
import { ModernSidebar } from './ModernSidebar';

export function ModernLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobile = () => setMobileNavOpen(false);

  return (
    <div className="flex h-screen bg-neutral-50 dark:bg-neutral-900">
      <header className="fixed left-0 right-0 top-0 z-40 flex h-14 items-center gap-3 border-b border-neutral-200 bg-white px-3 dark:border-neutral-800 dark:bg-neutral-900 md:hidden">
        <button
          type="button"
          aria-label="Open navigation"
          className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={() => setMobileNavOpen(true)}
        >
          <Menu className="h-6 w-6 text-neutral-700 dark:text-neutral-200" />
        </button>
        <img
          src="/images/leadlab-logo.png"
          alt="LeadLab"
          className="h-9 w-auto object-contain dark:brightness-0 dark:invert"
        />
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label="Close menu"
          onClick={closeMobile}
        />
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(100vw,18rem)] flex-shrink-0 transition-transform duration-200 ease-out md:static md:inset-auto md:z-auto md:w-auto md:translate-x-0 ${
          mobileNavOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <ModernSidebar onNavigate={closeMobile} />
      </div>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">
        <Outlet />
      </main>
    </div>
  );
}

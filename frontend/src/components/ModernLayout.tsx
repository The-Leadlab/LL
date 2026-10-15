/**
 * Modern Layout — sidebar + main; mobile drawer navigation with overlay.
 */

import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Menu, Moon, Sun } from 'lucide-react';
import { ModernSidebar } from './ModernSidebar';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { useDarkMode } from './ThemeProvider';

export function ModernLayout() {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const closeMobile = () => setMobileNavOpen(false);
  const { open, setOpen } = useCommandPalette();
  const { toggleTheme, actualTheme } = useDarkMode();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeMobile();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
        <button
          type="button"
          aria-label={actualTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          className="ml-auto flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={toggleTheme}
        >
          {actualTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
        </button>
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
        <div className="hidden md:flex justify-end px-4 pt-3">
          <button
            type="button"
            aria-label={actualTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm dark:border-neutral-700"
            onClick={toggleTheme}
          >
            {actualTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {actualTheme === 'dark' ? 'Light' : 'Dark'}
          </button>
        </div>
        <Outlet />
      </main>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

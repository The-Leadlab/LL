/**
 * Modern Layout — sidebar + main; mobile drawer navigation with overlay.
 */

import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Menu, Moon, Sun } from 'lucide-react';
import { ModernSidebar } from './ModernSidebar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WelcomeTour } from './WelcomeTour';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { useDarkMode } from './ThemeProvider';

export function ModernLayout() {
  const { t } = useTranslation('common');
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
          aria-label={t('openNavigation')}
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
        <div className="ml-auto flex items-center gap-1">
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={actualTheme === 'dark' ? t('switchToLight') : t('switchToDark')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-neutral-100 dark:hover:bg-neutral-800"
            onClick={toggleTheme}
          >
            {actualTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      {mobileNavOpen && (
        <button
          type="button"
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          aria-label={t('closeMenu')}
          onClick={closeMobile}
        />
      )}

      <div
        className={`fixed top-0 bottom-0 z-50 w-64 max-w-[calc(100vw-env(safe-area-inset-left))] flex-shrink-0 overflow-y-auto overflow-x-hidden bg-white shadow-xl transition-[left] duration-200 ease-out dark:bg-neutral-900 md:static md:left-auto md:w-auto md:max-w-none md:overflow-visible md:shadow-none ${
          mobileNavOpen ? 'left-0' : '-left-64'
        } md:left-auto`}
        style={{ paddingLeft: 'env(safe-area-inset-left)' }}
      >
        <ModernSidebar onNavigate={closeMobile} forceExpanded />
      </div>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto pt-14 md:pt-0">
        <div className="hidden md:flex items-center justify-end gap-2 px-4 pt-3">
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={actualTheme === 'dark' ? t('switchToLight') : t('switchToDark')}
            className="flex min-h-[44px] items-center gap-2 rounded-lg border border-neutral-200 px-3 text-sm dark:border-neutral-700"
            onClick={toggleTheme}
          >
            {actualTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {actualTheme === 'dark' ? t('light') : t('dark')}
          </button>
        </div>
        <Outlet />
      </main>
      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <WelcomeTour />
    </div>
  );
}

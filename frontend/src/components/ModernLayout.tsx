/**
 * Modern Layout — desktop sidebar; phone top bar + bottom tabs + More sheet.
 * Atlas chrome: ink surfaces, LeadLab accent, semantic tokens.
 */

import React, { useEffect, useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Moon, Sun } from 'lucide-react';
import { ModernSidebar } from './ModernSidebar';
import { LanguageSwitcher } from './LanguageSwitcher';
import { WelcomeTour } from './WelcomeTour';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import { useDarkMode } from './ThemeProvider';
import { NotificationBell } from './Notifications/NotificationBell';
import { MobileTabBar } from './mobile/MobileTabBar';
import { MobileMoreSheet } from './mobile/MobileMoreSheet';

export function ModernLayout() {
  const { t } = useTranslation('common');
  const [moreOpen, setMoreOpen] = useState(false);
  const { open, setOpen } = useCommandPalette();
  const { toggleTheme, actualTheme } = useDarkMode();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="flex h-screen bg-background font-sans text-foreground">
      <header className="fixed left-0 right-0 top-0 z-40 flex min-h-14 items-center gap-3 border-b border-border bg-card px-3 pt-[env(safe-area-inset-top)] md:hidden">
        <img
          src="/images/leadlab-logo.png"
          alt="LeadLab"
          className="h-9 w-auto object-contain dark:brightness-0 dark:invert"
        />
        <div className="ml-auto flex items-center gap-1">
          <NotificationBell variant="header" />
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={actualTheme === 'dark' ? t('switchToLight') : t('switchToDark')}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={toggleTheme}
          >
            {actualTheme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </header>

      <div className="hidden flex-shrink-0 md:block">
        <ModernSidebar />
      </div>

      <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto bg-background pt-[calc(3.5rem+env(safe-area-inset-top))] pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
        <div className="hidden items-center justify-end gap-2 border-b border-border/60 bg-card/40 px-4 py-2.5 md:flex">
          <NotificationBell variant="header" />
          <LanguageSwitcher />
          <button
            type="button"
            aria-label={actualTheme === 'dark' ? t('switchToLight') : t('switchToDark')}
            className="flex min-h-[40px] items-center gap-2 rounded-lg border border-border bg-transparent px-3 text-sm text-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={toggleTheme}
          >
            {actualTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {actualTheme === 'dark' ? t('light') : t('dark')}
          </button>
        </div>
        <Outlet />
      </main>

      <MobileTabBar onMore={() => setMoreOpen(true)} moreOpen={moreOpen} />
      <MobileMoreSheet open={moreOpen} onOpenChange={setMoreOpen} />

      <CommandPalette open={open} onClose={() => setOpen(false)} />
      <WelcomeTour />
    </div>
  );
}

/**
 * Capacitor native polish — safe to import on web (no-ops when not native).
 */

import { Capacitor } from '@capacitor/core';

export async function initCapacitorNative(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;

  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    const { SplashScreen } = await import('@capacitor/splash-screen');
    const { Keyboard } = await import('@capacitor/keyboard');
    const { App } = await import('@capacitor/app');

    const dark =
      document.documentElement.classList.contains('dark') ||
      window.matchMedia('(prefers-color-scheme: dark)').matches;

    await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({
        color: dark ? '#171717' : '#ffffff',
      });
    }

    // Keyboard plugin resizes via capacitor.config; ensure listeners do not leak.
    void Keyboard;
    await SplashScreen.hide().catch(() => undefined);

    App.addListener('appUrlOpen', ({ url }) => {
      try {
        const parsed = new URL(url);
        if (
          parsed.hostname === 'the-leadlab.com' ||
          parsed.hostname === 'www.the-leadlab.com' ||
          parsed.hostname.endsWith('.the-leadlab.com')
        ) {
          const path = `${parsed.pathname}${parsed.search}${parsed.hash}`;
          if (path && path !== '/') {
            window.history.pushState(null, '', path);
            window.dispatchEvent(new PopStateEvent('popstate'));
          }
        }
      } catch {
        /* ignore malformed urls */
      }
    });
  } catch (err) {
    console.warn('[capacitor] native init skipped', err);
  }
}

export async function syncStatusBarWithTheme(theme: 'light' | 'dark'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({
      style: theme === 'dark' ? Style.Dark : Style.Light,
    });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({
        color: theme === 'dark' ? '#171717' : '#ffffff',
      });
    }
  } catch {
    /* plugin may be unavailable in browser preview */
  }
}

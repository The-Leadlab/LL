import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useCallback, useEffect, useRef, useState } from 'react';

const AUTH_TIMEOUT_MS = 12_000;

export default function PrivateRoute() {
  const location = useLocation();
  const { isAuthenticated, user, fetchUser, logout } = useAuthStore();
  // Skip full-screen spinner when we already have a persisted session user (B19/B41)
  const [authChecked, setAuthChecked] = useState(() => Boolean(user) || !isAuthenticated);
  const [isLoading, setIsLoading] = useState(() => Boolean(isAuthenticated && !user));
  const [timedOut, setTimedOut] = useState(false);
  const [retryKey, setRetryKey] = useState(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuthTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      if (!isAuthenticated) {
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
          setTimedOut(false);
        }
        return;
      }

      if (user) {
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
          setTimedOut(false);
        }
        return;
      }

      try {
        setIsLoading(true);
        setTimedOut(false);
        clearAuthTimeout();
        timeoutRef.current = setTimeout(() => {
          if (!cancelled) {
            setTimedOut(true);
            setIsLoading(false);
            setAuthChecked(true);
          }
        }, AUTH_TIMEOUT_MS);

        await fetchUser();
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        clearAuthTimeout();
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
        }
      }
    };

    void checkAuth();
    return () => {
      cancelled = true;
      clearAuthTimeout();
    };
  }, [isAuthenticated, user, fetchUser, retryKey, clearAuthTimeout]);

  const handleRetry = () => {
    setTimedOut(false);
    setAuthChecked(false);
    setIsLoading(true);
    setRetryKey((k) => k + 1);
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      // still leave the gate so user can reach sign-in
    }
  };

  // Timed out waiting for cold API — offer retry / sign out instead of infinite spinner
  if (timedOut && isAuthenticated && !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-neutral-50 px-4 dark:bg-neutral-900">
        <p className="max-w-sm text-center text-sm text-neutral-700 dark:text-neutral-300">
          The server is taking too long to respond (often a cold start). You can retry or sign out.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={handleRetry}
            className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
          >
            Retry
          </button>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-lg border border-neutral-300 bg-white px-4 py-2 text-sm font-medium text-neutral-800 hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-100 dark:hover:bg-neutral-700"
          >
            Sign out
          </button>
        </div>
      </div>
    );
  }

  // Only block the whole app when we have a token but no user yet
  if (!authChecked || (isLoading && !user)) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/signin" state={{ from: location }} replace />;
  }

  const userAllowedSettingsPaths = new Set([
    '/settings',
    '/settings/profile',
    '/settings/notifications',
    '/settings/security',
    '/settings/integrations',
  ]);

  const isAdminRoute = location.pathname.startsWith('/admin')
    || (location.pathname.startsWith('/settings')
        && !userAllowedSettingsPaths.has(location.pathname));

  if (isAdminRoute && !user.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useEffect, useState } from 'react';

export default function PrivateRoute() {
  const location = useLocation();
  const { isAuthenticated, user, fetchUser } = useAuthStore();
  // Skip full-screen spinner when we already have a persisted session user (B19/B41)
  const [authChecked, setAuthChecked] = useState(() => Boolean(user) || !isAuthenticated);
  const [isLoading, setIsLoading] = useState(() => Boolean(isAuthenticated && !user));

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      if (!isAuthenticated) {
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
        }
        return;
      }

      if (user) {
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
        }
        return;
      }

      try {
        setIsLoading(true);
        await fetchUser();
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
          setAuthChecked(true);
        }
      }
    };

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, user, fetchUser]);

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

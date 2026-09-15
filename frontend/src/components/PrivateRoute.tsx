import { Navigate, useLocation, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';
import { useEffect, useState } from 'react';

export default function PrivateRoute() {
  const location = useLocation();
  const { isAuthenticated, user, fetchUser } = useAuthStore();
  const [isLoading, setIsLoading] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        if (!user && isAuthenticated) {
          await fetchUser();
        }
      } catch (error) {
        console.error('Auth check failed:', error);
      } finally {
        setIsLoading(false);
        setAuthChecked(true);
      }
    };

    checkAuth();
  }, [isAuthenticated, user, fetchUser]);

  // Don't render anything until initial auth check is complete
  if (!authChecked || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  // After auth check, if not authenticated, redirect to signin
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

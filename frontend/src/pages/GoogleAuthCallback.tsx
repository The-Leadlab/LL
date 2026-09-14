import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth';

function friendlyOAuthError(reason: string | null): string {
  if (!reason) return 'Google sign-in failed. Please try again.';
  switch (reason) {
    case 'org_internal':
      return (
        'Google sign-in is restricted to accounts inside the app\'s Google Workspace organization. ' +
        'Your email domain is not part of that organization. ' +
        'Please ask your admin to switch the Google Cloud OAuth consent screen to "External", ' +
        'or sign in with email and password instead.'
      );
    case 'access_denied':
      return (
        'Access was denied by Google. You may have cancelled the sign-in, or your account ' +
        'is not permitted to use this app. Please try again or use email/password sign-in.'
      );
    case 'token_exchange':
      return 'Could not complete sign-in with Google (token exchange failed). Please try again.';
    case 'userinfo':
      return 'Could not retrieve your Google profile. Please try again.';
    case 'no_email':
      return 'Google did not return an email address. Please try a different Google account.';
    case 'missing_code':
      return 'Google sign-in did not return an authorization code. Please try again.';
    default:
      return `Google sign-in failed: ${reason}`;
  }
}

export function GoogleAuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const status = params.get('status');
    const token = params.get('access_token');
    const rememberMe = params.get('remember_me') === '1';
    const reason = params.get('reason');

    const finish = async () => {
      if (status !== 'success' || !token) {
        const isOrgError = reason === 'org_internal' || reason === 'access_denied';
        toast.error(friendlyOAuthError(reason), {
          duration: isOrgError ? 10000 : 5000,
        });
        navigate('/signin', { replace: true });
        return;
      }
      if (rememberMe) {
        localStorage.setItem('token', token);
        sessionStorage.removeItem('token');
      } else {
        sessionStorage.setItem('token', token);
        localStorage.removeItem('token');
      }
      // Clear stale refresh tokens from prior sessions (Google flow issues access only)
      localStorage.removeItem('refreshToken');
      sessionStorage.removeItem('refreshToken');
      api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      useAuthStore.setState({
        token,
        isAuthenticated: true,
        rememberMe,
      });
      try {
        await useAuthStore.getState().fetchUser();
        toast.success('Signed in with Google');
        navigate('/dashboard', { replace: true });
      } catch {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        toast.error('Google sign in session could not be initialized');
        navigate('/signin', { replace: true });
      }
    };

    finish();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-sm text-gray-600">Finalizing Google sign in...</div>
    </div>
  );
}

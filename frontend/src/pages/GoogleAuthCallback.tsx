import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import api from '@/lib/axios';
import { useAuthStore } from '@/store/auth';

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
        toast.error(`Google sign in failed${reason ? `: ${reason}` : ''}`);
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

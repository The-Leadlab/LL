import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/services/axios';
import { toast } from 'react-hot-toast';

export function LinkedInCallback() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Get code and state from URL
        const code = searchParams.get('code');
        const state = searchParams.get('state');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Check for errors
        if (error || errorDescription) {
          console.error('LinkedIn OAuth error:', error, errorDescription);
          toast.error(errorDescription || 'LinkedIn authentication failed');
          navigate('/profile');
          return;
        }

        if (!code || !state) {
          console.error('Missing code or state parameter');
          toast.error('Authentication parameters missing');
          navigate('/profile');
          return;
        }

        // Exchange code for token using our backend endpoint
        const response = await api.post('/auth/linkedin/callback', { 
          code, 
          state 
        });

        console.log('LinkedIn callback successful:', response.data);
        toast.success('LinkedIn connected successfully!');

        // Redirect to profile page
        navigate('/profile');
      } catch (error: any) {
        console.error('LinkedIn callback error:', error);
        const errorMessage = error?.response?.data?.detail || 'Failed to connect LinkedIn account';
        toast.error(errorMessage);
        navigate('/profile');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  return (
    <div className="marketing-light flex min-h-screen items-center justify-center bg-slate-50 font-sans text-slate-900">
      <div className="text-center">
        <h2 className="mb-4 text-xl font-semibold text-slate-900">Connecting to LinkedIn...</h2>
        <div className="mx-auto h-8 w-8 animate-spin rounded-full border-b-2 border-blue-600"></div>
        <p className="mt-4 text-slate-600">Please wait while we complete your LinkedIn connection...</p>
      </div>
    </div>
  );
} 
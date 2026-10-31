import React, { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { calendlyService } from '../../services/calendly';
import { toast } from 'react-hot-toast';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import { Card, CardContent } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';

export const CalendlyCallback: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (error) {
          throw new Error(errorDescription || `Calendly authorization failed: ${error}`);
        }

        if (!code) {
          throw new Error('No authorization code received from Calendly');
        }

        // Exchange code for access token
        await calendlyService.exchangeCodeForToken(code);
        
        setStatus('success');
        toast.success('Successfully connected to Calendly!');
        
        // Redirect to calendar page after 2 seconds
        setTimeout(() => {
          navigate('/calendar');
        }, 2000);

      } catch (error: any) {
        console.error('Calendly callback error:', error);
        setStatus('error');
        setErrorMessage(error.message || 'Failed to connect to Calendly');
        toast.error(error.message || 'Failed to connect to Calendly');
      }
    };

    handleCallback();
  }, [searchParams, navigate]);

  const handleRetry = () => {
    navigate('/calendar');
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <Card className="w-full max-w-md">
        <CardContent className="p-8 text-center">
          {status === 'loading' && (
            <div className="space-y-4">
              <Loader2 className="h-12 w-12 animate-spin mx-auto text-blue-600" />
              <h2 className="text-xl font-semibold text-foreground">
                Connecting to Calendly...
              </h2>
              <p className="text-muted-foreground">
                Please wait while we complete the connection.
              </p>
            </div>
          )}

          {status === 'success' && (
            <div className="space-y-4">
              <CheckCircle className="h-12 w-12 mx-auto text-green-600" />
              <h2 className="text-xl font-semibold text-foreground">
                Successfully Connected!
              </h2>
              <p className="text-muted-foreground">
                Your Calendly account has been connected successfully. 
                Redirecting you back to the calendar...
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="space-y-4">
              <XCircle className="h-12 w-12 mx-auto text-red-600" />
              <h2 className="text-xl font-semibold text-foreground">
                Connection Failed
              </h2>
              <p className="text-muted-foreground">
                {errorMessage}
              </p>
              <Button onClick={handleRetry} className="w-full">
                Return to Calendar
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}; 
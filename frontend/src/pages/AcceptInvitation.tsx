import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { 
  Users, 
  Mail, 
  Shield, 
  Eye, 
  CheckCircle,
  XCircle,
  RefreshCw,
  Building
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input, PasswordInput } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import api from '@/services/api';

// Types
interface TeamInvitation {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: string;
  status: string;
  invited_by_name: string;
  organization_name: string;
  message?: string;
  created_at: string;
  expires_at: string;
}

// Form schema
const acceptInvitationSchema = z.object({
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ["confirmPassword"],
});

type AcceptInvitationFormData = z.infer<typeof acceptInvitationSchema>;

const AcceptInvitation: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const [invitationData, setInvitationData] = useState<TeamInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  // Form setup
  const form = useForm<AcceptInvitationFormData>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
      first_name: '',
      last_name: '',
    },
  });

  // Load invitation data
  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        toast.error('Invalid invitation link');
        navigate('/signin');
        return;
      }

      try {
        const response = await api.teamInvitations.getInvitationByToken(token);
        setInvitationData(response.data);
        
        // Pre-fill form with invitation data
        if (response.data.first_name) {
          form.setValue('first_name', response.data.first_name);
        }
        if (response.data.last_name) {
          form.setValue('last_name', response.data.last_name);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.detail || 'Failed to load invitation');
        navigate('/signin');
      } finally {
        setIsLoading(false);
      }
    };

    loadInvitation();
  }, [token, navigate, form]);

  // Handle form submission
  const onSubmit = async (data: AcceptInvitationFormData) => {
    if (!token || !invitationData) return;

    setIsAccepting(true);
    try {
      const response = await api.teamInvitations.acceptInvitation(token, {
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
      });

      toast.success('Invitation accepted. You can now sign in.');
      navigate('/signin');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to accept invitation');
    } finally {
      setIsAccepting(false);
    }
  };

  // Helper functions
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-4 w-4" />;
      case 'member':
        return <Users className="h-4 w-4" />;
      case 'viewer':
        return <Eye className="h-4 w-4" />;
      default:
        return <Users className="h-4 w-4" />;
    }
  };

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800';
      case 'member':
        return 'bg-blue-100 text-blue-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return 'Full access to all features and settings';
      case 'member':
        return 'Access to leads, deals, and team collaboration';
      case 'viewer':
        return 'Read-only access to view data and reports';
      default:
        return 'Team member access';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center space-x-2">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-500" />
          <span className="text-gray-600">Loading invitation...</span>
        </div>
      </div>
    );
  }

  if (!invitationData) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invalid Invitation</h2>
            <p className="text-gray-600 mb-4">
              This invitation link is invalid or has already been used.
            </p>
            <Button onClick={() => navigate('/signin')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (new Date(invitationData.expires_at).getTime() < Date.now()) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Card className="w-full max-w-md">
          <CardContent className="p-6 text-center">
            <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-900 mb-2">Invitation Expired</h2>
            <p className="text-gray-600 mb-4">
              This invitation has expired. Please contact your team administrator for a new invitation.
            </p>
            <Button onClick={() => navigate('/signin')} className="w-full">
              Go to Login
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const invitation = invitationData;

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        {/* Header */}
        <div className="text-center">
          <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-6 text-3xl font-extrabold text-gray-900">
            Join the Team
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            You've been invited to join {invitation.organization_name}
          </p>
        </div>

        {/* Invitation Details */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">Invitation Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <Building className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{invitation.organization_name}</p>
                <p className="text-xs text-gray-500">Organization</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-gray-900">{invitation.email}</p>
                <p className="text-xs text-gray-500">Your email address</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getRoleIcon(invitation.role)}
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                  </p>
                  <p className="text-xs text-gray-500">Your role</p>
                </div>
              </div>
              <Badge className={getRoleBadgeColor(invitation.role)}>
                {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
              </Badge>
            </div>

            <div className="bg-gray-50 p-3 rounded-md">
              <p className="text-xs text-gray-600">
                {getRoleDescription(invitation.role)}
              </p>
            </div>

            {invitation.message && (
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>Message from {invitation.invited_by_name}:</strong>
                </p>
                <p className="text-sm text-blue-700 mt-1">{invitation.message}</p>
              </div>
            )}

            <div className="text-xs text-gray-500">
              Invited by {invitation.invited_by_name} on {formatDate(invitation.created_at)}
            </div>
          </CardContent>
        </Card>

        {/* Account Creation Form */}
        <Card>
          <CardHeader>
            <CardTitle>Create Your Account</CardTitle>
            <CardDescription>
              Set up your password to complete the registration
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>First Name</FormLabel>
                        <FormControl>
                          <Input placeholder="John" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Last Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password *</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          placeholder="Enter your password"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="confirmPassword"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Confirm Password *</FormLabel>
                      <FormControl>
                        <PasswordInput 
                          placeholder="Confirm your password"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    By accepting this invitation, you agree to join {invitation.organization_name} 
                    and will have {invitation.role} access to the platform.
                  </AlertDescription>
                </Alert>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isAccepting}
                >
                  {isAccepting ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Creating Account...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Accept Invitation & Create Account
                    </>
                  )}
                </Button>
              </form>
            </Form>
          </CardContent>
        </Card>

        <div className="text-center">
          <p className="text-xs text-gray-500">
            Already have an account?{' '}
            <button
              onClick={() => navigate('/signin')}
              className="text-blue-600 hover:text-blue-500"
            >
              Sign in here
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default AcceptInvitation;
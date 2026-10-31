import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import type { TFunction } from 'i18next';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
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

import { Input, PasswordInput } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Badge } from '@/components/ui/Badge';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import { PublicAuthShell, publicAuthCtaClassName } from '@/components/layout/PublicAuthShell';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth';

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
  created_at?: string;
  expires_at: string;
  existing_user?: boolean;
}

// Form schema (new accounts only)
const createAcceptInvitationSchema = (t: TFunction<'auth'>) =>
  z.object({
    password: z.string().min(8, t('acceptInvitationPage.passwordMinLength')),
    confirmPassword: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
  }).refine((data) => data.password === data.confirmPassword, {
    message: t('acceptInvitationPage.passwordsMismatch'),
    path: ["confirmPassword"],
  });

type AcceptInvitationFormData = z.infer<ReturnType<typeof createAcceptInvitationSchema>>;

function invitationErrorDetail(error: any, fallback: string): string {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (detail && typeof detail === 'object' && typeof detail.message === 'string') {
    return detail.message;
  }
  return fallback;
}

const AcceptInvitation: React.FC = () => {
  const { t, i18n } = useTranslation('auth');
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [invitationData, setInvitationData] = useState<TeamInvitation | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);

  const acceptInvitationSchema = useMemo(() => createAcceptInvitationSchema(t), [t]);

  const form = useForm<AcceptInvitationFormData>({
    resolver: zodResolver(acceptInvitationSchema),
    defaultValues: {
      password: '',
      confirmPassword: '',
      first_name: '',
      last_name: '',
    },
  });

  useEffect(() => {
    const loadInvitation = async () => {
      if (!token) {
        toast.error(t('acceptInvitationPage.invalidLink'));
        navigate('/signin');
        return;
      }

      try {
        // teamInvitations service already returns unwrapped response.data
        const invitation = await api.teamInvitations.getInvitationByToken(token);
        setInvitationData(invitation);
        
        if (invitation.first_name) {
          form.setValue('first_name', invitation.first_name);
        }
        if (invitation.last_name) {
          form.setValue('last_name', invitation.last_name);
        }
      } catch (error: any) {
        toast.error(error.response?.data?.detail || t('acceptInvitationPage.loadFailed'));
        navigate('/signin');
      } finally {
        setIsLoading(false);
      }
    };

    loadInvitation();
  }, [token, navigate, form, t]);

  const signedInAsInvitee =
    isAuthenticated &&
    !!user?.email &&
    !!invitationData?.email &&
    user.email.trim().toLowerCase() === invitationData.email.trim().toLowerCase();

  const joinExistingAccount = async () => {
    if (!token || !invitationData) return;
    setIsAccepting(true);
    try {
      await api.teamInvitations.acceptInvitation(token, {});
      toast.success(t('acceptInvitationPage.joinedToast'));
      navigate('/dashboard');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (error?.response?.status === 409 || detail?.code === 'existing_user') {
        toast.error(detail?.message || t('acceptInvitationPage.signInExisting'));
        navigate('/signin', { state: { from: { pathname: `/invite/${token}` } } });
        return;
      }
      toast.error(invitationErrorDetail(error, t('acceptInvitationPage.acceptFailed')));
    } finally {
      setIsAccepting(false);
    }
  };

  const onSubmit = async (data: AcceptInvitationFormData) => {
    if (!token || !invitationData) return;

    setIsAccepting(true);
    try {
      await api.teamInvitations.acceptInvitation(token, {
        password: data.password,
        first_name: data.first_name,
        last_name: data.last_name,
      });

      toast.success(t('acceptInvitationPage.acceptedToast'));
      navigate('/signin');
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      if (error?.response?.status === 409 || detail?.code === 'existing_user') {
        toast.error(detail?.message || t('acceptInvitationPage.signInExisting'));
        navigate('/signin', { state: { from: { pathname: `/invite/${token}` } } });
        return;
      }
      toast.error(invitationErrorDetail(error, t('acceptInvitationPage.acceptFailed')));
    } finally {
      setIsAccepting(false);
    }
  };

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
        return 'bg-muted text-foreground';
      default:
        return 'bg-muted text-foreground';
    }
  };

  const getRoleDescription = (role: string) => {
    switch (role) {
      case 'admin':
        return t('acceptInvitationPage.roleDescriptions.admin');
      case 'member':
        return t('acceptInvitationPage.roleDescriptions.member');
      case 'viewer':
        return t('acceptInvitationPage.roleDescriptions.viewer');
      default:
        return t('acceptInvitationPage.roleDescriptions.default');
    }
  };

  const getRoleLabel = (role: string) =>
    t(`acceptInvitationPage.roles.${role}`, {
      defaultValue: role.charAt(0).toUpperCase() + role.slice(1),
    });

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <PublicAuthShell withCard={false}>
        <div className="flex items-center justify-center space-x-2 py-16">
          <RefreshCw className="h-6 w-6 animate-spin text-blue-600" />
          <span className="text-muted-foreground">{t('acceptInvitationPage.loading')}</span>
        </div>
      </PublicAuthShell>
    );
  }

  if (!invitationData) {
    return (
      <PublicAuthShell>
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t('acceptInvitationPage.invalidTitle')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('acceptInvitationPage.invalidBody')}
          </p>
          <button type="button" onClick={() => navigate('/signin')} className={publicAuthCtaClassName}>
            {t('verifyEmailPage.goToSignIn')}
          </button>
        </div>
      </PublicAuthShell>
    );
  }

  if (new Date(invitationData.expires_at).getTime() < Date.now()) {
    return (
      <PublicAuthShell>
        <div className="text-center">
          <XCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-foreground mb-2">{t('acceptInvitationPage.expiredTitle')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('acceptInvitationPage.expiredBody')}
          </p>
          <button type="button" onClick={() => navigate('/signin')} className={publicAuthCtaClassName}>
            {t('verifyEmailPage.goToSignIn')}
          </button>
        </div>
      </PublicAuthShell>
    );
  }

  const invitation = invitationData;
  const isExistingUser = Boolean(invitation.existing_user);

  return (
    <PublicAuthShell maxWidthClassName="max-w-md" withCard={false}>
      <div className="w-full space-y-6">
        <div className="text-center">
          <img
            src="/images/leadlab-logo.png"
            alt="LeadLab"
            className="mx-auto mb-4 h-12 w-auto"
          />
          <div className="mx-auto h-12 w-12 bg-blue-100 rounded-full flex items-center justify-center">
            <Users className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="mt-4 text-3xl font-bold tracking-tight text-foreground">
            {t('acceptInvitationPage.joinTeamTitle')}
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('acceptInvitationPage.invitedTo', { organization: invitation.organization_name })}
          </p>
        </div>

        <Card className="border-blue-100 shadow-xl rounded-2xl overflow-hidden">
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">{t('acceptInvitationPage.detailsTitle')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center space-x-3">
              <Building className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-foreground">{invitation.organization_name}</p>
                <p className="text-xs text-muted-foreground">{t('acceptInvitationPage.organization')}</p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Mail className="h-5 w-5 text-gray-400" />
              <div>
                <p className="text-sm font-medium text-foreground">{invitation.email}</p>
                <p className="text-xs text-muted-foreground">{t('acceptInvitationPage.yourEmailAddress')}</p>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                {getRoleIcon(invitation.role)}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {getRoleLabel(invitation.role)}
                  </p>
                  <p className="text-xs text-muted-foreground">{t('acceptInvitationPage.yourRole')}</p>
                </div>
              </div>
              <Badge className={getRoleBadgeColor(invitation.role)}>
                {getRoleLabel(invitation.role)}
              </Badge>
            </div>

            <div className="bg-muted/50 p-3 rounded-md">
              <p className="text-xs text-muted-foreground">
                {getRoleDescription(invitation.role)}
              </p>
            </div>

            {invitation.message && (
              <div className="bg-blue-50 p-3 rounded-md">
                <p className="text-sm text-blue-800">
                  <strong>{t('acceptInvitationPage.messageFrom', { name: invitation.invited_by_name })}</strong>
                </p>
                <p className="text-sm text-blue-700 mt-1">{invitation.message}</p>
              </div>
            )}

            {invitation.created_at && (
              <div className="text-xs text-muted-foreground">
                {t('acceptInvitationPage.invitedByOn', { name: invitation.invited_by_name, date: formatDate(invitation.created_at) })}
              </div>
            )}
          </CardContent>
        </Card>

        {isExistingUser ? (
          <Card className="border-blue-100 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle>{t('acceptInvitationPage.existingTitle')}</CardTitle>
              <CardDescription>
                {t('acceptInvitationPage.existingBody', { email: invitation.email, organization: invitation.organization_name })}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {signedInAsInvitee ? (
                <>
                  <Alert>
                    <CheckCircle className="h-4 w-4" />
                    <AlertDescription>
                      {t('acceptInvitationPage.signedInClickJoin', { email: user?.email })}
                    </AlertDescription>
                  </Alert>
                  <button
                    type="button"
                    className={publicAuthCtaClassName}
                    disabled={isAccepting}
                    onClick={() => void joinExistingAccount()}
                  >
                    {isAccepting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t('acceptInvitationPage.joining')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('acceptInvitationPage.joinOrg', { organization: invitation.organization_name })}
                      </>
                    )}
                  </button>
                </>
              ) : (
                <>
                  {isAuthenticated && user?.email && (
                    <Alert>
                      <AlertDescription>
                        {t('acceptInvitationPage.wrongAccount', { current: user.email, invited: invitation.email })}
                      </AlertDescription>
                    </Alert>
                  )}
                  <button
                    type="button"
                    className={publicAuthCtaClassName}
                    onClick={() =>
                      navigate('/signin', {
                        state: { from: { pathname: `/invite/${token}` } },
                      })
                    }
                  >
                    {t('acceptInvitationPage.signInToJoin')}
                  </button>
                </>
              )}
            </CardContent>
          </Card>
        ) : (
          <Card className="border-blue-100 shadow-xl rounded-2xl overflow-hidden">
            <CardHeader>
              <CardTitle>{t('signUpTitle')}</CardTitle>
              <CardDescription>
                {t('acceptInvitationPage.setupPassword')}
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
                          <FormLabel>{t('firstName')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('acceptInvitationPage.firstNamePlaceholder')} {...field} />
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
                          <FormLabel>{t('lastName')}</FormLabel>
                          <FormControl>
                            <Input placeholder={t('acceptInvitationPage.lastNamePlaceholder')} {...field} />
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
                        <FormLabel>{t('password')} *</FormLabel>
                        <FormControl>
                          <PasswordInput 
                            placeholder={t('acceptInvitationPage.passwordPlaceholder')}
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
                        <FormLabel>{t('confirmPassword')} *</FormLabel>
                        <FormControl>
                          <PasswordInput 
                            placeholder={t('acceptInvitationPage.confirmPasswordPlaceholder')}
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
                      {t('acceptInvitationPage.agreeJoin', { organization: invitation.organization_name, role: getRoleLabel(invitation.role).toLowerCase() })}
                    </AlertDescription>
                  </Alert>

                  <button
                    type="submit"
                    className={publicAuthCtaClassName}
                    disabled={isAccepting}
                  >
                    {isAccepting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        {t('acceptInvitationPage.creatingAccount')}
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-4 w-4 mr-2" />
                        {t('acceptInvitationPage.acceptAndCreate')}
                      </>
                    )}
                  </button>
                </form>
              </Form>
            </CardContent>
          </Card>
        )}

        <div className="text-center">
          <p className="text-xs text-muted-foreground">
            {t('hasAccount')}{' '}
            <button
              type="button"
              onClick={() =>
                navigate('/signin', {
                  state: { from: { pathname: `/invite/${token}` } },
                })
              }
              className="text-blue-600 hover:text-blue-500 font-medium"
            >
              {t('acceptInvitationPage.signInHere')}
            </button>
          </p>
        </div>
      </div>
    </PublicAuthShell>
  );
};

export default AcceptInvitation;

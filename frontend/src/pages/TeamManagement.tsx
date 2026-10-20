import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { toast } from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { 
  Users, 
  UserPlus, 
  Mail, 
  Shield, 
  Eye, 
  MoreHorizontal, 
  Send,
  Clock,
  CheckCircle,
  XCircle,
  RefreshCw,
  Trash2,
  ArrowLeft
} from 'lucide-react';

import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/Card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/Dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/Form';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Badge } from '@/components/ui/Badge';
import { Separator } from '@/components/ui/Separator';
import { Alert, AlertDescription } from '@/components/ui/Alert';
import api from '@/services/api';
import { useAuthStore } from '@/store/auth';

// Import User type from api
interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  full_name?: string;
  is_active: boolean;
  is_admin: boolean;
  organization_id: number;
  job_title?: string;
  organization_role: string;
}

// Types
interface TeamInvitation {
  id: number;
  email: string;
  first_name?: string;
  last_name?: string;
  role: 'manager' | 'member' | 'viewer';
  status: string;
  invited_by_name: string;
  organization_name: string;
  message?: string;
  created_at: string;
  expires_at: string;
}

// TeamMember type is now using User from api.ts

// Form schemas
const inviteSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  first_name: z.string().optional(),
  last_name: z.string().optional(),
  role: z.enum(['manager', 'member', 'viewer']),
  message: z.string().optional(),
});

type InviteFormData = z.infer<typeof inviteSchema>;

const EMPTY_TEAM_MEMBERS: User[] = [];
const EMPTY_INVITATIONS: TeamInvitation[] = [];

const TeamManagement: React.FC = () => {
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState<'members' | 'invitations'>('members');
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [existingUserEmail, setExistingUserEmail] = useState('');
  const [foundExistingUser, setFoundExistingUser] = useState<User | null>(null);
  const [isSearchingExisting, setIsSearchingExisting] = useState(false);

  const getErrorMessage = (error: any, fallback: string) => {
    const detail = error?.response?.data?.detail;
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
      return detail
        .map((entry: any) => {
          if (typeof entry === 'string') return entry;
          if (entry?.msg) return String(entry.msg);
          return null;
        })
        .filter(Boolean)
        .join(', ') || fallback;
    }
    if (detail && typeof detail === 'object') {
      if (typeof detail.msg === 'string') return detail.msg;
      return fallback;
    }
    return error?.message || fallback;
  };

  // Form setup
  const form = useForm<InviteFormData>({
    resolver: zodResolver(inviteSchema),
    defaultValues: {
      role: 'member',
      email: '',
      first_name: '',
      last_name: '',
      message: '',
    },
  });

  // Queries — no polling / focus refetch (avoids burst work when returning to the tab)
  const { data: teamMembersData, isLoading: isLoadingMembers, error: teamMembersError } = useQuery({
    queryKey: ['team-members'],
    queryFn: async () => {
      try {
        const response = await api.users.getOrganizationUsers();
        if (Array.isArray(response)) return response as User[];
        const wrapped = response as { data?: unknown };
        return Array.isArray(wrapped?.data) ? (wrapped.data as User[]) : [];
      } catch (error) {
        console.error('Error fetching organization users:', error);
        throw error;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const teamMembers = teamMembersData ?? EMPTY_TEAM_MEMBERS;

  const { data: invitationsData, isLoading: isLoadingInvitations } = useQuery({
    queryKey: ['team-invitations'],
    queryFn: async () => {
      const data = await api.teamInvitations.getInvitations();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const invitations = invitationsData ?? EMPTY_INVITATIONS;

  const { data: invitationStats } = useQuery({
    queryKey: ['invitation-stats'],
    queryFn: async () => api.teamInvitations.getStats(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const currentOrgId = user?.organization_id ? Number(user.organization_id) : null;
  const displayedTeamMembers = teamMembers;

  // Mutations
  const inviteMutation = useMutation({
    mutationFn: (data: InviteFormData) => api.teamInvitations.createInvitation(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['invitation-stats'] });
      setIsInviteDialogOpen(false);
      form.reset();
      toast.success('Team invitation sent successfully!');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Failed to send invitation'));
    },
  });

  const cancelInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => api.teamInvitations.cancelInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
      queryClient.invalidateQueries({ queryKey: ['invitation-stats'] });
      toast.success('Invitation cancelled successfully');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Failed to cancel invitation'));
    },
  });

  const resendInvitationMutation = useMutation({
    mutationFn: (invitationId: number) => api.teamInvitations.resendInvitation(invitationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-invitations'] });
      toast.success('Invitation resent successfully');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Failed to resend invitation'));
    },
  });

  const addExistingUserMutation = useMutation({
    mutationFn: async (candidate: User) => {
      if (!currentOrgId) throw new Error('No organization selected');
      return api.users.update(candidate.id, {
        organization_id: currentOrgId,
        email: candidate.email,
        first_name: candidate.first_name,
        last_name: candidate.last_name,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team-members'] });
      queryClient.invalidateQueries({ queryKey: ['assignable-users'] });
      setExistingUserEmail('');
      setFoundExistingUser(null);
      toast.success('Existing user added to your organization');
    },
    onError: (error: any) => {
      toast.error(getErrorMessage(error, 'Could not add existing user'));
    },
  });

  const searchExistingUser = async () => {
    const email = existingUserEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      toast.error('Enter a valid email address');
      return;
    }
    setIsSearchingExisting(true);
    setFoundExistingUser(null);
    try {
      const response = await api.users.searchPlatform(email);
      const candidate = (response as { data?: User })?.data ?? (response as unknown as User);
      if (!candidate?.id) {
        toast.error('No platform user found with that email');
        return;
      }
      setFoundExistingUser(candidate);
      toast.success(`Found ${candidate.first_name || ''} ${candidate.last_name || ''}`.trim() || candidate.email);
    } catch (error: any) {
      toast.error(getErrorMessage(error, 'No platform user found with that email'));
    } finally {
      setIsSearchingExisting(false);
    }
  };

  // Handlers
  const onSubmitInvite = async (data: InviteFormData) => {
    inviteMutation.mutate(data);
  };

  const handleCancelInvitation = (invitationId: number) => {
    if (window.confirm('Are you sure you want to cancel this invitation?')) {
      cancelInvitationMutation.mutate(invitationId);
    }
  };

  const handleResendInvitation = (invitationId: number) => {
    resendInvitationMutation.mutate(invitationId);
  };

  // Helper functions
  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return <Shield className="h-4 w-4" />;
      case 'manager':
        return <Users className="h-4 w-4" />;
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
      case 'manager':
        return 'bg-purple-100 text-purple-800';
      case 'member':
        return 'bg-blue-100 text-blue-800';
      case 'viewer':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getDisplayRole = (member: User) => {
    if (member.is_admin) {
      return 'Administrator';
    }
    switch (member.organization_role) {
      case 'manager':
        return 'Organization Manager';
      case 'member':
        return 'Member';
      case 'viewer':
        return 'Viewer';
      default:
        return 'Member';
    }
  };

  const getUserRoleForBadge = (member: User) => {
    if (member.is_admin) return 'admin';
    return member.organization_role;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'accepted':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'expired':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'cancelled':
        return <XCircle className="h-4 w-4 text-gray-500" />;
      default:
        return <Clock className="h-4 w-4 text-gray-500" />;
    }
  };

  const getStatusBadgeColor = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-yellow-100 text-yellow-800';
      case 'accepted':
        return 'bg-green-100 text-green-800';
      case 'expired':
        return 'bg-red-100 text-red-800';
      case 'cancelled':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" onClick={() => navigate('/organization')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Back to Organization
          </Button>
          <Separator orientation="vertical" className="h-6" />
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Team Management</h1>
            <p className="text-gray-600 mt-1">Manage your team members and invitations</p>
          </div>
        </div>
        <Dialog open={isInviteDialogOpen} onOpenChange={setIsInviteDialogOpen}>
          <DialogTrigger asChild>
            <Button className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Invite Team Member
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Invite Team Member</DialogTitle>
              <DialogDescription>
                Send an invitation to join your organization
              </DialogDescription>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitInvite)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address *</FormLabel>
                      <FormControl>
                        <Input placeholder="colleague@company.com" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                
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
                  name="role"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Role *</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select a role" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="manager">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Organization Manager
                            </div>
                          </SelectItem>
                          <SelectItem value="member">
                            <div className="flex items-center gap-2">
                              <Users className="h-4 w-4" />
                              Team Member
                            </div>
                          </SelectItem>
                          <SelectItem value="viewer">
                            <div className="flex items-center gap-2">
                              <Eye className="h-4 w-4" />
                              Viewer
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="message"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Personal Message (Optional)</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Add a personal message to the invitation..."
                          className="resize-none"
                          rows={3}
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="flex justify-end gap-3 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsInviteDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={inviteMutation.isPending}
                    className="flex items-center gap-2"
                  >
                    {inviteMutation.isPending ? (
                      <RefreshCw className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    Send Invitation
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      {/* Tabs */}
      <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button
          onClick={() => setSelectedTab('members')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            selectedTab === 'members'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Team Members ({displayedTeamMembers.length})
        </button>
        <button
          onClick={() => setSelectedTab('invitations')}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            selectedTab === 'invitations'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Invitations ({invitations.length})
        </button>
      </div>

      {/* Stats Cards */}
      {invitationStats && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Members</p>
                  <p className="text-2xl font-bold text-gray-900">{displayedTeamMembers.length}</p>
                </div>
                <Users className="h-8 w-8 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending Invites</p>
                  <p className="text-2xl font-bold text-yellow-600">{invitationStats.pending}</p>
                </div>
                <Clock className="h-8 w-8 text-yellow-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Accepted</p>
                  <p className="text-2xl font-bold text-green-600">{invitationStats.accepted}</p>
                </div>
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Invites</p>
                  <p className="text-2xl font-bold text-gray-900">{invitationStats.total}</p>
                </div>
                <Mail className="h-8 w-8 text-gray-500" />
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Content */}
      {selectedTab === 'members' && (
        <Card>
          <CardHeader>
            <CardTitle>Team Members</CardTitle>
            <CardDescription>
              Manage your organization's team members and their roles
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="mb-6 rounded-lg border p-4 bg-gray-50">
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Add Existing Platform User</h4>
              <p className="text-xs text-gray-600 mb-3">
                Look up an existing LeadLab account by email and move them into your organization.
              </p>
              <div className="flex flex-col md:flex-row gap-3">
                <Input
                  type="email"
                  placeholder="colleague@company.com"
                  value={existingUserEmail}
                  onChange={(e) => {
                    setExistingUserEmail(e.target.value);
                    setFoundExistingUser(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void searchExistingUser();
                    }
                  }}
                  className="md:w-[320px] bg-white"
                />
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void searchExistingUser()}
                  disabled={isSearchingExisting || !existingUserEmail.trim()}
                >
                  {isSearchingExisting ? 'Searching...' : 'Find User'}
                </Button>
                <Button
                  onClick={() => {
                    if (!foundExistingUser) {
                      toast.error('Find a user by email first');
                      return;
                    }
                    addExistingUserMutation.mutate(foundExistingUser);
                  }}
                  disabled={!foundExistingUser || addExistingUserMutation.isPending}
                >
                  {addExistingUserMutation.isPending ? 'Adding...' : 'Add to Team'}
                </Button>
              </div>
              {foundExistingUser && (
                <p className="mt-3 text-sm text-gray-700">
                  Ready to add:{' '}
                  <span className="font-medium">
                    {foundExistingUser.first_name} {foundExistingUser.last_name}
                  </span>{' '}
                  ({foundExistingUser.email})
                </p>
              )}
            </div>

            {isLoadingMembers ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : teamMembersError ? (
              <div className="text-center py-8">
                <XCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">Error loading team members</h3>
                <p className="text-red-600 mb-4">{teamMembersError.message}</p>
                <Button onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : displayedTeamMembers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No team members yet</h3>
                <p className="text-gray-600 mb-4">Start building your team by inviting members</p>
                <Button onClick={() => setIsInviteDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Invite First Member
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {displayedTeamMembers.map((member: User) => (
                  <div key={member.id} className="flex items-center justify-between p-4 border rounded-lg">
                    <div className="flex items-center space-x-4">
                      <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                        <span className="text-blue-600 font-medium">
                          {member.first_name?.[0] || member.full_name?.[0] || member.email[0].toUpperCase()}
                        </span>
                      </div>
                      <div>
                        <h4 className="font-medium text-gray-900">
                          {member.first_name && member.last_name 
                            ? `${member.first_name} ${member.last_name}`
                            : member.full_name || member.email
                          }
                        </h4>
                        <p className="text-sm text-gray-600">{member.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-3">
                      <Badge className={getRoleBadgeColor(getUserRoleForBadge(member))}>
                        <div className="flex items-center gap-1">
                          {getRoleIcon(getUserRoleForBadge(member))}
                          {getDisplayRole(member)}
                        </div>
                      </Badge>
                      <Badge variant={member.is_active ? 'default' : 'secondary'}>
                        {member.is_active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {selectedTab === 'invitations' && (
        <Card>
          <CardHeader>
            <CardTitle>Team Invitations</CardTitle>
            <CardDescription>
              Track and manage pending team invitations
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingInvitations ? (
              <div className="flex items-center justify-center py-8">
                <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
              </div>
            ) : invitations.length === 0 ? (
              <div className="text-center py-8">
                <Mail className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">No invitations sent</h3>
                <p className="text-gray-600 mb-4">Send your first team invitation to get started</p>
                <Button onClick={() => setIsInviteDialogOpen(true)}>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Send Invitation
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {invitations.map((invitation: TeamInvitation) => (
                  <div key={invitation.id} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-4">
                        <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <Mail className="h-5 w-5 text-gray-600" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-900">
                            {invitation.first_name && invitation.last_name 
                              ? `${invitation.first_name} ${invitation.last_name}`
                              : invitation.email
                            }
                          </h4>
                          <p className="text-sm text-gray-600">{invitation.email}</p>
                          <p className="text-xs text-gray-500">
                            Invited by {invitation.invited_by_name} • {formatDate(invitation.created_at)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-3">
                        <Badge className={getRoleBadgeColor(invitation.role)}>
                          <div className="flex items-center gap-1">
                            {getRoleIcon(invitation.role)}
                            {invitation.role.charAt(0).toUpperCase() + invitation.role.slice(1)}
                          </div>
                        </Badge>
                        <Badge className={getStatusBadgeColor(invitation.status)}>
                          <div className="flex items-center gap-1">
                            {getStatusIcon(invitation.status)}
                            {invitation.status.charAt(0).toUpperCase() + invitation.status.slice(1)}
                          </div>
                        </Badge>
                        {invitation.status === 'pending' && (
                          <div className="flex items-center space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleResendInvitation(invitation.id)}
                              disabled={resendInvitationMutation.isPending}
                            >
                              <RefreshCw className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCancelInvitation(invitation.id)}
                              disabled={cancelInvitationMutation.isPending}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                    {invitation.message && (
                      <>
                        <Separator className="my-3" />
                        <div className="bg-gray-50 p-3 rounded-md">
                          <p className="text-sm text-gray-700">
                            <strong>Message:</strong> {invitation.message}
                          </p>
                        </div>
                      </>
                    )}
                    {invitation.status === 'pending' && (
                      <>
                        <Separator className="my-3" />
                        <Alert>
                          <Clock className="h-4 w-4" />
                          <AlertDescription>
                            Expires on {formatDate(invitation.expires_at)}
                          </AlertDescription>
                        </Alert>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TeamManagement;
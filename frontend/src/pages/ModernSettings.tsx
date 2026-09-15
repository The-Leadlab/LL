/**
 * Modern Settings Page
 * Tab-based, clean, professional
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import {
  User,
  Bell,
  Building2,
  Lock,
  CreditCard,
  Users,
  Mail,
  Zap,
  Globe,
  CalendarDays,
  Palette,
  Database,
  Save,
  X,
  Loader2,
  MessageSquare,
  Map,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { updateProfile, uploadAvatar, changePassword } from '@/services/users';
import { useAuthStore } from '@/store/auth';
import api from '@/lib/axios';
import emailAPI from '@/services/emailAPI';
import { calendarIntegrationsAPI } from '@/services/calendarIntegrations';
import { UserAvatar, useCurrentUserAvatar } from '@/components/UserAvatar';

type Tab = 'profile' | 'notifications' | 'company' | 'security' | 'billing' | 'team' | 'integrations';

const tabs = [
  { id: 'profile' as Tab, name: 'Profile', icon: User },
  { id: 'notifications' as Tab, name: 'Notifications', icon: Bell },
  { id: 'company' as Tab, name: 'Company', icon: Building2 },
  { id: 'security' as Tab, name: 'Security', icon: Lock },
  { id: 'billing' as Tab, name: 'Billing', icon: CreditCard },
  { id: 'team' as Tab, name: 'Team', icon: Users },
  { id: 'integrations' as Tab, name: 'Integrations', icon: Zap },
];

export function ModernSettings() {
  const { tab } = useParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<Tab>('profile');

  const adminOnlyTabs = new Set<Tab>(['company', 'billing', 'team']);
  const visibleTabs = user?.is_admin
    ? tabs
    : tabs.filter((t) => !adminOnlyTabs.has(t.id));

  useEffect(() => {
    const allowedIds = new Set(visibleTabs.map((t) => t.id));
    if (tab && allowedIds.has(tab as Tab)) {
      setActiveTab(tab as Tab);
    }
  }, [tab, visibleTabs]);

  const goToTab = (id: Tab) => {
    setActiveTab(id);
    navigate(`/settings/${id}`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          Settings
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          Manage your account settings and preferences
        </p>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Sidebar Tabs */}
        <div className="col-span-3">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700 p-2">
            <nav className="space-y-1">
              {visibleTabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => goToTab(tab.id)}
                    className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg text-left transition-colors ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-700 dark:text-primary-400'
                        : 'text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="font-medium">{tab.name}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="col-span-9">
          <div className="bg-white dark:bg-neutral-800 rounded-xl shadow-sm border border-neutral-200 dark:border-neutral-700">
            {activeTab === 'profile' && <ProfileSettings />}
            {activeTab === 'notifications' && <NotificationSettings />}
            {activeTab === 'company' && <OrganizationSettings />}
            {activeTab === 'security' && <SecuritySettings />}
            {activeTab === 'billing' && <BillingSettings />}
            {activeTab === 'team' && <TeamSettings />}
            {activeTab === 'integrations' && <IntegrationsSettings />}
          </div>
        </div>
      </div>
    </div>
  );
}

function ProfileSettings() {
  const { user, fetchUser } = useAuthStore();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formState, setFormState] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    bio: ''
  });
  const avatarObjectUrl = useCurrentUserAvatar(user?.id, avatarVersion);

  useEffect(() => {
    if (!user) {
      fetchUser().catch(() => {
        toast.error('Failed to load user profile');
      });
    }
  }, [user, fetchUser]);

  useEffect(() => {
    if (user) {
      setFormState((prev) => ({
        ...prev,
        firstName: user.first_name || '',
        lastName: user.last_name || '',
        email: user.email || ''
      }));
    }
  }, [user]);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose an image file');
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error('Image must be 2MB or smaller');
      return;
    }
    setIsUploadingAvatar(true);
    try {
      await uploadAvatar(file);
      if (user?.id) {
        const reader = new FileReader();
        reader.onloadend = () => {
          if (typeof reader.result === 'string') {
            localStorage.setItem(`avatar-cache-${user.id}`, reader.result);
          }
        };
        reader.readAsDataURL(file);
      }
      setAvatarVersion((v) => v + 1);
      useAuthStore.getState().bumpAvatarRevision();
      toast.success('Photo updated');
    } catch (err: unknown) {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Failed to upload photo');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleChange = (field: keyof typeof formState, value: string) => {
    setFormState((prev) => ({
      ...prev,
      [field]: value
    }));
  };

  const handleCancel = () => {
    if (!user) {
      return;
    }
    setFormState((prev) => ({
      ...prev,
      firstName: user.first_name || '',
      lastName: user.last_name || '',
      email: user.email || '',
      phone: '',
      bio: ''
    }));
  };

  const handleSave = async () => {
    if (!user) {
      toast.error('User profile not loaded yet');
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({
        first_name: formState.firstName,
        last_name: formState.lastName,
        email: formState.email
      });
      await fetchUser();
      toast.success('Profile updated successfully');
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || 'Failed to update profile';
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Profile Settings
      </h2>

      <div className="space-y-6">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Profile Photo
          </label>
          <div className="flex items-center space-x-4">
            <UserAvatar
              user={user}
              photoUrl={avatarObjectUrl}
              className="w-20 h-20"
              textClassName="text-xl"
            />
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarFile}
              />
              <button
                type="button"
                disabled={isUploadingAvatar}
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white rounded-lg text-sm font-medium transition-colors inline-flex items-center gap-2"
              >
                {isUploadingAvatar && <Loader2 className="animate-spin w-4 h-4" />}
                Upload new photo
              </button>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                JPG, PNG, GIF or WebP. Max 2MB
              </p>
            </div>
          </div>
        </div>

        {/* Name Fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              First Name
            </label>
            <input
              type="text"
              value={formState.firstName}
              onChange={(event) => handleChange('firstName', event.target.value)}
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              Last Name
            </label>
            <input
              type="text"
              value={formState.lastName}
              onChange={(event) => handleChange('lastName', event.target.value)}
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Email Address
          </label>
          <input
            type="email"
            value={formState.email}
            onChange={(event) => handleChange('email', event.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Phone Number
          </label>
          <input
            type="tel"
            placeholder="+1 (555) 000-0000"
            value={formState.phone}
            onChange={(event) => handleChange('phone', event.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Bio */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Bio
          </label>
          <textarea
            rows={4}
            placeholder="Tell us about yourself..."
            value={formState.bio}
            onChange={(event) => handleChange('bio', event.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end space-x-3 pt-6 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrganizationSettings() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const orgId = user?.organization_id != null ? Number(user.organization_id) : null;
  const canEditOrg = Boolean(user?.is_admin);

  const { data: org, isLoading } = useQuery({
    queryKey: ['settings-organization', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const r = await api.get(`/organizations/${orgId}`);
      return r.data as {
        id: number;
        name: string;
        description?: string | null;
        website?: string | null;
      };
    },
  });

  const [name, setName] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');

  useEffect(() => {
    if (org) {
      setName(org.name || '');
      setWebsite(org.website || '');
      setDescription(org.description || '');
    }
  }, [org]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const fd = new FormData();
      fd.append('name', name);
      fd.append('description', description);
      fd.append('website', website);
      await api.patch(`/organizations/${orgId}`, fd);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-organization', orgId] });
      toast.success('Organization updated');
    },
    onError: (err: unknown) => {
      const d =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      toast.error(typeof d === 'string' ? d : 'Could not save organization');
    },
  });

  if (!orgId) {
    return (
      <div className="p-8">
        <p className="text-neutral-600 dark:text-neutral-400">Sign in to manage your organization.</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-neutral-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading organization…
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Organization Settings
      </h2>

      {!canEditOrg && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4">
          Only organization administrators can change these fields. You can still view them.
        </p>
      )}

      <div className="mb-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 p-2">
            <Map className="h-5 w-5 text-primary-700 dark:text-primary-300" aria-hidden />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">Territories</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Sales territories and coverage live alongside organization settings.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings/territories')}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          Open territories
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Company Name
          </label>
          <input
            type="text"
            value={name}
            disabled={!canEditOrg}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-70"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Website
          </label>
          <input
            type="url"
            placeholder="https://your-company.com"
            value={website}
            disabled={!canEditOrg}
            onChange={(e) => setWebsite(e.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-70"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            Description
          </label>
          <textarea
            rows={3}
            value={description}
            disabled={!canEditOrg}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-70"
          />
        </div>

        {canEditOrg && (
          <div className="flex items-center justify-end space-x-3 pt-6 border-t border-neutral-200 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => {
                if (org) {
                  setName(org.name || '');
                  setWebsite(org.website || '');
                  setDescription(org.description || '');
                }
              }}
              className="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>Save Changes</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function NotificationSettings() {
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const r = await api.get('/notifications', { params: { limit: 20 } });
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const createTestMutation = useMutation({
    mutationFn: async () => api.post('/notifications/test'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  const markAllMutation = useMutation({
    mutationFn: async () => api.put('/notifications/read-all'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications'] }),
  });

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Notification Preferences
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">Manage and review your in-app notifications.</p>

      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => createTestMutation.mutate()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg"
          >
            Create test notification
          </button>
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            className="px-4 py-2 border rounded-lg"
          >
            Mark all read
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-neutral-600">Loading notifications...</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-neutral-600">No notifications yet.</p>
        ) : (
          notifications.map((item: any) => (
            <div key={item.id} className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
              <div className="font-medium text-neutral-900 dark:text-neutral-50">{item.title}</div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{item.message}</p>
              <p className="text-xs text-neutral-500 mt-2">
                {item.is_read ? 'Read' : 'Unread'} • {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SecuritySettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('New password and confirmation do not match');
      return;
    }
    if (newPassword.length < 8) {
      toast.error('New password must be at least 8 characters');
      return;
    }
    setSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success('Password updated');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : 'Could not update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Security Settings
      </h2>

      <div className="space-y-6">
        <form onSubmit={handleChangePassword}>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            Change Password
          </h3>
          <div className="space-y-4 max-w-md">
            <input
              type="password"
              placeholder="Current password"
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              placeholder="New password"
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
            />
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60 inline-flex items-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Update Password
            </button>
          </div>
        </form>

        <div className="pt-6 border-t border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            Two-Factor Authentication
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            Two-factor authentication is not available in this release. Use a strong password above.
          </p>
        </div>
      </div>
    </div>
  );
}

function BillingSettings() {
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Billing & Subscription
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Live billing is handled outside this screen (e.g. Stripe). Use the Credits or subscription flows from the product menu when available.
      </p>

      <div className="space-y-6">
        <div className="p-6 bg-gradient-to-r from-primary-50 to-purple-50 dark:from-primary-900/20 dark:to-purple-900/20 border border-primary-200 dark:border-primary-800 rounded-xl">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-neutral-50">
                Enterprise Plan
              </h3>
              <p className="text-neutral-600 dark:text-neutral-400">
                $99/month • Billed annually
              </p>
            </div>
            <span className="px-4 py-2 bg-primary-600 text-white rounded-lg font-medium">
              Active
            </span>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Next billing date: January 15, 2025
          </p>
          <button className="px-4 py-2 bg-white dark:bg-neutral-800 hover:bg-neutral-50 dark:hover:bg-neutral-700 text-neutral-900 dark:text-neutral-50 rounded-lg font-medium transition-colors border border-neutral-200 dark:border-neutral-700">
            Manage Subscription
          </button>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            Payment Method
          </h3>
          <div className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
            <div className="flex items-center space-x-3">
              <CreditCard className="w-8 h-8 text-neutral-600 dark:text-neutral-400" />
              <div>
                <p className="font-medium text-neutral-900 dark:text-neutral-50">
                  •••• •••• •••• 4242
                </p>
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Expires 12/2025
                </p>
              </div>
            </div>
            <button className="text-primary-600 hover:text-primary-700 font-medium">
              Update
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

type OrgMemberRow = {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  is_admin?: boolean;
  organization_role?: string;
};

function TeamSettings() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data: members = [], isLoading, error } = useQuery({
    queryKey: ['organization-users-settings'],
    queryFn: async () => {
      const r = await api.get<OrgMemberRow[]>('/users/organization-users');
      return r.data;
    },
  });

  const roleLabel = (m: OrgMemberRow) => {
    if (m.is_admin) return 'Admin';
    const r = (m.organization_role || 'member').toLowerCase();
    if (r === 'manager') return 'Manager';
    if (r === 'viewer') return 'Viewer';
    return 'Member';
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          Team Members
        </h2>
        <button
          type="button"
          onClick={() => navigate('/team-management')}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
        >
          Invite / manage users
        </button>
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 max-w-2xl">
        This list matches your organization directory: the same people appear in Team management, task
        assignees, and Messages when you start a new conversation (everyone except you).
        Use <span className="font-medium text-neutral-800 dark:text-neutral-200">Invite / manage users</span> to
        invite or move members.
        {user?.is_admin ? (
          <>
            {' '}
            As an admin, you can also open the{' '}
            <button
              type="button"
              className="text-primary-600 hover:text-primary-700 font-medium underline-offset-2 hover:underline"
              onClick={() => navigate('/admin')}
            >
              Admin panel
            </button>
            {' '}
            for broader user management.
          </>
        ) : null}
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-neutral-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          Loading team…
        </div>
      )}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">Could not load team list. Try again later.</p>
      )}

      {!isLoading && !error && (
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">No team members found.</p>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg"
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-500 to-primary-700 rounded-full flex items-center justify-center">
                    <User className="w-5 h-5 text-white" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-neutral-50">
                      {`${member.first_name || ''} ${member.last_name || ''}`.trim() || member.email}
                    </p>
                    <p className="text-sm text-neutral-600 dark:text-neutral-400">{member.email}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-3">
                  <span className="px-3 py-1 bg-neutral-100 dark:bg-neutral-700 text-neutral-700 dark:text-neutral-300 rounded-full text-sm">
                    {roleLabel(member)}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

type IntegrationTile = {
  id: string;
  name: string;
  icon: typeof Mail;
  /** Shown status — informational; live status comes from your connected accounts / CRM import */
  connected: boolean;
  connectPath?: string;
  disconnectHint?: string;
};

function EmailIntegrationPanel() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'yahoo' | 'custom'>('custom');
  const [emailAddr, setEmailAddr] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [imapHost, setImapHost] = useState('');
  const [imapPort, setImapPort] = useState(993);
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(587);

  const { data: mailAccounts = [], isLoading } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const connectMutation = useMutation({
    mutationFn: () =>
      emailAPI.createAccount({
        email: emailAddr.trim(),
        password,
        display_name: displayName.trim() || undefined,
        provider_type: provider,
        imap_server: provider === 'custom' ? imapHost.trim() : undefined,
        imap_port: provider === 'custom' ? imapPort : undefined,
        smtp_server: provider === 'custom' ? smtpHost.trim() : undefined,
        smtp_port: provider === 'custom' ? smtpPort : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-accounts'] });
      setPassword('');
      toast.success('Mailbox connected. Inbox sync runs in the background.');
    },
    onError: (err: unknown) => {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      const msg =
        typeof detail === 'string'
          ? detail
          : detail && typeof detail === 'object' && detail !== null && 'message' in detail
            ? String((detail as { message?: string }).message)
            : 'Could not connect mailbox. Check address, app password, and provider.';
      toast.error(msg);
    },
  });

  const connectGoogleOAuthMutation = useMutation({
    mutationFn: () => emailAPI.initGoogleOAuth(),
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (err: unknown) => {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Could not start Gmail OAuth.';
      toast.error(msg);
    },
  });

  const canSubmit =
    emailAddr.trim().length > 0 &&
    password.length > 0 &&
    (provider !== 'custom' || (imapHost.trim() && smtpHost.trim()));

  return (
    <div className="mb-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-6">
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">Email (IMAP / SMTP)</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        Connect your mailbox to send outreach and sync your inbox. Use <span className="font-medium">Custom SMTP / IMAP</span> for
        providers like Infomaniak, OVH, or any standard mail server. Gmail users can connect via OAuth below, or use
        an <span className="font-medium">App Password</span> (Google Account → Security → 2-Step Verification → App passwords).
      </p>

      {isLoading ? (
        <p className="text-sm text-neutral-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading accounts…
        </p>
      ) : mailAccounts.length > 0 ? (
        <ul className="mb-4 space-y-2 text-sm">
          {mailAccounts.map((a) => (
            <li
              key={a.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-neutral-200 dark:border-neutral-600 px-3 py-2"
            >
              <span className="font-medium text-neutral-800 dark:text-neutral-100">{a.email}</span>
              <span className="text-neutral-500">{a.provider_type}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-neutral-500 mb-4">No mailbox connected yet.</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Provider</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="custom">Custom SMTP / IMAP (Infomaniak, OVH, etc.)</option>
            <option value="gmail">Gmail (IMAP)</option>
            <option value="outlook">Outlook / Microsoft 365</option>
            <option value="yahoo">Yahoo</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Display name</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Shown as sender name"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Email address</label>
          <input
            type="email"
            value={emailAddr}
            onChange={(e) => setEmailAddr(e.target.value)}
            autoComplete="username"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">Password / app password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
            required
          />
        </div>
      </div>

      {provider === 'custom' && (
        <div className="mt-4 space-y-4">
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            For Infomaniak: IMAP mail.infomaniak.com:993, SMTP mail.infomaniak.com:587 (STARTTLS).
            Use your full email address as username.
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">IMAP host</label>
              <input
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="mail.infomaniak.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">IMAP port</label>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="993"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">SMTP host</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="mail.infomaniak.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">SMTP port</label>
              <input
                type="number"
                value={smtpPort}
                onChange={(e) => setSmtpPort(Number(e.target.value) || 587)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="587"
              />
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={connectGoogleOAuthMutation.isPending}
          onClick={() => connectGoogleOAuthMutation.mutate()}
          className="rounded-lg bg-red-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          {connectGoogleOAuthMutation.isPending ? 'Redirecting…' : 'Connect Gmail with Google'}
        </button>
        <button
          type="button"
          disabled={!canSubmit || connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
          className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {connectMutation.isPending ? 'Connecting…' : 'Connect mailbox'}
        </button>
        <button
          type="button"
          onClick={() => navigate('/emails')}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          Open Inbox
        </button>
      </div>
    </div>
  );
}

function IntegrationsSettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailOauth = params.get('email_oauth');
    const calendarOauth = params.get('calendar_oauth');
    if (emailOauth === 'success') toast.success('Gmail connected successfully. Your inbox can now sync.');
    if (emailOauth === 'error') toast.error(`Gmail connect failed: ${params.get('reason') || 'unknown_error'}`);
    if (calendarOauth === 'success') toast.success('Google Calendar connected successfully.');
    if (calendarOauth === 'error') toast.error(`Calendar connect failed: ${params.get('reason') || 'unknown_error'}`);
    if (emailOauth || calendarOauth) {
      const cleanUrl = `${window.location.pathname}${window.location.hash || ''}`;
      window.history.replaceState({}, '', cleanUrl);
    }
  }, []);
  const { data: calendarIntegrations = [], isLoading: isLoadingCalendar } = useQuery({
    queryKey: ['calendar-integrations'],
    queryFn: calendarIntegrationsAPI.list,
  });
  const { data: emailAccounts = [] } = useQuery({
    queryKey: ['email-accounts'],
    queryFn: emailAPI.getAccounts,
  });

  const googleIntegrations = calendarIntegrations.filter((i) => i.provider?.toLowerCase() === 'google');
  const googleIntegration = googleIntegrations[0];
  const hasGoogleEmailOAuth = emailAccounts.some(
    (a: any) => String(a.provider_type || '').toLowerCase() === 'gmail' && String(a.auth_type || '').toLowerCase() === 'oauth'
  );
  const hasGoogleCalendar = googleIntegrations.length > 0;
  const connectedViaGoogleSignIn = hasGoogleEmailOAuth && hasGoogleCalendar;

  const connectGoogleMutation = useMutation({
    mutationFn: () => calendarIntegrationsAPI.initOAuth('google'),
    onSuccess: (data) => {
      window.location.href = data.authorization_url;
    },
    onError: (err: unknown) => {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      const msg = typeof detail === 'string' ? detail : 'Could not start Google Calendar OAuth flow.';
      toast.error(msg);
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: (integrationId: number) => calendarIntegrationsAPI.disconnect(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
      toast.success('Google Calendar disconnected');
    },
    onError: () => toast.error('Could not disconnect Google Calendar'),
  });

  const syncGoogleMutation = useMutation({
    mutationFn: (integrationId: number) => calendarIntegrationsAPI.sync(integrationId),
    onSuccess: () => toast.success('Calendar sync queued'),
    onError: () => toast.error('Could not queue calendar sync'),
  });

  const tiles: IntegrationTile[] = [
    {
      id: 'salesforce',
      name: 'Salesforce',
      icon: Database,
      connected: false,
      connectPath: '/data-import/wizard',
    },
    {
      id: 'hubspot',
      name: 'HubSpot',
      icon: Mail,
      connected: false,
      connectPath: '/data-import/wizard',
    },
    {
      id: 'slack',
      name: 'Slack',
      icon: MessageSquare,
      connected: false,
      disconnectHint: 'Slack workspace linking is not enabled for this environment yet.',
    },
  ];

  const handlePrimary = (tile: IntegrationTile) => {
    if (tile.connected) {
      toast(tile.disconnectHint || 'Disconnect is not available for this integration yet.');
      return;
    }
    if (tile.connectPath) {
      navigate(tile.connectPath);
      return;
    }
    toast('This integration is not available yet.');
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        Integrations
      </h2>
      {connectedViaGoogleSignIn && (
        <div className="mb-4 inline-flex items-center rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
          Connected via Google Sign-In
        </div>
      )}
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        Connect email below. HubSpot and Salesforce use the Data Import wizard (CSV and CRM sources). Other connectors
        are placeholders until enabled for your org.
      </p>

      <EmailIntegrationPanel />

      <h3 className="text-md font-semibold text-neutral-900 dark:text-neutral-50 mb-3">Calendar</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="p-6 border border-neutral-200 dark:border-neutral-700 rounded-lg">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
              <CalendarDays className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">Google Calendar</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {isLoadingCalendar
                  ? 'Loading...'
                  : googleIntegration
                    ? `Connected${googleIntegration.provider_account_email ? ` as ${googleIntegration.provider_account_email}` : ''}`
                    : 'Not connected'}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Two-way sync foundation is now enabled. OAuth callback + webhook sync is the next milestone.
          </p>
          {googleIntegration ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={connectGoogleMutation.isPending}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => connectGoogleMutation.mutate()}
              >
                {connectGoogleMutation.isPending ? 'Redirecting…' : 'Add another calendar'}
              </button>
              <button
                type="button"
                disabled={syncGoogleMutation.isPending}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => syncGoogleMutation.mutate(googleIntegration.id)}
              >
                {syncGoogleMutation.isPending ? 'Syncing…' : 'Sync now'}
              </button>
              <button
                type="button"
                disabled={disconnectGoogleMutation.isPending}
                className="rounded-lg border border-red-300 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                onClick={() => disconnectGoogleMutation.mutate(googleIntegration.id)}
              >
                Disconnect
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={connectGoogleMutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={() => connectGoogleMutation.mutate()}
            >
              {connectGoogleMutation.isPending ? 'Redirecting…' : 'Connect Google Calendar'}
            </button>
          )}
          {googleIntegrations.length > 1 && (
            <div className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
              Connected calendars:
              <ul className="mt-1 list-disc pl-4">
                {googleIntegrations.map((integration) => (
                  <li key={integration.id}>{integration.provider_account_email || `Google account #${integration.id}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-6 border border-neutral-200 dark:border-neutral-700 rounded-lg">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
              <Globe className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">Other Calendars</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">Outlook, Apple, CalDAV</p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            Provider adapters are planned next. Google is the first production connector.
          </p>
          <span className="inline-flex rounded-full bg-neutral-100 dark:bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            Coming next
          </span>
        </div>
      </div>

      <h3 className="text-md font-semibold text-neutral-900 dark:text-neutral-50 mb-3">CRM &amp; messaging</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {tiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <div key={tile.id} className="p-6 border border-neutral-200 dark:border-neutral-700 rounded-lg">
              <div className="flex items-center space-x-3 mb-4">
                <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
                  <Icon className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
                </div>
                <div>
                  <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">
                    {tile.name}
                  </h3>
                  <p className="text-sm text-neutral-600 dark:text-neutral-400">
                    {tile.connected ? 'Connected' : 'Not connected'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handlePrimary(tile)}
                className={`w-full px-4 py-2 rounded-lg font-medium transition-colors ${
                  tile.connected
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30'
                    : 'bg-primary-600 hover:bg-primary-700 text-white'
                }`}
              >
                {tile.connected ? 'Disconnect' : 'Connect'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

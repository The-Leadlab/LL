/**
 * Modern Settings Page
 * Tab-based, clean, professional
 */

import React, { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
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
import { useTranslation } from 'react-i18next';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';
import { applyLanguageFromSettings } from '@/i18n/setAppLanguage';
import { getUserSettings, updateUserSettings } from '@/services/settings';
import { updateProfile, uploadAvatar, changePassword } from '@/services/users';
import { useAuthStore } from '@/store/auth';
import { requestProductTour } from '@/lib/productTour';
import api from '@/lib/axios';
import emailAPI from '@/services/emailAPI';
import { calendarIntegrationsAPI } from '@/services/calendarIntegrations';
import { UserAvatar, useCurrentUserAvatar } from '@/components/UserAvatar';

type Tab = 'profile' | 'notifications' | 'company' | 'security' | 'billing' | 'team' | 'integrations';

const tabs = [
  { id: 'profile' as Tab, labelKey: 'profile', icon: User },
  { id: 'notifications' as Tab, labelKey: 'notifications', icon: Bell },
  { id: 'company' as Tab, labelKey: 'company', icon: Building2 },
  { id: 'security' as Tab, labelKey: 'security', icon: Lock },
  { id: 'billing' as Tab, labelKey: 'billing', icon: CreditCard },
  { id: 'team' as Tab, labelKey: 'team', icon: Users },
  { id: 'integrations' as Tab, labelKey: 'integrations', icon: Zap },
];

const TAB_IDS = new Set(tabs.map((tabItem) => tabItem.id));

function tabFromPath(pathname: string, param?: string): Tab {
  const fromParam = param && TAB_IDS.has(param as Tab) ? (param as Tab) : null;
  if (fromParam) return fromParam;
  const segment = pathname.replace(/^\/settings\/?/, '').split('/')[0];
  return TAB_IDS.has(segment as Tab) ? (segment as Tab) : 'profile';
}

export function ModernSettings() {
  const { t } = useTranslation('settings');
  const { tab } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const adminOnlyTabs = new Set<Tab>(['company', 'billing', 'team']);
  const visibleTabs = user?.is_admin
    ? tabs
    : tabs.filter((tabItem) => !adminOnlyTabs.has(tabItem.id));

  const allowedIds = new Set(visibleTabs.map((tabItem) => tabItem.id));
  const requestedTab = tabFromPath(location.pathname, tab);
  const activeTab = allowedIds.has(requestedTab) ? requestedTab : 'profile';

  const goToTab = (id: Tab) => {
    navigate(`/settings/${id}`);
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-4 sm:p-8 overflow-x-hidden">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          {t('title')}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {t('subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 min-w-0">
        {/* Sidebar Tabs */}
        <div className="md:col-span-3 min-w-0">
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
                    <span className="font-medium truncate">{t(tab.labelKey)}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </div>

        {/* Content Area */}
        <div className="md:col-span-9 min-w-0">
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
  const { t } = useTranslation('settings');
  const { t: tm } = useTranslation('modules');
  const { t: tt } = useTranslation('tour');
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
        toast.error(tm('settingsPage.profile.loadFailed'));
      });
    }
  }, [user, fetchUser]);

  useEffect(() => {
    let cancelled = false;
    getUserSettings()
      .then((settings: { language?: string } | undefined) => {
        if (cancelled) return;
        const lang = settings?.language;
        if (lang === 'en' || lang === 'fr') {
          void applyLanguageFromSettings(lang);
        }
      })
      .catch(() => {
        // Non-fatal: keep current UI language
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
      toast.error(tm('settingsPage.profile.chooseImage'));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(tm('settingsPage.profile.imageTooLarge'));
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
      toast.success(tm('settingsPage.profile.photoUpdated'));
    } catch (err: unknown) {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : tm('settingsPage.profile.photoFailed'));
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
      toast.error(tm('settingsPage.profile.notLoaded'));
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
      toast.success(tm('settingsPage.profile.saved'));
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || tm('settingsPage.profile.saveFailed');
      toast.error(message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 min-w-0">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {tm('settingsPage.profile.title')}
      </h2>

      <div className="space-y-6">
        {/* Avatar */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {tm('settingsPage.profile.photo')}
          </label>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 min-w-0">
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
                {tm('settingsPage.profile.uploadPhoto')}
              </button>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
                {tm('settingsPage.profile.photoHint')}
              </p>
            </div>
          </div>
        </div>

        {/* Name Fields */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 min-w-0">
          <div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
              {tm('settingsPage.profile.firstName')}
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
              {tm('settingsPage.profile.lastName')}
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
            {tm('settingsPage.profile.email')}
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
            {tm('settingsPage.profile.phone')}
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
            {tm('settingsPage.profile.bio')}
          </label>
          <textarea
            rows={4}
            placeholder={tm('settingsPage.profile.bioPlaceholder')}
            value={formState.bio}
            onChange={(event) => handleChange('bio', event.target.value)}
            className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>

        {/* Language */}
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {t('language')}
          </label>
          <LanguageSwitcher size="md" />
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-2">
            {t('languageHint')}
          </p>
        </div>

        {/* Product tour */}
        <div>
          <button
            type="button"
            onClick={() => requestProductTour({ force: true })}
            className="text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            {tt('retake')}
          </button>
          <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1">
            {tt('retakeHint')}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-3 pt-6 border-t border-neutral-200 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleCancel}
            className="px-4 py-2 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 rounded-lg font-medium transition-colors"
          >
            {t('common:cancel')}
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-70 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? tm('settingsPage.profile.saving') : tm('settingsPage.profile.saveChanges')}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function OrganizationSettings() {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const orgId = user?.organization_id != null ? Number(user.organization_id) : null;
  const canEditOrg = Boolean(user?.is_admin);

  const { data: org, isLoading, isError } = useQuery({
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
      toast.success(t('settingsPage.company.updated'));
    },
    onError: (err: unknown) => {
      const d =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: unknown } } }).response?.data?.detail;
      toast.error(typeof d === 'string' ? d : t('settingsPage.company.saveFailed'));
    },
  });

  if (!orgId) {
    return (
      <div className="p-8">
        <p className="text-neutral-600 dark:text-neutral-400">{t('settingsPage.company.signInRequired')}</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="p-8 flex items-center gap-2 text-neutral-600">
        <Loader2 className="h-5 w-5 animate-spin" />
        {t('settingsPage.company.loading')}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="p-8 text-neutral-600 dark:text-neutral-300">
        {t('settingsPage.company.loadFailed')}
      </div>
    );
  }

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {t('settingsPage.company.title')}
      </h2>

      {!canEditOrg && (
        <p className="text-sm text-amber-800 dark:text-amber-200 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900 rounded-lg p-3 mb-4">
          {t('settingsPage.company.adminOnly')}
        </p>
      )}

      <div className="mb-6 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50/80 dark:bg-neutral-900/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-lg bg-primary-100 dark:bg-primary-900/30 p-2">
            <Map className="h-5 w-5 text-primary-700 dark:text-primary-300" aria-hidden />
          </div>
          <div>
            <h3 className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settingsPage.company.territories')}</h3>
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              {t('settingsPage.company.territoriesHint')}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => navigate('/settings/territories')}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-800 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-700"
        >
          {t('settingsPage.company.openTerritories')}
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-2">
            {t('settingsPage.company.name')}
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
            {t('settingsPage.company.website')}
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
            {t('settingsPage.company.description')}
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
              {t('common:cancel')}
            </button>
            <button
              type="button"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors disabled:opacity-60"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{t('settingsPage.company.saveChanges')}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const NOTIFICATION_PREF_KEYS = [
  'leadAssigned',
  'dealUpdated',
  'taskAssigned',
  'taskDue',
  'messages',
  'mentions',
  'meetingReminder',
  'systemUpdates',
] as const;

type NotificationPrefKey = (typeof NOTIFICATION_PREF_KEYS)[number];

const DEFAULT_NOTIFICATION_PREFS: Record<NotificationPrefKey, boolean> = {
  leadAssigned: true,
  dealUpdated: true,
  taskAssigned: true,
  taskDue: true,
  messages: true,
  mentions: true,
  meetingReminder: true,
  systemUpdates: false,
};

function NotificationSettings() {
  const { t } = useTranslation('modules');
  const { t: tSettings } = useTranslation('settings');
  const queryClient = useQueryClient();
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const r = await api.get('/notifications', { params: { limit: 20 } });
      return Array.isArray(r.data) ? r.data : [];
    },
  });

  const { data: userSettings } = useQuery({
    queryKey: ['user-settings'],
    queryFn: getUserSettings,
  });

  const [prefs, setPrefs] = useState<Record<NotificationPrefKey, boolean>>(DEFAULT_NOTIFICATION_PREFS);

  useEffect(() => {
    const saved = userSettings?.notification_preferences;
    if (!saved) return;
    setPrefs((prev) => {
      const next = { ...prev };
      for (const key of NOTIFICATION_PREF_KEYS) {
        if (typeof saved[key] === 'boolean') {
          next[key] = saved[key];
        }
      }
      return next;
    });
  }, [userSettings]);

  const savePrefsMutation = useMutation({
    mutationFn: async (next: Record<NotificationPrefKey, boolean>) =>
      updateUserSettings({
        notification_preferences: {
          ...(userSettings?.notification_preferences || {}),
          ...next,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-settings'] });
      toast.success(t('settingsPage.notifications.prefsSaved'));
    },
    onError: () => toast.error(t('settingsPage.notifications.prefsSaveFailed')),
  });

  const togglePref = (key: NotificationPrefKey) => {
    const next = { ...prefs, [key]: !prefs[key] };
    setPrefs(next);
    savePrefsMutation.mutate(next);
  };

  const createTestMutation = useMutation({
    mutationFn: async () => api.post('/notifications/test'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  const markAllMutation = useMutation({
    mutationFn: async () => api.put('/notifications/read-all'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
    },
  });

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {t('settingsPage.notifications.title')}
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">{t('settingsPage.notifications.subtitle')}</p>

      <div className="space-y-4">
        <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
            {t('settingsPage.notifications.prefsTitle')}
          </h3>
          {NOTIFICATION_PREF_KEYS.map((key) => (
            <label
              key={key}
              className="flex items-center justify-between gap-4 text-sm text-neutral-700 dark:text-neutral-300"
            >
              <span>{tSettings(key)}</span>
              <button
                type="button"
                role="switch"
                aria-checked={prefs[key]}
                onClick={() => togglePref(key)}
                className={`relative h-6 w-11 rounded-full transition-colors ${
                  prefs[key] ? 'bg-primary-600' : 'bg-neutral-300 dark:bg-neutral-600'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
                    prefs[key] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </label>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => createTestMutation.mutate()}
            className="px-4 py-2 bg-primary-600 text-white rounded-lg"
          >
            {t('settingsPage.notifications.createTest')}
          </button>
          <button
            type="button"
            onClick={() => markAllMutation.mutate()}
            className="px-4 py-2 border rounded-lg"
          >
            {t('settingsPage.notifications.markAllRead')}
          </button>
        </div>

        {isLoading ? (
          <p className="text-sm text-neutral-600">{t('settingsPage.notifications.loading')}</p>
        ) : notifications.length === 0 ? (
          <p className="text-sm text-neutral-600">{t('settingsPage.notifications.empty')}</p>
        ) : (
          notifications.map((item: any) => (
            <div key={item.id} className="p-4 border border-neutral-200 dark:border-neutral-700 rounded-lg">
              <div className="font-medium text-neutral-900 dark:text-neutral-50">{item.title}</div>
              <p className="text-sm text-neutral-600 dark:text-neutral-400 mt-1">{item.message}</p>
              <p className="text-xs text-neutral-500 mt-2">
                {item.is_read ? t('settingsPage.notifications.read') : t('settingsPage.notifications.unread')} • {new Date(item.created_at).toLocaleString()}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SecuritySettings() {
  const { t } = useTranslation('modules');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error(t('settingsPage.security.mismatch'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(t('settingsPage.security.tooShort'));
      return;
    }
    setSaving(true);
    try {
      await changePassword({
        current_password: currentPassword,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      toast.success(t('settingsPage.security.updated'));
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: unknown) {
      const detail =
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: { detail?: string } } }).response?.data?.detail;
      toast.error(typeof detail === 'string' ? detail : t('settingsPage.security.updateFailed'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {t('settingsPage.security.title')}
      </h2>

      <div className="space-y-6">
        <form onSubmit={handleChangePassword}>
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            {t('settingsPage.security.changePassword')}
          </h3>
          <div className="space-y-4 max-w-md">
            <input
              type="password"
              placeholder={t('settingsPage.security.currentPassword')}
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
            />
            <input
              type="password"
              placeholder={t('settingsPage.security.newPassword')}
              className="w-full px-4 py-2.5 bg-neutral-50 dark:bg-neutral-700 border border-neutral-200 dark:border-neutral-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
            />
            <input
              type="password"
              placeholder={t('settingsPage.security.confirmPassword')}
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
              {t('settingsPage.security.update')}
            </button>
          </div>
        </form>

        <div className="pt-6 border-t border-neutral-200 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            {t('settingsPage.security.twoFactor')}
          </h3>
          <p className="text-neutral-600 dark:text-neutral-400 mb-4">
            {t('settingsPage.security.twoFactorUnavailable')}
          </p>
        </div>
      </div>
    </div>
  );
}

function BillingSettings() {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();
  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {t('settingsPage.billing.title')}
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        {t('settingsPage.billing.body')}
      </p>
      <button
        type="button"
        onClick={() => navigate('/credits')}
        className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium"
      >
        {t('settingsPage.billing.openCredits')}
      </button>
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
  const { t } = useTranslation('modules');
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
    if (m.is_admin) return t('settingsPage.team.roleAdmin');
    const r = (m.organization_role || 'member').toLowerCase();
    if (r === 'manager') return t('settingsPage.team.roleManager');
    if (r === 'viewer') return t('settingsPage.team.roleViewer');
    return t('settingsPage.team.roleMember');
  };

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
          {t('settingsPage.team.title')}
        </h2>
        <button
          type="button"
          onClick={() => navigate('/team-management')}
          className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-medium transition-colors"
        >
          {t('settingsPage.team.manageUsers')}
        </button>
      </div>

      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4 max-w-2xl">
        {t('settingsPage.team.intro')}{' '}
        <span className="font-medium text-neutral-800 dark:text-neutral-200">{t('settingsPage.team.manageUsers')}</span>{' '}
        {t('settingsPage.team.introAfter')}
        {user?.is_admin ? (
          <>
            {' '}
            {t('settingsPage.team.adminPrefix')}{' '}
            <button
              type="button"
              className="text-primary-600 hover:text-primary-700 font-medium underline-offset-2 hover:underline"
              onClick={() => navigate('/admin')}
            >
              {t('settingsPage.team.adminPanel')}
            </button>
            {' '}
            {t('settingsPage.team.adminSuffix')}
          </>
        ) : null}
      </p>

      {isLoading && (
        <div className="flex items-center gap-2 text-neutral-600">
          <Loader2 className="h-5 w-5 animate-spin" />
          {t('settingsPage.team.loading')}
        </div>
      )}
      {error && (
        <p className="text-red-600 dark:text-red-400 text-sm">{t('settingsPage.team.loadFailed')}</p>
      )}

      {!isLoading && !error && (
        <div className="space-y-3">
          {members.length === 0 ? (
            <p className="text-neutral-600 dark:text-neutral-400">{t('settingsPage.team.empty')}</p>
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
  const { t } = useTranslation('modules');
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
      toast.success(t('settingsPage.integrations.email.connected'));
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
            : t('settingsPage.integrations.email.connectFailed');
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
      const msg = typeof detail === 'string' ? detail : t('settingsPage.integrations.email.gmailOAuthFailed');
      toast.error(msg);
    },
  });

  const canSubmit =
    emailAddr.trim().length > 0 &&
    password.length > 0 &&
    (provider !== 'custom' || (imapHost.trim() && smtpHost.trim()));

  return (
    <div className="mb-10 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800/50 p-6">
      <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-1">{t('settingsPage.integrations.email.title')}</h3>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
        {t('settingsPage.integrations.email.intro')} <span className="font-medium">{t('settingsPage.integrations.email.customBold')}</span>{' '}
        {t('settingsPage.integrations.email.intro2')}{' '}
        <span className="font-medium">{t('settingsPage.integrations.email.appPasswordBold')}</span> {t('settingsPage.integrations.email.intro3')}
      </p>

      {isLoading ? (
        <p className="text-sm text-neutral-500 flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" /> {t('settingsPage.integrations.email.loadingAccounts')}
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
        <p className="text-sm text-neutral-500 mb-4">{t('settingsPage.integrations.email.none')}</p>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.provider')}</label>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as typeof provider)}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          >
            <option value="custom">{t('settingsPage.integrations.email.providerCustom')}</option>
            <option value="gmail">{t('settingsPage.integrations.email.providerGmail')}</option>
            <option value="outlook">{t('settingsPage.integrations.email.providerOutlook')}</option>
            <option value="yahoo">Yahoo</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.displayName')}</label>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={t('settingsPage.integrations.email.displayNamePlaceholder')}
            className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.address')}</label>
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
          <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.password')}</label>
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
            {t('settingsPage.integrations.email.infomaniakHint')}
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.imapHost')}</label>
              <input
                type="text"
                value={imapHost}
                onChange={(e) => setImapHost(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="mail.infomaniak.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.imapPort')}</label>
              <input
                type="number"
                value={imapPort}
                onChange={(e) => setImapPort(Number(e.target.value) || 993)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="993"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.smtpHost')}</label>
              <input
                type="text"
                value={smtpHost}
                onChange={(e) => setSmtpHost(e.target.value)}
                className="w-full rounded-lg border border-neutral-300 dark:border-neutral-600 bg-white dark:bg-neutral-900 px-3 py-2 text-sm"
                placeholder="mail.infomaniak.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300 mb-1">{t('settingsPage.integrations.email.smtpPort')}</label>
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
          {connectGoogleOAuthMutation.isPending ? t('settingsPage.integrations.redirecting') : t('settingsPage.integrations.email.connectGmail')}
        </button>
        <button
          type="button"
          disabled={!canSubmit || connectMutation.isPending}
          onClick={() => connectMutation.mutate()}
          className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {connectMutation.isPending ? t('settingsPage.integrations.email.connecting') : t('settingsPage.integrations.email.connectMailbox')}
        </button>
        <button
          type="button"
          onClick={() => navigate('/emails')}
          className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-4 py-2.5 text-sm font-medium text-neutral-800 dark:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-neutral-800"
        >
          {t('settingsPage.integrations.email.openInbox')}
        </button>
      </div>
    </div>
  );
}

function IntegrationsSettings() {
  const { t } = useTranslation('modules');
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const emailOauth = params.get('email_oauth');
    const calendarOauth = params.get('calendar_oauth');
    if (emailOauth === 'success') toast.success(t('settingsPage.integrations.gmailSuccess'));
    if (emailOauth === 'error') toast.error(t('settingsPage.integrations.gmailError', { reason: params.get('reason') || t('settingsPage.integrations.unknownError') }));
    if (calendarOauth === 'success') toast.success(t('settingsPage.integrations.calendarSuccess'));
    if (calendarOauth === 'error') toast.error(t('settingsPage.integrations.calendarError', { reason: params.get('reason') || t('settingsPage.integrations.unknownError') }));
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
      const msg = typeof detail === 'string' ? detail : t('settingsPage.integrations.calendarOAuthFailed');
      toast.error(msg);
    },
  });

  const disconnectGoogleMutation = useMutation({
    mutationFn: (integrationId: number) => calendarIntegrationsAPI.disconnect(integrationId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calendar-integrations'] });
      toast.success(t('settingsPage.integrations.calendarDisconnected'));
    },
    onError: () => toast.error(t('settingsPage.integrations.calendarDisconnectFailed')),
  });

  const syncGoogleMutation = useMutation({
    mutationFn: (integrationId: number) => calendarIntegrationsAPI.sync(integrationId),
    onSuccess: () => toast.success(t('settingsPage.integrations.syncQueued')),
    onError: () => toast.error(t('settingsPage.integrations.syncFailed')),
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
      disconnectHint: t('settingsPage.integrations.slackHint'),
    },
  ];

  const handlePrimary = (tile: IntegrationTile) => {
    if (tile.connected) {
      toast(tile.disconnectHint || t('settingsPage.integrations.disconnectUnavailable'));
      return;
    }
    if (tile.connectPath) {
      navigate(tile.connectPath);
      return;
    }
    toast(t('settingsPage.integrations.unavailable'));
  };

  return (
    <div className="p-8">
      <h2 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-6">
        {t('settingsPage.integrations.title')}
      </h2>
      {connectedViaGoogleSignIn && (
        <div className="mb-4 inline-flex items-center rounded-full border border-green-300 bg-green-50 px-3 py-1 text-xs font-medium text-green-700">
          {t('settingsPage.integrations.googleSignIn')}
        </div>
      )}
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        {t('settingsPage.integrations.intro')}
      </p>

      <EmailIntegrationPanel />

      <h3 className="text-md font-semibold text-neutral-900 dark:text-neutral-50 mb-3">{t('settingsPage.integrations.calendar')}</h3>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="p-6 border border-neutral-200 dark:border-neutral-700 rounded-lg">
          <div className="flex items-center space-x-3 mb-4">
            <div className="w-12 h-12 bg-neutral-100 dark:bg-neutral-700 rounded-lg flex items-center justify-center">
              <CalendarDays className="w-6 h-6 text-neutral-600 dark:text-neutral-400" />
            </div>
            <div>
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settingsPage.integrations.googleCalendar')}</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                {isLoadingCalendar
                  ? t('settingsPage.integrations.loadingShort')
                  : googleIntegration
                    ? googleIntegration.provider_account_email
                      ? t('settingsPage.integrations.connectedAs', { email: googleIntegration.provider_account_email })
                      : t('settingsPage.integrations.connected')
                    : t('settingsPage.integrations.notConnected')}
              </p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            {t('settingsPage.integrations.calendarNote')}
          </p>
          {googleIntegration ? (
            <div className="flex gap-2">
              <button
                type="button"
                disabled={connectGoogleMutation.isPending}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => connectGoogleMutation.mutate()}
              >
                {connectGoogleMutation.isPending ? t('settingsPage.integrations.redirecting') : t('settingsPage.integrations.addCalendar')}
              </button>
              <button
                type="button"
                disabled={syncGoogleMutation.isPending}
                className="rounded-lg border border-neutral-300 dark:border-neutral-600 px-3 py-2 text-sm font-medium hover:bg-neutral-100 dark:hover:bg-neutral-800 disabled:opacity-50"
                onClick={() => syncGoogleMutation.mutate(googleIntegration.id)}
              >
                {syncGoogleMutation.isPending ? t('settingsPage.integrations.syncing') : t('settingsPage.integrations.syncNow')}
              </button>
              <button
                type="button"
                disabled={disconnectGoogleMutation.isPending}
                className="rounded-lg border border-red-300 text-red-700 px-3 py-2 text-sm font-medium hover:bg-red-50 disabled:opacity-50"
                onClick={() => disconnectGoogleMutation.mutate(googleIntegration.id)}
              >
                {t('settingsPage.integrations.disconnect')}
              </button>
            </div>
          ) : (
            <button
              type="button"
              disabled={connectGoogleMutation.isPending}
              className="rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
              onClick={() => connectGoogleMutation.mutate()}
            >
              {connectGoogleMutation.isPending ? t('settingsPage.integrations.redirecting') : t('settingsPage.integrations.connectCalendar')}
            </button>
          )}
          {googleIntegrations.length > 1 && (
            <div className="mt-3 text-xs text-neutral-600 dark:text-neutral-400">
              {t('settingsPage.integrations.connectedCalendars')}
              <ul className="mt-1 list-disc pl-4">
                {googleIntegrations.map((integration) => (
                  <li key={integration.id}>{integration.provider_account_email || t('settingsPage.integrations.googleAccount', { id: integration.id })}</li>
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
              <h4 className="font-semibold text-neutral-900 dark:text-neutral-50">{t('settingsPage.integrations.otherCalendars')}</h4>
              <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('settingsPage.integrations.otherCalendarsHint')}</p>
            </div>
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-4">
            {t('settingsPage.integrations.otherCalendarsNote')}
          </p>
          <span className="inline-flex rounded-full bg-neutral-100 dark:bg-neutral-700 px-3 py-1 text-xs font-medium text-neutral-600 dark:text-neutral-300">
            {t('settingsPage.integrations.comingNext')}
          </span>
        </div>
      </div>

      <h3 className="text-md font-semibold text-neutral-900 dark:text-neutral-50 mb-3">{t('settingsPage.integrations.crmMessaging')}</h3>
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
                    {tile.connected ? t('settingsPage.integrations.connected') : t('settingsPage.integrations.notConnected')}
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
                {tile.connected ? t('settingsPage.integrations.disconnect') : t('settingsPage.integrations.connect')}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

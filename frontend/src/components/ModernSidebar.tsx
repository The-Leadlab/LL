/**
 * Modern Sidebar Navigation
 * Clean, intuitive, professional
 */

import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import {
  Users,
  ChevronLeft,
  ChevronRight,
  Search,
  LogOut,
} from 'lucide-react';
import {
  buildMainNavigation,
  bottomNavigation,
  type NavItem,
} from '@/config/navigation';
import { UserAvatar, useCurrentUserAvatar } from '@/components/UserAvatar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

function SidebarQuickSearch({ onSubmit }: { onSubmit: (q: string) => void }) {
  const { t } = useTranslation('nav');
  const [value, setValue] = useState('');
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
      <input
        type="text"
        placeholder={t('quickSearch')}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && value.trim()) {
            onSubmit(value.trim());
            setValue('');
          }
        }}
        className="w-full rounded-lg border border-border bg-muted/50 py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:border-transparent"
      />
    </div>
  );
}

export function ModernSidebar({
  onNavigate,
  forceExpanded = false,
}: {
  onNavigate?: () => void;
  forceExpanded?: boolean;
}) {
  const { t } = useTranslation('nav');
  const [collapsed, setCollapsed] = useState(false);
  const collapsedEffective = forceExpanded ? false : collapsed;
  const [expandedItems, setExpandedItems] = useState<string[]>([]);
  const location = useLocation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const avatarRevision = useAuthStore((s) => s.avatarRevision);
  const sidebarAvatarUrl = useCurrentUserAvatar(user?.id, avatarRevision);
  const adminOnlyNavKeys = new Set(['company']);
  const navigation = useMemo(() => buildMainNavigation(), []);
  const baseNavigation = user?.is_admin
    ? navigation
    : navigation.filter((item) => !adminOnlyNavKeys.has(item.labelKey));
  const visibleNavigation: NavItem[] = user?.is_admin
    ? [...baseNavigation, { labelKey: 'admin', icon: Users, path: '/admin' }]
    : baseNavigation;

  const handleLogout = async () => {
    await logout();
    navigate('/signin');
  };

  const toggleExpanded = (labelKey: string) => {
    setExpandedItems(prev =>
      prev.includes(labelKey)
        ? prev.filter(item => item !== labelKey)
        : [...prev, labelKey]
    );
  };

  const isActive = (path: string) => {
    return location.pathname === path || location.pathname.startsWith(path + '/');
  };

  const tourAttr = (labelKey: string): string | undefined => {
    if (labelKey === 'leads') return 'leads'
    if (labelKey === 'deals') return 'deals'
    if (labelKey === 'tasks') return 'tasks'
    if (labelKey === 'email') return 'email'
    if (labelKey === 'settings') return 'settings'
    return undefined
  }

  return (
    <div
      data-tour="sidebar"
      className={`${
        collapsedEffective ? 'w-20' : 'w-64'
      } flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 ease-out`}
    >
      {/* Header */}
      <div className="flex h-16 items-center justify-between gap-1 border-b border-sidebar-border px-3">
        <Link
          to="/dashboard"
          className={`flex items-center min-w-0 ${collapsedEffective ? 'justify-center flex-1' : 'flex-1'}`}
        >
          <img
            src="/images/leadlab-logo.png"
            alt="LeadLab"
            className={`object-contain dark:brightness-0 dark:invert ${
              collapsedEffective ? 'h-9 w-12' : 'h-11 w-auto max-w-[148px]'
            }`}
          />
        </Link>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden shrink-0 rounded-lg p-2 transition-colors hover:bg-sidebar-accent md:inline-flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          aria-label={collapsedEffective ? t('expand') : t('collapse')}
        >
          {collapsedEffective ? (
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          ) : (
            <ChevronLeft className="h-5 w-5 text-muted-foreground" />
          )}
        </button>
      </div>

      {/* Search — isolated so typing does not re-render the whole nav */}
      {!collapsedEffective && (
        <div className="p-4">
          <SidebarQuickSearch
            onSubmit={(q) => {
              navigate(`/leads?q=${encodeURIComponent(q)}`);
              onNavigate?.();
            }}
          />
        </div>
      )}

      {/* Main Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {visibleNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const isExpanded = expandedItems.includes(item.labelKey);
          const hasChildren = item.children && item.children.length > 0;
          const label = t(item.labelKey);

          const dataTour = tourAttr(item.labelKey)

          return (
            <div key={item.labelKey} {...(dataTour ? { 'data-tour': dataTour } : {})}>
              {hasChildren ? (
                <>
                  <button
                    onClick={() => toggleExpanded(item.labelKey)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2.5 text-sm transition-colors duration-150 ${
                      active
                        ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                        : 'text-sidebar-foreground hover:bg-sidebar-accent'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon className="w-5 h-5" />
                      {!collapsedEffective && <span className="font-medium text-sm">{label}</span>}
                    </div>
                    {!collapsedEffective && (
                      <ChevronRight
                        className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                      />
                    )}
                  </button>
                  {isExpanded && !collapsedEffective && (
                    <div className="mt-1 ml-4 space-y-1">
                      {item.children?.map((child) => {
                        const ChildIcon = child.icon;
                        const childActive = isActive(child.path);
                        return (
                          <Link
                            key={child.path}
                            to={child.path}
                            onClick={() => onNavigate?.()}
                            className={`flex items-center space-x-3 rounded-lg px-3 py-2 text-sm transition-colors duration-150 ${
                              childActive
                                ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-200'
                                : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground'
                            }`}
                          >
                            <ChildIcon className="w-4 h-4" />
                            <span>{t(child.labelKey)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </>
              ) : (
                <Link
                  to={item.path}
                  onClick={() => onNavigate?.()}
                  className={`flex items-center justify-between rounded-lg px-3 py-2.5 transition-colors duration-150 ${
                    active
                      ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon className="w-5 h-5" />
                    {!collapsedEffective && <span className="font-medium text-sm">{label}</span>}
                  </div>
                  {!collapsedEffective && item.badge && (
                    <span className="px-2 py-0.5 bg-primary-600 text-white text-xs font-medium rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )}
            </div>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <div className="space-y-1 border-t border-sidebar-border p-3">
        {bottomNavigation.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.path);
          const dataTour = tourAttr(item.labelKey);

          return (
            <Link
              key={item.labelKey}
              to={item.path}
              onClick={() => onNavigate?.()}
              {...(dataTour ? { 'data-tour': dataTour } : {})}
              className={`flex items-center space-x-3 rounded-lg px-3 py-2.5 transition-colors duration-150 ${
                active
                  ? 'bg-primary-50 font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300'
                  : 'text-sidebar-foreground hover:bg-sidebar-accent'
              }`}
            >
              <Icon className="w-5 h-5" />
              {!collapsedEffective && <span className="font-medium text-sm">{t(item.labelKey)}</span>}
            </Link>
          );
        })}
      </div>

      {/* Language + User Profile */}
      {!collapsedEffective && (
        <div className="border-t border-sidebar-border p-4">
          <div className="px-3 pb-3" data-tour="language">
            <LanguageSwitcher />
          </div>
          <div className="flex items-center space-x-3 rounded-lg p-3">
            <button
              type="button"
              onClick={() => {
                navigate('/profile');
                onNavigate?.();
              }}
              className="flex min-w-0 flex-1 items-center space-x-3 text-left hover:opacity-80"
            >
              <UserAvatar
                user={user}
                photoUrl={sidebarAvatarUrl}
                className="h-10 w-10"
                textClassName="text-sm"
              />
              <div className="min-w-0 flex-1 text-left">
                <p className="truncate text-sm font-medium text-foreground">
                  {user?.first_name && user?.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email || 'User'}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {user?.email || ''}
                </p>
              </div>
            </button>
            <button type="button" aria-label={t('logout')} onClick={handleLogout} className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              <LogOut className="h-4 w-4 text-muted-foreground hover:text-destructive" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

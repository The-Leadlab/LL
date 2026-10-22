/**
 * Modern Sidebar Navigation
 * Clean, intuitive, professional
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/store/auth';
import {
  LayoutDashboard,
  Users,
  Mail,
  Calendar,
  Target,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Zap,
  Search,
  LogOut,
  Building2,
  Settings2,
  Workflow,
  MessageSquare,
  FileText,
  CheckSquare,
  Sparkles,
  Coins,
  Map,
  Ticket,
  ShoppingCart,
  TrendingUp,
  Phone,
  Bell,
  Send,
  PlayCircle,
  FileStack,
} from 'lucide-react';
import { featureFlags } from '@/config/featureFlags';
import { UserAvatar, useCurrentUserAvatar } from '@/components/UserAvatar';
import { LanguageSwitcher } from '@/components/LanguageSwitcher';

interface NavItem {
  /** Key in the `nav` i18n namespace */
  labelKey: string;
  icon: any;
  path: string;
  badge?: string;
  children?: NavItem[];
}

const navigation: NavItem[] = [
  {
    labelKey: 'dashboard',
    icon: LayoutDashboard,
    path: '/dashboard',
  },
  {
    labelKey: 'leads',
    icon: Users,
    path: '/leads',
  },
  {
    labelKey: 'deals',
    icon: Target,
    path: '/deals',
  },
  {
    labelKey: 'tasks',
    icon: CheckSquare,
    path: '/tasks',
  },
  ...(featureFlags.navigation.showEmail
    ? [{
        labelKey: 'email',
        icon: Mail,
        path: '/emails',
        children: [
          { labelKey: 'inbox', icon: Mail, path: '/emails' },
          { labelKey: 'coldOutreach', icon: Send, path: '/emails/outreach' },
          ...(featureFlags.navigation.showEmailSequences
            ? [{ labelKey: 'campaigns', icon: Zap, path: '/email-sequences' }]
            : []),
          ...(featureFlags.navigation.showOutreachRuns
            ? [{ labelKey: 'runs', icon: PlayCircle, path: '/emails/runs' }]
            : []),
          ...(featureFlags.navigation.showOutreachTemplates
            ? [{ labelKey: 'templates', icon: FileStack, path: '/emails/templates' }]
            : []),
        ],
      } as NavItem]
    : []),
  {
    labelKey: 'messages',
    icon: MessageSquare,
    path: '/messages',
  },
  {
    labelKey: 'calendar',
    icon: Calendar,
    path: '/calendar',
  },
  {
    labelKey: 'sales',
    icon: ShoppingCart,
    path: '/cpq/quotes', // Fixed: now points to actual route
    children: [
      { labelKey: 'quotes', icon: FileText, path: '/cpq/quotes' },
      { labelKey: 'products', icon: ShoppingCart, path: '/cpq/products' },
    ],
  },
  ...(featureFlags.navigation.showMindMapping
    ? [{
        labelKey: 'mindMapping',
        icon: Workflow,
        path: '/workflows',
      } as NavItem]
    : []),
  ...(featureFlags.navigation.showForecasting
    ? [{
        labelKey: 'forecasting',
        icon: TrendingUp,
        path: '/forecasting',
      } as NavItem]
    : []),
  {
    labelKey: 'conversations',
    icon: Phone,
    path: '/conversations',
  },
  {
    labelKey: 'invoiceCreation',
    icon: FileText,
    path: '/invoices/new',
  },
  {
    labelKey: 'reports',
    icon: BarChart3,
    path: '/reports',
  },
  {
    labelKey: 'aiInsights',
    icon: Sparkles,
    path: '/ai-insights',
  },
  {
    labelKey: 'company',
    icon: Building2,
    path: '/settings/company',
    children: [
      { labelKey: 'company', icon: Settings2, path: '/settings/company' },
      { labelKey: 'territories', icon: Map, path: '/settings/territories' },
    ],
  },
];

const bottomNavigation: NavItem[] = [
  {
    labelKey: 'reportIssue',
    icon: Ticket,
    path: '/report',
  },
  {
    labelKey: 'settings',
    icon: Settings,
    path: '/settings/profile',
  },
  {
    labelKey: 'notifications',
    icon: Bell,
    path: '/notifications',
  },
];

function SidebarQuickSearch({ onSubmit }: { onSubmit: (q: string) => void }) {
  const { t } = useTranslation('nav');
  const [value, setValue] = useState('');
  return (
    <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
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
        className="w-full pl-9 pr-3 py-2 bg-neutral-50 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
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
      } h-full bg-white dark:bg-neutral-900 border-r border-neutral-200 dark:border-neutral-800 flex flex-col transition-all duration-300 ease-in-out`}
    >
      {/* Header */}
      <div className="h-16 flex items-center justify-between gap-1 px-3 border-b border-neutral-200 dark:border-neutral-800">
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
          className="hidden p-2 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-lg transition-colors shrink-0 md:inline-flex"
          aria-label={collapsedEffective ? t('expand') : t('collapse')}
        >
          {collapsedEffective ? (
            <ChevronRight className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
          ) : (
            <ChevronLeft className="w-5 h-5 text-neutral-600 dark:text-neutral-300" />
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
                    className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                      active
                        ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                        : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
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
                            className={`flex items-center space-x-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                              childActive
                                ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-200'
                                : 'text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800'
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
                  className={`flex items-center justify-between px-3 py-2.5 rounded-lg transition-colors ${
                    active
                      ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                      : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
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
      <div className="p-3 space-y-1 border-t border-neutral-200 dark:border-neutral-800">
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
              className={`flex items-center space-x-3 px-3 py-2.5 rounded-lg transition-colors ${
                active
                  ? 'bg-primary-50 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300'
                  : 'text-neutral-700 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800'
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
        <div className="p-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="px-3 pb-3" data-tour="language">
            <LanguageSwitcher />
          </div>
          <div className="flex items-center space-x-3 p-3 rounded-lg">
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
                className="w-10 h-10"
                textClassName="text-sm"
              />
              <div className="flex-1 min-w-0 text-left">
                <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50 truncate">
                  {user?.first_name && user?.last_name
                    ? `${user.first_name} ${user.last_name}`
                    : user?.email || 'User'}
                </p>
                <p className="text-xs text-neutral-500 dark:text-neutral-400 truncate">
                  {user?.email || ''}
                </p>
              </div>
            </button>
            <button type="button" aria-label={t('logout')} onClick={handleLogout} className="min-h-[44px] min-w-[44px] flex items-center justify-center">
              <LogOut className="w-4 h-4 text-neutral-400 hover:text-red-500" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Shared nav model for desktop sidebar, phone tab bar, and More sheet.
 */

import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Mail,
  Calendar,
  Target,
  BarChart3,
  Settings,
  Zap,
  Building2,
  Settings2,
  Workflow,
  MessageSquare,
  FileText,
  CheckSquare,
  Sparkles,
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

export interface NavItem {
  /** Key in the `nav` i18n namespace */
  labelKey: string;
  icon: LucideIcon;
  path: string;
  badge?: string;
  children?: NavItem[];
}

/** Primary phone bottom tabs (exclude "More"). */
export const PHONE_TAB_PATHS = [
  '/dashboard',
  '/leads',
  '/tasks',
  '/emails',
] as const;

export function buildMainNavigation(): NavItem[] {
  return [
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
      ? [
          {
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
          } as NavItem,
        ]
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
      path: '/cpq/quotes',
      children: [
        { labelKey: 'quotes', icon: FileText, path: '/cpq/quotes' },
        { labelKey: 'products', icon: ShoppingCart, path: '/cpq/products' },
      ],
    },
    ...(featureFlags.navigation.showMindMapping
      ? [
          {
            labelKey: 'mindMapping',
            icon: Workflow,
            path: '/workflows',
          } as NavItem,
        ]
      : []),
    ...(featureFlags.navigation.showForecasting
      ? [
          {
            labelKey: 'forecasting',
            icon: TrendingUp,
            path: '/forecasting',
          } as NavItem,
        ]
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
}

export const bottomNavigation: NavItem[] = [
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

export const phonePrimaryTabs: NavItem[] = [
  { labelKey: 'dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { labelKey: 'leads', icon: Users, path: '/leads' },
  { labelKey: 'tasks', icon: CheckSquare, path: '/tasks' },
  { labelKey: 'email', icon: Mail, path: '/emails' },
];

/** Flatten nav tree for More sheet (exclude primary tab roots). */
export function flattenNavForMore(items: NavItem[]): NavItem[] {
  const primary = new Set<string>(PHONE_TAB_PATHS);
  const out: NavItem[] = [];
  for (const item of items) {
    if (primary.has(item.path) && !item.children?.length) continue;
    if (item.path === '/emails' && item.children?.length) {
      for (const child of item.children) {
        if (child.path === '/emails') continue;
        out.push(child);
      }
      continue;
    }
    if (item.children?.length) {
      for (const child of item.children) out.push(child);
    } else if (!primary.has(item.path)) {
      out.push(item);
    }
  }
  return out;
}

export function isPhoneTabActive(pathname: string, tabPath: string): boolean {
  if (tabPath === '/emails') {
    return pathname === '/emails' || pathname.startsWith('/emails/');
  }
  if (tabPath === '/dashboard') return pathname === '/dashboard' || pathname === '/';
  return pathname === tabPath || pathname.startsWith(`${tabPath}/`);
}

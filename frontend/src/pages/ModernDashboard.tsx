/**
 * Modern Dashboard - Connected to Real Backend API
 *
 * Features:
 * - Real-time KPIs from backend
 * - Live charts and metrics
 * - Recent activities feed
 * - Upcoming tasks
 * - Full backend integration
 */

import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatLocalDateTime } from '@/lib/localDateTime';
import { leadsAPI, type LeadStats } from '@/services/api/leads';
import api from '@/services/axios';
import {
  Users,
  DollarSign,
  TrendingUp,
  Target,
  ArrowUp,
  ArrowDown,
  Calendar,
  Mail,
  Phone,
  CheckSquare,
  Loader2
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b'];

function formatPipelineUsd(value: number): string {
  return `$${Math.round(value).toLocaleString('en-US')}`;
}

function KpiWowBadge({
  value,
  suffix = '%',
  sublabel,
}: {
  value: number | null | undefined;
  suffix?: string;
  sublabel?: string;
}) {
  if (value === null || value === undefined) {
    return (
      <span className="text-sm font-medium text-neutral-400 dark:text-neutral-500" title={sublabel}>
        —
      </span>
    );
  }
  const up = value >= 0;
  return (
    <span
      className={`flex items-center text-sm font-medium ${
        up
          ? 'text-green-600 dark:text-green-400'
          : 'text-red-600 dark:text-red-400'
      }`}
      title={sublabel}
    >
      {up ? (
        <ArrowUp className="w-4 h-4 mr-1" />
      ) : (
        <ArrowDown className="w-4 h-4 mr-1" />
      )}
      {up ? '+' : ''}
      {value.toFixed(1)}
      {suffix}
    </span>
  );
}

export function ModernDashboard() {
  const { t, i18n } = useTranslation('admin');
  const dateLocale = i18n.language?.startsWith('fr') ? 'fr-FR' : 'en-US';
  const navigate = useNavigate();

  // Fetch lead statistics
  const {
    data: leadStatsData,
    isLoading: isLoadingLeadStats,
    isError: isLeadStatsError,
    refetch: refetchLeadStats,
  } = useQuery({
    queryKey: ['leadStats'],
    queryFn: leadsAPI.getLeadStats,
    retry: 1,
    staleTime: 60_000,
  });

  // Fetch dashboard stats
  const {
    data: dashboardStatsResponse,
    isLoading: isLoadingDashboard,
    isError: isDashboardError,
    refetch: refetchDashboard,
  } = useQuery({
    queryKey: ['dashboardStats'],
    queryFn: () => api.get('/dashboard/stats'),
    retry: 1,
    staleTime: 60_000,
  });

  const leadStats: LeadStats = leadStatsData ?? {
    total: 0,
    new: 0,
    qualified: 0,
    contacted: 0,
    converted: 0,
  };

  const dashboardStats = dashboardStatsResponse?.data?.data || {};

  // Calculate metrics
  const totalLeads = leadStats.total || 0;
  const pipelineValue = dashboardStats.opportunities?.pipeline_value || 0;
  const conversionRate = dashboardStats.opportunities?.conversion_rate || 0;
  const activeDeals = dashboardStats.opportunities?.total || 0;

  // Lead activity chart (last 7 days — real counts from API)
  const revenueData =
    dashboardStats.leads?.trend?.slice(-7).map((item: { date: string; new_leads: number }) => ({
      name: new Date(item.date).toLocaleDateString(dateLocale, { month: 'short', day: 'numeric' }),
      leads: item.new_leads,
    })) || [];

  // Pipeline distribution data
  const pipelineData = [
    { name: t('leads:new'), value: leadStats.new || 0 },
    { name: t('leads:qualified'), value: leadStats.qualified || 0 },
    { name: t('leads:contacted'), value: leadStats.contacted || 0 },
    { name: t('leads:converted'), value: leadStats.converted || 0 },
  ].filter(item => item.value > 0);

  const kpiLoading = isLoadingLeadStats || isLoadingDashboard;
  const hasAnyError = isLeadStatsError || isDashboardError;

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-900 p-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-neutral-900 dark:text-neutral-50 mb-2">
          {t('dashboard')}
        </h1>
        <p className="text-neutral-600 dark:text-neutral-400">
          {t('dashboardPage.welcome')}
        </p>
      </div>

      {hasAnyError && (
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/50 dark:bg-amber-950/30">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            {t('dashboardPage.loadFailedBody')}
          </p>
          <button
            type="button"
            onClick={() => {
              void refetchLeadStats();
              void refetchDashboard();
            }}
            className="rounded-lg bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            {t('common:retry')}
          </button>
        </div>
      )}

      {/* KPI Cards — paint shell immediately; pulse while queries resolve */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {/* Total Leads */}
        <button
          type="button"
          onClick={() => navigate('/leads')}
          className="text-left bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/20 rounded-lg flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
            {kpiLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-neutral-400" />
            ) : (
              <KpiWowBadge
                value={dashboardStats.leads?.wow_new_leads_pct_change}
                suffix="%"
                sublabel={t('dashboardPage.wowLeadsHint')}
              />
            )}
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
            {kpiLoading && !leadStatsData ? (
              <span className="inline-block h-8 w-16 animate-pulse rounded bg-neutral-200 dark:bg-neutral-700" />
            ) : (
              totalLeads.toLocaleString()
            )}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">
            {t('dashboardPage.totalLeads')}
            {typeof dashboardStats.leads?.new_leads_last_7d === 'number' && (
              <span className="block text-xs text-neutral-500 mt-0.5">
                {t('dashboardPage.newInLast7d', { count: dashboardStats.leads.new_leads_last_7d })}
              </span>
            )}
          </p>
        </button>

        {/* Pipeline Value */}
        <button
          type="button"
          onClick={() => navigate('/deals')}
          className="text-left bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-green-100 dark:bg-green-900/20 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
            <KpiWowBadge
              value={dashboardStats.opportunities?.pipeline_value_wow_pct_change}
              suffix="%"
              sublabel={t('dashboardPage.wowPipelineHint')}
            />
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
            {formatPipelineUsd(pipelineValue)}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboardPage.openPipeline')}</p>
          <p className="text-xs text-neutral-500 dark:text-neutral-500 mt-1">{t('dashboardPage.excludesClosed')}</p>
        </button>

        {/* Tasks */}
        <button
          type="button"
          onClick={() => navigate('/tasks')}
          className="text-left bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/20 rounded-lg flex items-center justify-center">
              <CheckSquare className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
            <span className="text-sm font-medium text-neutral-600 dark:text-neutral-300">
              {dashboardStats.tasks?.overdue
                ? t('dashboardPage.overdueCount', { count: dashboardStats.tasks.overdue })
                : t('dashboardPage.noneOverdue')}
            </span>
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
            {(dashboardStats.tasks?.open || 0).toLocaleString()}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboardPage.tasks')}</p>
        </button>

        {/* Active Deals */}
        <button
          type="button"
          onClick={() => navigate('/deals')}
          className="text-left bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/20 rounded-lg flex items-center justify-center">
              <Target className="w-6 h-6 text-orange-600 dark:text-orange-400" />
            </div>
            {typeof dashboardStats.opportunities?.won === 'number' &&
            dashboardStats.opportunities.won > 0 ? (
              <span className="flex items-center text-sm font-medium text-orange-600 dark:text-orange-400">
                <ArrowUp className="w-4 h-4 mr-1" />
                {t('dashboardPage.wonCount', { count: dashboardStats.opportunities.won })}
              </span>
            ) : (
              <span
                className="text-sm font-medium text-neutral-400 dark:text-neutral-500"
                title={t('dashboardPage.closedWonHint')}
              >
                —
              </span>
            )}
          </div>
          <h3 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50 mb-1">
            {activeDeals}
          </h3>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">{t('dashboardPage.activeDeals')}</p>
        </button>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        {/* Revenue Trend */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            {t('dashboardPage.leadActivity')}
          </h3>
          {revenueData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={revenueData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.1} />
                <XAxis dataKey="name" stroke="#9ca3af" fontSize={12} />
                <YAxis stroke="#9ca3af" fontSize={12} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1f2937',
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff'
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="leads"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  name={t('dashboardPage.newLeadsSeries')}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-neutral-500 dark:text-neutral-400">
              {t('common:noData')}
            </div>
          )}
        </div>

        {/* Pipeline Distribution */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50 mb-4">
            {t('dashboardPage.pipelineDistribution')}
          </h3>
          {pipelineData.length > 0 ? (
            <div className="flex items-center">
              <ResponsiveContainer width="60%" height={250}>
                <PieChart>
                  <Pie
                    data={pipelineData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {pipelineData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex-1 space-y-3">
                {pipelineData.map((item, index) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <div
                        className="w-3 h-3 rounded-full"
                        style={{ backgroundColor: COLORS[index % COLORS.length] }}
                      />
                      <span className="text-sm text-neutral-700 dark:text-neutral-300">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
                      {item.value}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="h-[250px] flex items-center justify-center text-neutral-500 dark:text-neutral-400">
              {t('dashboardPage.noPipelineData')}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activities */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {t('dashboardPage.recentActivities')}
            </h3>
            <button
              onClick={() => navigate('/leads')}
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              {t('dashboardPage.viewAll')}
            </button>
          </div>
          <div className="space-y-4">
            {Array.isArray(dashboardStats.activities) && dashboardStats.activities.length > 0 ? (
              dashboardStats.activities.map((a: { id: string; title: string; created_at: string; type?: string }) => (
                <div
                  key={a.id}
                  className="p-4 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-neutral-50/50 dark:bg-neutral-800/50"
                >
                  <p className="text-sm font-medium text-neutral-900 dark:text-neutral-50">{a.title}</p>
                  <p className="text-xs text-neutral-500 mt-1">
                    {formatLocalDateTime(a.created_at)}
                    {a.type ? ` · ${a.type}` : ''}
                  </p>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                <p>{t('dashboardPage.noRecentActivities')}</p>
                <p className="text-sm mt-2">{t('dashboardPage.startAddingLeads')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Upcoming Tasks */}
        <div className="bg-white dark:bg-neutral-800 rounded-xl p-6 border border-neutral-200 dark:border-neutral-700 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
              {t('dashboardPage.upcomingTasks')}
            </h3>
            <button
              onClick={() => navigate('/tasks')}
              className="text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300 font-medium"
            >
              {t('dashboardPage.viewAll')}
            </button>
          </div>
          <div className="space-y-4">
            {dashboardStats.tasks?.open > 0 ? (
              <div className="flex items-center justify-between p-4 bg-neutral-50 dark:bg-neutral-700/50 rounded-lg">
                <div className="flex items-center space-x-3">
                  <CheckSquare className="w-5 h-5 text-neutral-600 dark:text-neutral-400" />
                  <span className="text-sm text-neutral-900 dark:text-neutral-50">
                    {t('dashboardPage.openTasksCount', { count: dashboardStats.tasks.open })}
                  </span>
                </div>
                {dashboardStats.tasks.overdue > 0 && (
                  <span className="px-2 py-1 bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400 rounded text-xs font-medium">
                    {t('dashboardPage.overdueCount', { count: dashboardStats.tasks.overdue })}
                  </span>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-neutral-500 dark:text-neutral-400">
                <p>{t('dashboardPage.noUpcomingTasks')}</p>
                <p className="text-sm mt-2">{t('dashboardPage.allCaughtUp')}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

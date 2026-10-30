import React, { useState, useEffect, useMemo } from 'react';
import { format, subDays, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { 
  BarChart3, 
  TrendingUp, 
  Download, 
  Calendar,
  Filter,
  Users,
  DollarSign,
  Target,
  FileText,
  Eye,
  Printer,
  Share2,
  RefreshCw,
  PieChart,
  LineChart,
  MapPin,
  Clock,
  Zap,
  AlertCircle,
  CheckCircle,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Phone,
  Mail,
  MessageSquare,
  TrendingDown,
  Briefcase,
  Globe,
  Award,
  AlertTriangle
} from 'lucide-react';
import { Card } from '../../components/ui/Card';
import { Button } from '../../components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../../components/ui/tabs';
import { Badge } from '../../components/ui/Badge';
import { Progress } from '../../components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/Select';
import { 
  advancedReportsApi, 
  KPIDashboardResponse, 
  ConversionFunnelStage,
  UserPerformanceDetail,
  LeadSourceMetrics,
  PipelineHealthMetrics,
  GeographicInsights,
  SectorAnalysis,
  ActivityReport
} from '../../api/advancedReports';
import toast from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import api from '../../services/axios';

type TimeRange = 'today' | 'week' | 'month' | 'quarter' | 'year' | 'custom';

// KPI Metric Card Component
const KPICard: React.FC<{
  metric: any;
  icon: React.ReactNode;
  color: string;
}> = ({ metric, icon, color }) => {
  const { t } = useTranslation('modules');
  const getTrendIcon = () => {
    if (metric.trend === 'up') return <ArrowUpRight className="h-4 w-4 text-green-500" />;
    if (metric.trend === 'down') return <ArrowDownRight className="h-4 w-4 text-red-500" />;
    return <Activity className="h-4 w-4 text-gray-400" />;
  };

  const getChangeColor = () => {
    if (metric.change_percentage > 0) return 'text-green-600';
    if (metric.change_percentage < 0) return 'text-red-600';
    return 'text-gray-600';
  };

  return (
    <Card className="p-6 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between">
        <div className={`p-3 rounded-xl ${color}`}>
          {icon}
        </div>
        <div className="flex items-center space-x-1">
          {getTrendIcon()}
          <span className={`text-sm font-medium ${getChangeColor()}`}>
            {metric.change_percentage > 0 ? '+' : ''}{metric.change_percentage.toFixed(1)}%
          </span>
        </div>
      </div>
      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-600">{metric.name}</h3>
        <div className="flex items-baseline mt-2">
          <p className="text-2xl font-bold text-gray-900">
            {metric.unit === 'USD' 
              ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metric.current_value)
              : metric.unit === '%'
              ? `${metric.current_value.toFixed(1)}%`
              : new Intl.NumberFormat('en-US').format(metric.current_value)
            }
          </p>
          <span className="ml-2 text-sm text-gray-500">
            {metric.unit && metric.unit !== 'USD' && metric.unit !== '%' ? metric.unit : ''}
          </span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          {t('reports.previous')} {metric.unit === 'USD' 
            ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(metric.previous_value)
            : new Intl.NumberFormat('en-US').format(metric.previous_value)
          }
        </p>
      </div>
    </Card>
  );
};

// Funnel Stage Component
const FunnelStageCard: React.FC<{ stage: ConversionFunnelStage; isLast: boolean }> = ({ stage, isLast }) => {
  const { t } = useTranslation('modules');
  return (
    <div className="relative">
      <Card className="p-6 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-900">{stage.stage_name}</h3>
          <Badge variant={stage.conversion_rate >= 70 ? "default" : stage.conversion_rate >= 40 ? "outline" : "destructive"}>
            {stage.conversion_rate.toFixed(1)}%
          </Badge>
        </div>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{t('reports.labels.leads')}</span>
            <span className="font-medium">{new Intl.NumberFormat('tr-TR').format(stage.lead_count)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{t('reports.labels.dropOff')}</span>
            <span className="font-medium text-red-600">{stage.drop_off_count}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600">{t('reports.labels.avgTime')}</span>
            <span className="font-medium">{stage.average_time_days.toFixed(1)} {t('reports.labels.days')}</span>
          </div>
        </div>
        <Progress 
          value={stage.conversion_rate} 
          className="mt-4"
        />
      </Card>
      {!isLast && (
        <div className="absolute -right-4 top-1/2 transform -translate-y-1/2 z-10">
          <div className="w-8 h-8 bg-indigo-500 rounded-full flex items-center justify-center">
            <ArrowUpRight className="h-4 w-4 text-white rotate-90" />
          </div>
        </div>
      )}
    </div>
  );
};

// Mock data for fallback
const mockKPIData: KPIDashboardResponse = {
  kpi_metrics: [
    {
      name: 'Total Leads',
      current_value: 8095,
      previous_value: 7234,
      change_percentage: 11.9,
      unit: '',
      trend: 'up'
    },
    {
      name: 'Qualified Leads',
      current_value: 2428,
      previous_value: 2156,
      change_percentage: 12.6,
      unit: '',
      trend: 'up'
    },
    {
      name: 'Total Revenue',
      current_value: 245670,
      previous_value: 198543,
      change_percentage: 23.7,
      unit: 'USD',
      trend: 'up'
    },
    {
      name: 'Conversion Rate',
      current_value: 30.0,
      previous_value: 29.8,
      change_percentage: 0.7,
      unit: '%',
      trend: 'up'
    }
  ],
  period: {
    start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
    end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
    days: 30
  }
};

const mockFunnelData: ConversionFunnelStage[] = [
  {
    stage_name: 'New Lead',
    stage_order: 1,
    lead_count: 8095,
    conversion_rate: 100,
    drop_off_count: 0,
    drop_off_rate: 0,
    average_time_days: 0
  },
  {
    stage_name: 'Qualified',
    stage_order: 2,
    lead_count: 2428,
    conversion_rate: 30.0,
    drop_off_count: 5667,
    drop_off_rate: 70.0,
    average_time_days: 2.5
  },
  {
    stage_name: 'Contacted',
    stage_order: 3,
    lead_count: 1457,
    conversion_rate: 60.0,
    drop_off_count: 971,
    drop_off_rate: 40.0,
    average_time_days: 5.2
  },
  {
    stage_name: 'Deal Created',
    stage_order: 4,
    lead_count: 873,
    conversion_rate: 60.0,
    drop_off_count: 584,
    drop_off_rate: 40.0,
    average_time_days: 7.8
  }
];

const mockLeadSources: LeadSourceMetrics[] = [
  {
    source: 'Website',
    total_leads: 3247,
    qualified_leads: 1298,
    deals_created: 456,
    deals_won: 187,
    total_revenue: 98745,
    cost_per_lead: 12.50,
    roi_percentage: 285.7,
    conversion_rate: 40.0,
    quality_score: 78.5
  },
  {
    source: 'LinkedIn',
    total_leads: 2156,
    qualified_leads: 863,
    deals_created: 298,
    deals_won: 134,
    total_revenue: 76543,
    cost_per_lead: 18.75,
    roi_percentage: 189.2,
    conversion_rate: 40.0,
    quality_score: 82.3
  },
  {
    source: 'Partner',
    total_leads: 1892,
    qualified_leads: 756,
    deals_created: 267,
    deals_won: 98,
    total_revenue: 54321,
    cost_per_lead: 22.30,
    roi_percentage: 97.8,
    conversion_rate: 39.9,
    quality_score: 75.2
  },
  {
    source: 'Cold Calling',
    total_leads: 800,
    qualified_leads: 240,
    deals_created: 89,
    deals_won: 32,
    total_revenue: 23456,
    cost_per_lead: 35.60,
    roi_percentage: 12.4,
    conversion_rate: 30.0,
    quality_score: 65.8
  }
];

const mockUserPerformance: UserPerformanceDetail[] = [
  {
    user_id: 1,
    user_name: 'Ahmet Yılmaz',
    user_email: 'ahmet@leadlab.com',
    total_leads: 1245,
    qualified_leads: 498,
    deals_created: 187,
    deals_won: 89,
    deals_lost: 98,
    total_revenue: 456789,
    conversion_rate: 40.0,
    average_deal_size: 5131,
    activities_count: 2456,
    tasks_completed: 189,
    response_time_hours: 2.4
  },
  {
    user_id: 2,
    user_name: 'Fatma Demir',
    user_email: 'fatma@leadlab.com',
    total_leads: 987,
    qualified_leads: 394,
    deals_created: 145,
    deals_won: 67,
    deals_lost: 78,
    total_revenue: 345678,
    conversion_rate: 39.9,
    average_deal_size: 5159,
    activities_count: 1876,
    tasks_completed: 156,
    response_time_hours: 1.8
  },
  {
    user_id: 3,
    user_name: 'Mehmet Kaya',
    user_email: 'mehmet@leadlab.com',
    total_leads: 765,
    qualified_leads: 229,
    deals_created: 89,
    deals_won: 34,
    deals_lost: 55,
    total_revenue: 187654,
    conversion_rate: 29.9,
    average_deal_size: 5520,
    activities_count: 1234,
    tasks_completed: 98,
    response_time_hours: 3.2
  }
];

const mockGeoInsights: GeographicInsights[] = [
  {
    country: 'Turkey',
    region: 'Marmara',
    city: 'Istanbul',
    lead_count: 4563,
    deal_count: 234,
    total_revenue: 1234567,
    average_deal_size: 5275,
    conversion_rate: 41.2,
    market_penetration: 15.7
  },
  {
    country: 'Turkey',
    region: 'Central Anatolia',
    city: 'Ankara',
    lead_count: 2134,
    deal_count: 123,
    total_revenue: 654321,
    average_deal_size: 5319,
    conversion_rate: 38.9,
    market_penetration: 12.3
  },
  {
    country: 'Turkey',
    region: 'Aegean',
    city: 'Izmir',
    lead_count: 1398,
    deal_count: 87,
    total_revenue: 432198,
    average_deal_size: 4968,
    conversion_rate: 42.1,
    market_penetration: 8.9
  }
];

const mockSectorAnalysis: SectorAnalysis[] = [
  {
    sector: 'Technology',
    lead_count: 2543,
    deal_count: 156,
    total_revenue: 987654,
    average_deal_size: 6330,
    conversion_rate: 43.2,
    growth_rate: 18.5,
    market_share: 23.4
  },
  {
    sector: 'Healthcare',
    lead_count: 1876,
    deal_count: 98,
    total_revenue: 567890,
    average_deal_size: 5795,
    conversion_rate: 38.7,
    growth_rate: 12.3,
    market_share: 18.9
  },
  {
    sector: 'Finance',
    lead_count: 1456,
    deal_count: 87,
    total_revenue: 654321,
    average_deal_size: 7520,
    conversion_rate: 45.1,
    growth_rate: 8.7,
    market_share: 15.2
  }
];

const mockActivityReports: ActivityReport[] = [
  {
    user_name: 'Ahmet Yılmaz',
    user_email: 'ahmet@leadlab.com',
    total_activities: 1234,
    calls_made: 567,
    meetings_held: 89,
    emails_sent: 578,
    tasks_completed: 189,
    average_response_time: 2.4,
    activity_success_rate: 78.5
  },
  {
    user_name: 'Fatma Demir',
    user_email: 'fatma@leadlab.com',
    total_activities: 987,
    calls_made: 432,
    meetings_held: 76,
    emails_sent: 479,
    tasks_completed: 156,
    average_response_time: 1.8,
    activity_success_rate: 82.3
  },
  {
    user_name: 'Mehmet Kaya',
    user_email: 'mehmet@leadlab.com',
    total_activities: 765,
    calls_made: 298,
    meetings_held: 45,
    emails_sent: 422,
    tasks_completed: 98,
    average_response_time: 3.2,
    activity_success_rate: 71.2
  }
];

export function ReportsPage() {
  const { t } = useTranslation('modules');
  const [activeTab, setActiveTab] = useState<string>('overview');
  const [timeRange, setTimeRange] = useState<TimeRange>('month');
  const [loading, setLoading] = useState(true);
  const [customStartDate, setCustomStartDate] = useState<string>('');
  const [customEndDate, setCustomEndDate] = useState<string>('');
  const [includeTeam, setIncludeTeam] = useState(true);
  const [usesFallbackData, setUsesFallbackData] = useState(false);

  // Data states
  const [kpiData, setKpiData] = useState<KPIDashboardResponse | null>(null);
  const [funnelData, setFunnelData] = useState<ConversionFunnelStage[]>([]);
  const [userPerformance, setUserPerformance] = useState<UserPerformanceDetail[]>([]);
  const [leadSources, setLeadSources] = useState<LeadSourceMetrics[]>([]);
  const [pipelineHealth, setPipelineHealth] = useState<PipelineHealthMetrics[]>([]);
  const [geoInsights, setGeoInsights] = useState<GeographicInsights[]>([]);
  const [sectorAnalysis, setSectorAnalysis] = useState<SectorAnalysis[]>([]);
  const [activityReports, setActivityReports] = useState<ActivityReport[]>([]);

  const getDateRange = () => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (timeRange) {
      case 'today':
        startDate = now;
        break;
      case 'week':
        startDate = subDays(now, 7);
        break;
      case 'month':
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
        break;
      case 'quarter':
        const currentQuarter = Math.floor((now.getMonth() / 3));
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1);
        endDate = new Date(now.getFullYear(), (currentQuarter + 1) * 3, 0);
        break;
      case 'year':
        startDate = startOfYear(now);
        endDate = endOfYear(now);
        break;
      case 'custom':
        startDate = customStartDate ? new Date(customStartDate) : subDays(now, 30);
        endDate = customEndDate ? new Date(customEndDate) : now;
        break;
      default:
        startDate = startOfMonth(now);
        endDate = endOfMonth(now);
    }

    return {
      startDate: format(startDate, 'yyyy-MM-dd\'T\'HH:mm:ss'),
      endDate: format(endDate, 'yyyy-MM-dd\'T\'HH:mm:ss')
    };
  };

  const dateParams = useMemo(() => {
    const { startDate, endDate } = getDateRange();
    return {
      start_date: startDate,
      end_date: endDate,
      include_team: includeTeam
    };
  }, [timeRange, customStartDate, customEndDate, includeTeam]);

  const fetchAllData = async () => {
    const withTimeout = <T,>(promise: Promise<T>, ms = 8000): Promise<T> =>
      Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
      ]);

    try {
      setLoading(true);
      console.log('Fetching reports data with params:', dateParams);
      
      const [
        kpiResponse,
        funnelResponse,
        userResponse,
        sourcesResponse,
        pipelineResponse,
        geoResponse,
        sectorResponse,
        activityResponse
      ] = await Promise.allSettled([
        withTimeout(advancedReportsApi.getKPIDashboard(dateParams)),
        withTimeout(advancedReportsApi.getConversionFunnel(dateParams)),
        withTimeout(advancedReportsApi.getUserPerformance(dateParams)),
        withTimeout(advancedReportsApi.getLeadSourceAnalysis(dateParams)),
        withTimeout(advancedReportsApi.getPipelineHealth()),
        withTimeout(advancedReportsApi.getGeographicInsights(dateParams)),
        withTimeout(advancedReportsApi.getSectorAnalysis(dateParams)),
        withTimeout(advancedReportsApi.getActivityPerformance(dateParams))
      ]);

      // Handle responses with better error logging
      if (kpiResponse.status === 'fulfilled') {
        console.log('KPI Data:', kpiResponse.value);
        setKpiData(kpiResponse.value);
      } else {
        console.error('KPI fetch failed:', kpiResponse.reason);
      }
      
      if (funnelResponse.status === 'fulfilled') {
        console.log('Funnel Data:', funnelResponse.value);
        setFunnelData(funnelResponse.value);
      } else {
        console.error('Funnel fetch failed:', funnelResponse.reason);
      }
      
      if (userResponse.status === 'fulfilled') {
        console.log('User Performance Data:', userResponse.value);
        setUserPerformance(userResponse.value);
      } else {
        console.error('User performance fetch failed:', userResponse.reason);
      }
      
      if (sourcesResponse.status === 'fulfilled') {
        console.log('Lead Sources Data:', sourcesResponse.value);
        setLeadSources(sourcesResponse.value);
      } else {
        console.error('Lead sources fetch failed:', sourcesResponse.reason);
      }
      
      if (pipelineResponse.status === 'fulfilled') {
        console.log('Pipeline Health Data:', pipelineResponse.value);
        setPipelineHealth(pipelineResponse.value);
      } else {
        console.error('Pipeline health fetch failed:', pipelineResponse.reason);
      }
      
      if (geoResponse.status === 'fulfilled') {
        console.log('Geographic Data:', geoResponse.value);
        setGeoInsights(geoResponse.value);
      } else {
        console.error('Geographic fetch failed:', geoResponse.reason);
      }
      
      if (sectorResponse.status === 'fulfilled') {
        console.log('Sector Analysis Data:', sectorResponse.value);
        setSectorAnalysis(sectorResponse.value);
      } else {
        console.error('Sector analysis fetch failed:', sectorResponse.reason);
      }
      
      if (activityResponse.status === 'fulfilled') {
        console.log('Activity Reports Data:', activityResponse.value);
        setActivityReports(activityResponse.value);
      } else {
        console.error('Activity reports fetch failed:', activityResponse.reason);
      }

      // Count successful requests
      const successCount = [kpiResponse, funnelResponse, userResponse, sourcesResponse, pipelineResponse, geoResponse, sectorResponse, activityResponse]
        .filter(response => response.status === 'fulfilled').length;
      
      console.log(`Successfully loaded ${successCount}/8 data sources`);
      
      if (kpiResponse.status !== 'fulfilled') {
        try {
          const dash = await withTimeout(api.get('/reports'), 6000);
          const stats = dash.data || {};
          const funnel = stats.lead_funnel || {};
          const sales = stats.sales_performance || {};
          setKpiData({
            kpi_metrics: [
              { name: 'Total Leads', current_value: funnel.total_leads || 0, previous_value: 0, change_percentage: 0, unit: '', trend: 'neutral' },
              { name: 'Qualified Leads', current_value: funnel.qualified_leads || 0, previous_value: 0, change_percentage: 0, unit: '', trend: 'neutral' },
              { name: 'Total Revenue', current_value: sales.total_revenue || 0, previous_value: 0, change_percentage: 0, unit: 'USD', trend: 'neutral' },
              { name: 'Conversion Rate', current_value: funnel.conversion_rates?.lead_to_won ? funnel.conversion_rates.lead_to_won * 100 : 0, previous_value: 0, change_percentage: 0, unit: '%', trend: 'neutral' },
            ],
            period: {
              start_date: format(startOfMonth(new Date()), 'yyyy-MM-dd'),
              end_date: format(endOfMonth(new Date()), 'yyyy-MM-dd'),
              days: 30,
            },
          });
        } catch {
          setKpiData(mockKPIData);
          setUsesFallbackData(true);
        }
      }

      if (successCount === 0) {
        setUsesFallbackData(true);
      } else if (successCount < 8) {
        setUsesFallbackData(false);
      } else {
        setUsesFallbackData(false);
      }

    } catch (error) {
      console.error('Error fetching reports data:', error);
      setUsesFallbackData(false);
      toast.error(t('reports.toast.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, [dateParams]);

  const handleExport = async (type: string) => {
    try {
      const blob = await advancedReportsApi.exportAnalyticsCSV(type, dateParams);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${type}-report-${format(new Date(), 'yyyy-MM-dd')}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(t('reports.toast.exported'));
    } catch (error) {
      toast.error(t('reports.toast.exportFailed'));
    }
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{t('reports.title')}</h1>
            <p className="text-gray-600">{t('reports.subtitleShort')}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i} className="p-6">
              <div className="animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-4"></div>
                <div className="h-8 bg-gray-200 rounded w-1/2 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full"></div>
              </div>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BarChart3 className="h-8 w-8 mr-3 text-indigo-600" />
            {t('reports.title')}
          </h1>
          <p className="text-gray-600 mt-1">
            {t('reports.subtitle')}
          </p>
          <div className="flex items-center mt-2 space-x-4 text-sm text-gray-500">
            <span className="flex items-center">
              <CheckCircle className="h-4 w-4 mr-1 text-green-500" />
              {usesFallbackData ? t('reports.sampleData') : t('reports.liveData')}
            </span>
            <span className="flex items-center">
              <Clock className="h-4 w-4 mr-1 text-blue-500" />
              {t('reports.lastUpdated', { time: format(new Date(), 'HH:mm') })}
            </span>
            {usesFallbackData && (
              <span className="flex items-center">
                <AlertTriangle className="h-4 w-4 mr-1 text-yellow-500" />
                {t('reports.demoActive')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center space-x-3">
          <Button variant="outline" size="sm" onClick={fetchAllData} className="hover:bg-blue-50 hover:border-blue-300">
            <RefreshCw className="h-4 w-4 mr-2" />
            {t('reports.refresh')}
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport('leads')} className="hover:bg-green-50 hover:border-green-300">
            <Download className="h-4 w-4 mr-2" />
            {t('reports.exportCsv')}
          </Button>
          <Button variant="outline" size="sm" className="hover:bg-purple-50 hover:border-purple-300">
            <Share2 className="h-4 w-4 mr-2" />
            {t('reports.share')}
          </Button>
        </div>
      </div>

      {/* Time Range & Filters */}
      <Card className="p-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center space-x-4">
            <Calendar className="h-5 w-5 text-gray-500" />
            <span className="font-medium text-gray-900">{t('reports.timePeriod')}</span>
            <Select value={timeRange} onValueChange={(value: string) => setTimeRange(value as TimeRange)}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">{t('reports.range.today')}</SelectItem>
                <SelectItem value="week">{t('reports.range.week')}</SelectItem>
                <SelectItem value="month">{t('reports.range.month')}</SelectItem>
                <SelectItem value="quarter">{t('reports.range.quarter')}</SelectItem>
                <SelectItem value="year">{t('reports.range.year')}</SelectItem>
                <SelectItem value="custom">{t('reports.range.custom')}</SelectItem>
              </SelectContent>
            </Select>
            
            {timeRange === 'custom' && (
              <div className="flex items-center space-x-2">
                <input
                  type="date"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                />
                <span className="text-gray-500">{t('reports.to')}</span>
                <input
                  type="date"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                  className="px-3 py-2 border rounded-md text-sm"
                />
              </div>
            )}
          </div>
          
          <div className="flex items-center space-x-4">
            <label className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={includeTeam}
                onChange={(e) => setIncludeTeam(e.target.checked)}
                className="rounded border-gray-300"
              />
              <span className="text-sm text-gray-700">{t('reports.includeTeam')}</span>
            </label>
          </div>
        </div>
      </Card>

      {/* Main Content Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-6 bg-white border shadow-sm p-1 h-16 rounded-lg">
          <TabsTrigger 
            value="overview" 
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <BarChart3 className="h-4 w-4" />
            <span>{t('reports.tabs.overview')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="performance"
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <Award className="h-4 w-4" />
            <span>{t('reports.tabs.performance')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="pipeline"
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <TrendingUp className="h-4 w-4" />
            <span>{t('reports.tabs.pipeline')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="sources"
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <Zap className="h-4 w-4" />
            <span>{t('reports.tabs.sources')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="geographic"
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <Globe className="h-4 w-4" />
            <span>{t('reports.tabs.geographic')}</span>
          </TabsTrigger>
          <TabsTrigger 
            value="activity"
            className="flex items-center space-x-2 text-gray-700 font-medium data-[state=active]:bg-indigo-50 data-[state=active]:text-indigo-700 data-[state=active]:border-indigo-200 data-[state=active]:shadow-sm hover:bg-gray-50 transition-all duration-200 rounded-md"
          >
            <Activity className="h-4 w-4" />
            <span>{t('reports.tabs.activity')}</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          {/* Fallback Data Warning */}
          {usesFallbackData && (
            <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4 rounded-md">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-yellow-400" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-yellow-700">
                    <strong>{t('reports.demoMode')}</strong> {t('reports.demoModeBody')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* KPI Cards */}
          {kpiData && (
            <>
              <div className="mb-4">
                <h2 className="text-xl font-semibold text-gray-900 flex items-center">
                  <BarChart3 className="h-5 w-5 mr-2 text-indigo-500" />
                  {t('reports.kpi')}
                  <span className="ml-2 text-sm text-gray-500">
                    ({format(new Date(kpiData.period.start_date), 'MMM dd')} - {format(new Date(kpiData.period.end_date), 'MMM dd, yyyy')})
                  </span>
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {kpiData.kpi_metrics.map((metric, index) => (
                  <KPICard
                    key={metric.name}
                    metric={metric}
                    icon={
                      index === 0 ? <Users className="h-6 w-6 text-white" /> :
                      index === 1 ? <Target className="h-6 w-6 text-white" /> :
                      index === 2 ? <DollarSign className="h-6 w-6 text-white" /> :
                      <TrendingUp className="h-6 w-6 text-white" />
                    }
                    color={
                      index === 0 ? "bg-blue-500" :
                      index === 1 ? "bg-green-500" :
                      index === 2 ? "bg-purple-500" :
                      "bg-orange-500"
                    }
                  />
                ))}
              </div>
            </>
          )}

          {/* Conversion Funnel */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <TrendingUp className="h-5 w-5 mr-2 text-indigo-500" />
              {t('reports.funnel')}
            </h2>
            {funnelData.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
                {funnelData.map((stage, index) => (
                  <FunnelStageCard
                    key={stage.stage_name}
                    stage={stage}
                    isLast={index === funnelData.length - 1}
                  />
                ))}
              </div>
            ) : (
              <Card className="p-4 sm:p-6 md:p-8 text-center">
                <PieChart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noFunnel')}</h3>
                <p className="text-gray-600">
                  {t('reports.noFunnelBody')}
                </p>
              </Card>
            )}
          </div>

          {/* Pipeline Health */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Activity className="h-5 w-5 mr-2 text-green-500" />
              {t('reports.pipelineHealth')}
            </h2>
            {pipelineHealth.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pipelineHealth.map((stage) => (
                  <Card key={stage.stage_name} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900">{stage.stage_name}</h3>
                      <Badge variant={
                        stage.bottleneck_risk === 'low' ? 'default' :
                        stage.bottleneck_risk === 'medium' ? 'outline' : 'destructive'
                      }>
                        <AlertCircle className="h-3 w-3 mr-1" />
                        {stage.bottleneck_risk.toUpperCase()}
                      </Badge>
                    </div>
                    <div className="space-y-3">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.leads')}</span>
                        <span className="font-medium">{new Intl.NumberFormat('tr-TR').format(stage.lead_count)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.totalValue')}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(stage.total_value)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.avgDealSize')}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD' }).format(stage.average_deal_size)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.stageVelocity')}</span>
                        <span className="font-medium text-blue-600">{stage.stage_velocity_days.toFixed(1)} {t('reports.labels.days')}</span>
                      </div>
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-gray-500 mb-1">
                          <span>{t('reports.labels.forecastCloseRate')}</span>
                          <span>{stage.forecasted_close_rate.toFixed(1)}%</span>
                        </div>
                        <Progress value={stage.forecasted_close_rate} className="h-2" />
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-4 sm:p-6 md:p-8 text-center">
                <LineChart className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noPipeline')}</h3>
                <p className="text-gray-600">
                  {t('reports.noPipelineBody')}
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Performance Tab */}
        <TabsContent value="performance" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Award className="h-5 w-5 mr-2 text-yellow-500" />
              {t('reports.userPerformance')}
            </h2>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {userPerformance.map((user) => (
                <Card key={user.user_id} className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">{user.user_name}</h3>
                      <p className="text-sm text-gray-600">{user.user_email}</p>
                    </div>
                    <Badge variant={user.conversion_rate >= 20 ? 'default' : user.conversion_rate >= 10 ? 'outline' : 'destructive'}>
                      {user.conversion_rate.toFixed(1)}% {t('reports.labels.cr')}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.totalLeads')}</span>
                        <span className="font-medium">{user.total_leads}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.qualified')}</span>
                        <span className="font-medium text-green-600">{user.qualified_leads}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.dealsWon')}</span>
                        <span className="font-medium text-blue-600">{user.deals_won}</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.revenue')}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('tr-TR', { 
                            style: 'currency', 
                            currency: 'USD',
                            maximumFractionDigits: 0
                          }).format(user.total_revenue)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.avgDeal')}</span>
                        <span className="font-medium">
                          {new Intl.NumberFormat('tr-TR', { 
                            style: 'currency', 
                            currency: 'USD',
                            maximumFractionDigits: 0
                          }).format(user.average_deal_size)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-sm text-gray-600">{t('reports.labels.activities')}</span>
                        <span className="font-medium">{user.activities_count}</span>
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Pipeline Tab */}
        <TabsContent value="pipeline" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <BarChart3 className="h-5 w-5 mr-2 text-indigo-500" />
              {t('reports.detailedPipeline')}
            </h2>
            <div className="space-y-6">
              {pipelineHealth.map((stage) => (
                <Card key={stage.stage_name} className="p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-3">
                      <div className={`w-4 h-4 rounded-full ${
                        stage.bottleneck_risk === 'low' ? 'bg-green-500' :
                        stage.bottleneck_risk === 'medium' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}></div>
                      <h3 className="text-lg font-semibold text-gray-900">{stage.stage_name}</h3>
                    </div>
                    <div className="flex items-center space-x-4">
                      <Badge variant={
                        stage.bottleneck_risk === 'low' ? 'default' :
                        stage.bottleneck_risk === 'medium' ? 'outline' : 'destructive'
                      }>
                        {t('reports.risk', { level: stage.bottleneck_risk.toUpperCase() })}
                      </Badge>
                      <span className="text-sm text-gray-500">
                        {t('reports.forecastPct', { value: stage.forecasted_close_rate.toFixed(1) })}
                      </span>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-gray-900">{stage.lead_count}</div>
                      <div className="text-sm text-gray-600">{t('reports.labels.activeLeads')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">
                        {new Intl.NumberFormat('tr-TR', { 
                          style: 'currency', 
                          currency: 'USD',
                          maximumFractionDigits: 0
                        }).format(stage.total_value)}
                      </div>
                      <div className="text-sm text-gray-600">{t('reports.labels.totalValue')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">
                        {new Intl.NumberFormat('tr-TR', { 
                          style: 'currency', 
                          currency: 'USD',
                          maximumFractionDigits: 0
                        }).format(stage.average_deal_size)}
                      </div>
                      <div className="text-sm text-gray-600">{t('reports.labels.avgDealSize')}</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-purple-600">
                        {stage.stage_velocity_days.toFixed(1)}
                      </div>
                      <div className="text-sm text-gray-600">{t('reports.labels.daysInStage')}</div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Lead Sources Tab */}
        <TabsContent value="sources" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Zap className="h-5 w-5 mr-2 text-yellow-500" />
              {t('reports.leadSources')}
            </h2>
            {leadSources.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {leadSources.map((source) => (
                  <Card key={source.source} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        <Globe className="h-4 w-4 mr-2 text-gray-500" />
                        {source.source}
                      </h3>
                      <div className="flex items-center space-x-2">
                        <Badge variant={source.quality_score >= 70 ? 'default' : source.quality_score >= 40 ? 'outline' : 'destructive'}>
                          {source.quality_score.toFixed(1)}% {t('reports.labels.quality')}
                        </Badge>
                      </div>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <div className="text-lg font-bold text-gray-900">{new Intl.NumberFormat('tr-TR').format(source.total_leads)}</div>
                          <div className="text-sm text-gray-600">{t('reports.labels.totalLeads')}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-green-600">{new Intl.NumberFormat('tr-TR').format(source.qualified_leads)}</div>
                          <div className="text-sm text-gray-600">{t('reports.labels.qualified')}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-blue-600">{source.deals_won}</div>
                          <div className="text-sm text-gray-600">{t('reports.labels.wonDeals')}</div>
                        </div>
                        <div>
                          <div className="text-lg font-bold text-purple-600">
                            {source.conversion_rate.toFixed(1)}%
                          </div>
                          <div className="text-sm text-gray-600">{t('reports.labels.conversion')}</div>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">{t('reports.labels.totalRevenue')}</span>
                          <span className="font-semibold text-green-600">
                            {new Intl.NumberFormat('tr-TR', { 
                              style: 'currency', 
                              currency: 'USD',
                              maximumFractionDigits: 0
                            }).format(source.total_revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{t('reports.labels.roi')}</span>
                          <span className={`font-semibold ${source.roi_percentage > 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {source.roi_percentage > 0 ? '+' : ''}{source.roi_percentage.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-4 sm:p-6 md:p-8 text-center">
                <MapPin className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noSources')}</h3>
                <p className="text-gray-600">
                  {t('reports.noSourcesBody')}
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Geographic Tab */}
        <TabsContent value="geographic" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Globe className="h-5 w-5 mr-2 text-blue-500" />
              {t('reports.geographic')}
            </h2>
            {geoInsights.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {geoInsights.map((geo, index) => (
                  <Card key={`${geo.country}-${index}`} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 flex items-center">
                          <MapPin className="h-4 w-4 mr-2 text-gray-500" />
                          {geo.country}
                        </h3>
                        {geo.city && <p className="text-sm text-gray-600 ml-6">{geo.city}</p>}
                      </div>
                      <Badge variant={geo.conversion_rate >= 15 ? 'default' : geo.conversion_rate >= 8 ? 'outline' : 'destructive'}>
                        {geo.conversion_rate.toFixed(1)}% {t('reports.labels.cr')}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.leads')}</span>
                          <span className="font-medium">{new Intl.NumberFormat('tr-TR').format(geo.lead_count)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.deals')}</span>
                          <span className="font-medium text-blue-600">{geo.deal_count}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.revenue')}</span>
                          <span className="font-medium text-green-600">
                            {new Intl.NumberFormat('tr-TR', { 
                              style: 'currency', 
                              currency: 'USD',
                              maximumFractionDigits: 0,
                              notation: 'compact'
                            }).format(geo.total_revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.avgDeal')}</span>
                          <span className="font-medium">
                            {new Intl.NumberFormat('tr-TR', { 
                              style: 'currency', 
                              currency: 'USD',
                              maximumFractionDigits: 0,
                              notation: 'compact'
                            }).format(geo.average_deal_size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <Globe className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noGeo')}</h3>
                <p className="text-gray-600">
                  {t('reports.noGeoBody')}
                </p>
              </Card>
            )}
          </div>

          {/* Sector Analysis */}
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Briefcase className="h-5 w-5 mr-2 text-indigo-500" />
              {t('reports.sectorAnalysis')}
            </h2>
            {sectorAnalysis.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {sectorAnalysis.map((sector) => (
                  <Card key={sector.sector} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-semibold text-gray-900 flex items-center">
                        <Briefcase className="h-4 w-4 mr-2 text-gray-500" />
                        {sector.sector}
                      </h3>
                      <Badge variant={sector.conversion_rate >= 15 ? 'default' : sector.conversion_rate >= 8 ? 'outline' : 'destructive'}>
                        {sector.conversion_rate.toFixed(1)}% {t('reports.labels.cr')}
                      </Badge>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.leads')}</span>
                          <span className="font-medium">{new Intl.NumberFormat('tr-TR').format(sector.lead_count)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.deals')}</span>
                          <span className="font-medium text-blue-600">{sector.deal_count}</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.revenue')}</span>
                          <span className="font-medium text-green-600">
                            {new Intl.NumberFormat('tr-TR', { 
                              style: 'currency', 
                              currency: 'USD',
                              maximumFractionDigits: 0,
                              notation: 'compact'
                            }).format(sector.total_revenue)}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">{t('reports.labels.avgDeal')}</span>
                          <span className="font-medium">
                            {new Intl.NumberFormat('tr-TR', { 
                              style: 'currency', 
                              currency: 'USD',
                              maximumFractionDigits: 0,
                              notation: 'compact'
                            }).format(sector.average_deal_size)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <Briefcase className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noSector')}</h3>
                <p className="text-gray-600">
                  {t('reports.noSectorBody')}
                </p>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Activity Tab */}
        <TabsContent value="activity" className="space-y-6">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 mb-4 flex items-center">
              <Activity className="h-5 w-5 mr-2 text-green-500" />
              {t('reports.teamActivity')}
            </h2>
            {activityReports.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {activityReports.map((report) => (
                  <Card key={report.user_email} className="p-6 hover:shadow-lg transition-shadow">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-gray-900 flex items-center">
                          <Users className="h-4 w-4 mr-2 text-gray-500" />
                          {report.user_name}
                        </h3>
                        <p className="text-sm text-gray-600 ml-6">{report.user_email}</p>
                      </div>
                      <Badge variant={report.activity_success_rate >= 80 ? 'default' : report.activity_success_rate >= 60 ? 'outline' : 'destructive'}>
                        {report.activity_success_rate.toFixed(1)}% {t('reports.labels.success')}
                      </Badge>
                    </div>
                    
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="flex items-center justify-center mb-2">
                            <Phone className="h-4 w-4 text-blue-500 mr-1" />
                            <span className="text-lg font-bold text-gray-900">{report.calls_made}</span>
                          </div>
                          <div className="text-xs text-gray-600">{t('reports.labels.calls')}</div>
                        </div>
                        <div>
                          <div className="flex items-center justify-center mb-2">
                            <Mail className="h-4 w-4 text-green-500 mr-1" />
                            <span className="text-lg font-bold text-gray-900">{report.emails_sent}</span>
                          </div>
                          <div className="text-xs text-gray-600">{t('reports.labels.emails')}</div>
                        </div>
                        <div>
                          <div className="flex items-center justify-center mb-2">
                            <MessageSquare className="h-4 w-4 text-purple-500 mr-1" />
                            <span className="text-lg font-bold text-gray-900">{report.meetings_held}</span>
                          </div>
                          <div className="text-xs text-gray-600">{t('reports.labels.meetings')}</div>
                        </div>
                      </div>
                      
                      <div className="pt-4 border-t">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">{t('reports.labels.totalActivities')}</span>
                          <span className="font-semibold">{new Intl.NumberFormat('tr-TR').format(report.total_activities)}</span>
                        </div>
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-sm text-gray-600">{t('reports.labels.tasksCompleted')}</span>
                          <span className="font-semibold text-green-600">{report.tasks_completed}</span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-sm text-gray-600">{t('reports.labels.avgResponse')}</span>
                          <span className="font-semibold text-blue-600">{report.average_response_time.toFixed(1)}h</span>
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              <Card className="p-8 text-center">
                <Activity className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 mb-2">{t('reports.noActivity')}</h3>
                <p className="text-gray-600">
                  {t('reports.noActivityBody')}
                </p>
              </Card>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
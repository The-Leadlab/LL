import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Brain, 
  MessageCircle, 
  Target, 
  TrendingUp, 
  Users, 
  Clock, 
  Mail, 
  Phone, 
  Calendar,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  PieChart,
  RefreshCw,
  Download,
  Share2,
  Lightbulb,
  Star,
  Zap,
  Shield,
  Heart
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import api from '@/services/axios';
import { psychometricService } from '@/services/psychometricService';
import type { BehavioralPrediction } from '@/services/psychometricService';

interface PsychometricData {
  lead_id: number;
  analysis_methods: string[];
  crystal_knows_data?: any;
  internal_analysis?: any;
  combined_insights: {
    personality_type: string;
    personality_description: string;
    disc_scores: Record<string, number>;
    big_five: Record<string, number>;
    communication_style: {
      primary_style: string;
      preferences: string[];
      internal_recommendations: string[];
    };
    sales_insights: {
      approach: string;
      objections: string[];
      motivators: string[];
      decision_style: string;
    };
    behavioral_predictions: {
      work_style: string;
      stress_response: string;
      team_role: string;
      leadership_style: string;
    };
    strengths: string[];
    confidence_score: number;
    data_sources: string[];
  };
  personality_wheel: {
    disc_wheel: Record<string, number>;
    big_five_radar: Record<string, number>;
  };
  sales_intelligence: {
    primary_approach: string;
    presentation_style: string;
    closing_technique: string;
    objection_handling: string;
    follow_up_style: string;
    meeting_recommendations?: {
      optimal_duration: string;
      best_time: string;
      preparation_tips: string[];
      agenda_style: string;
    };
    email_guidelines?: {
      subject_line_style: string;
      message_length: string;
      tone: string;
      call_to_action: string;
    };
    negotiation_strategy?: {
      approach: string;
      concession_strategy: string;
      decision_timeline: string;
    };
    likely_objections?: string[];
    key_motivators?: string[];
    decision_making_style?: string;
  };
  confidence_score: number;
}

interface PsychometricInsightsProps {
  leadId: number;
  leadName?: string;
}

const PsychometricInsights: React.FC<PsychometricInsightsProps> = ({ leadId, leadName }) => {
  const queryClient = useQueryClient();
  const [psychometricData, setPsychometricData] = useState<PsychometricData | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasAnalyzed, setHasAnalyzed] = useState(false);

  const {
    data: behavioralPredictions,
    isLoading: loadingPredictions,
    error: predictionsQueryError,
    refetch: refetchBehavioralPredictions,
  } = useQuery({
    queryKey: ['behavioral-predictions', leadId],
    queryFn: () => psychometricService.getBehavioralPredictions(leadId),
    enabled: Boolean(leadId),
    staleTime: 120_000,
  });

  const loadPsychometricData = async (refresh = false) => {
    if (refresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      const response = await api.get(`/ai-insights/${leadId}/psychometric`, {
        params: { use_crystal: false, refresh }
      });

      if (response.data.success) {
        setPsychometricData(response.data.data);
        setHasAnalyzed(true);
        queryClient.invalidateQueries({ queryKey: ['behavioral-predictions', leadId] });
        toast.success('Psychometric analysis completed successfully!');
      } else {
        throw new Error('Failed to load psychometric data');
      }
    } catch (err: any) {
      const errorMessage = err.response?.data?.detail || 'Failed to load psychometric insights';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const handleAnalyze = () => {
    loadPsychometricData(false);
  };

  const handleRefresh = () => {
    loadPsychometricData(true);
  };

  const handleExportInsights = () => {
    if (!psychometricData) {
      toast.error('No psychometric data to export yet.');
      return;
    }
    const payload = {
      lead_id: leadId,
      lead_name: leadName ?? null,
      exported_at: new Date().toISOString(),
      psychometric: psychometricData,
      behavioral_predictions: behavioralPredictions ?? null,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `lead-${leadId}-psychometric-insights.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Insights exported');
  };

  const handleShareInsights = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: leadName ? `Psychometric insights — ${leadName}` : 'Psychometric insights',
          url,
        });
      } else {
        await navigator.clipboard.writeText(url);
        toast.success('Page link copied to clipboard');
      }
    } catch (e: unknown) {
      if ((e as Error)?.name === 'AbortError') return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Page link copied to clipboard');
      } catch {
        toast.error('Could not share or copy link');
      }
    }
  };

  const getPersonalityColor = (type: string): string => {
    const colors: Record<string, string> = {
      'D': '#EF4444', // Red
      'I': '#F59E0B', // Amber
      'S': '#10B981', // Emerald
      'C': '#3B82F6', // Blue
    };
    return colors[type[0]] || '#6B7280';
  };

  const getConfidenceLevel = (score: number): { label: string; color: string } => {
    if (score >= 0.8) return { label: 'High', color: 'bg-green-100 text-green-800' };
    if (score >= 0.6) return { label: 'Medium', color: 'bg-yellow-100 text-yellow-800' };
    return { label: 'Low', color: 'bg-red-100 text-red-800' };
  };

  const renderPersonalityWheel = () => {
    if (!psychometricData?.personality_wheel) return null;

    const { disc_wheel } = psychometricData.personality_wheel;
    
    return (
      <div className="relative w-32 h-32 mx-auto">
        <svg width="128" height="128" viewBox="0 0 148 148" className="w-full h-full">
          {/* Background circle */}
          <circle cx="74" cy="74" r="48" fill="none" stroke="#E5E7EB" strokeWidth="2" />
          
          {/* DISC segments */}
          {Object.entries(disc_wheel).map(([key, value], index) => {
            const angle = (index * 90) - 90; // Start from top
            const length = (48 * Math.min(value / 100, 1)); // Max length is radius
            const x2 = 74 + length * Math.cos((angle * Math.PI) / 180);
            const y2 = 74 + length * Math.sin((angle * Math.PI) / 180);
            
            // Text positioning - on the circle edge with margin
            const textRadius = 58;
            const textX = 74 + textRadius * Math.cos((angle * Math.PI) / 180);
            const textY = 74 + textRadius * Math.sin((angle * Math.PI) / 180);
            
            return (
              <g key={key}>
                {/* Score line */}
                <line
                  x1="74"
                  y1="74"
                  x2={x2}
                  y2={y2}
                  stroke={getPersonalityColor(key)}
                  strokeWidth="4"
                  strokeLinecap="round"
                  opacity="0.9"
                />
                
                {/* DISC letter with background circle */}
                <circle
                  cx={textX}
                  cy={textY}
                  r="11"
                  fill={getPersonalityColor(key)}
                  stroke="white"
                  strokeWidth="2"
                />
                <text
                  x={textX}
                  y={textY + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-bold"
                  fill="white"
                  style={{ fontSize: '14px' }}
                >
                  {key}
                </text>
                
                {/* Percentage label - closer to center */}
                <text
                  x={74 + (textRadius - 22) * Math.cos((angle * Math.PI) / 180)}
                  y={74 + (textRadius - 22) * Math.sin((angle * Math.PI) / 180)}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="font-medium"
                  fill="#374151"
                  style={{ fontSize: '9px' }}
                >
                  {Math.round(value)}%
                </text>
              </g>
            );
          })}
          
          {/* Center circle with primary type */}
          <circle cx="74" cy="74" r="14" fill="white" stroke="#E5E7EB" strokeWidth="2" />
          <circle 
            cx="74" 
            cy="74" 
            r="11" 
            fill={getPersonalityColor(psychometricData.combined_insights.personality_type[0])} 
          />
          <text 
            x="74" 
            y="78" 
            textAnchor="middle" 
            dominantBaseline="middle"
            className="font-bold"
            fill="white"
            style={{ fontSize: '16px' }}
          >
            {psychometricData.combined_insights.personality_type[0]}
          </text>
        </svg>
      </div>
    );
  };

  const renderBigFiveRadar = () => {
    if (!psychometricData?.personality_wheel?.big_five_radar) return null;

    const data = psychometricData.personality_wheel.big_five_radar;
    const traits = Object.keys(data);
    const values = Object.values(data);
    
    const points = traits.map((trait, index) => {
      const angle = (index * (360 / traits.length)) - 90;
      const value = values[index];
      const x = 72 + (45 * value / 100) * Math.cos((angle * Math.PI) / 180);
      const y = 72 + (45 * value / 100) * Math.sin((angle * Math.PI) / 180);
      return `${x},${y}`;
    }).join(' ');

    return (
      <div className="relative w-36 h-36 mx-auto">
        <svg width="144" height="144" viewBox="0 0 144 144" className="w-full h-full">
          {/* Background pentagon */}
          {[15, 30, 45].map(radius => (
            <polygon
              key={radius}
              points={traits.map((_, index) => {
                const angle = (index * (360 / traits.length)) - 90;
                const x = 72 + radius * Math.cos((angle * Math.PI) / 180);
                const y = 72 + radius * Math.sin((angle * Math.PI) / 180);
                return `${x},${y}`;
              }).join(' ')}
              fill="none"
              stroke="#E5E7EB"
              strokeWidth="1"
            />
          ))}
          
          {/* Trait lines */}
          {traits.map((trait, index) => {
            const angle = (index * (360 / traits.length)) - 90;
            const x = 72 + 45 * Math.cos((angle * Math.PI) / 180);
            const y = 72 + 45 * Math.sin((angle * Math.PI) / 180);
            return (
              <line
                key={trait}
                x1="72"
                y1="72"
                x2={x}
                y2={y}
                stroke="#E5E7EB"
                strokeWidth="1"
              />
            );
          })}
          
          {/* Data polygon */}
          <polygon
            points={points}
            fill="rgba(59, 130, 246, 0.2)"
            stroke="#3B82F6"
            strokeWidth="2"
          />
          
          {/* Data points */}
          {traits.map((trait, index) => {
            const angle = (index * (360 / traits.length)) - 90;
            const value = values[index];
            const x = 72 + (45 * value / 100) * Math.cos((angle * Math.PI) / 180);
            const y = 72 + (45 * value / 100) * Math.sin((angle * Math.PI) / 180);
            return (
              <circle
                key={trait}
                cx={x}
                cy={y}
                r="2.5"
                fill="#3B82F6"
              />
            );
          })}
          
          {/* Labels with background circles */}
          {traits.map((trait, index) => {
            const angle = (index * (360 / traits.length)) - 90;
            const x = 72 + 58 * Math.cos((angle * Math.PI) / 180);
            const y = 72 + 58 * Math.sin((angle * Math.PI) / 180);
            return (
              <g key={trait}>
                <circle
                  cx={x}
                  cy={y}
                  r="8"
                  fill="#3B82F6"
                  stroke="white"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y + 1}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  className="text-xs font-bold"
                  fill="white"
                  style={{ fontSize: '10px' }}
                >
                  {trait.charAt(0).toUpperCase()}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    );
  };

  // SafeGuards: psychometricData ve sales_intelligence kontrolü
  const sales_intelligence = psychometricData?.sales_intelligence || {};
  const meeting_recommendations = (sales_intelligence as any).meeting_recommendations || {};
  const email_guidelines = (sales_intelligence as any).email_guidelines || {};
  const negotiation_strategy = (sales_intelligence as any).negotiation_strategy || {};
  const combined_insights = psychometricData?.combined_insights || {};

  // Do not auto-run analysis on mount/save — only when the user clicks Analyze.

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Psychometric Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-20 bg-gray-200 rounded mb-4"></div>
              <div className="h-32 bg-gray-200 rounded"></div>
            </div>
            <div className="text-center text-sm text-gray-500">
              Analyzing personality traits and behavioral patterns...
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Show initial state if no analysis has been done yet
  if (!hasAnalyzed && !error && !psychometricData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Psychometric Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8">
            <Brain className="w-16 h-16 text-blue-400 mx-auto mb-4" />
            <h3 className="font-medium text-gray-900 mb-2">Ready for Psychometric Analysis</h3>
            <p className="text-gray-500 mb-6 max-w-md mx-auto">
              Get detailed personality insights, communication preferences, and sales strategies 
              tailored specifically for {leadName || 'this lead'}.
            </p>
            <Button onClick={handleAnalyze} variant="outline">
              <Brain className="w-4 h-4 mr-2" />
              Start Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error || !psychometricData) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            Psychometric Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">{error || 'No psychometric data available'}</p>
            <div className="flex gap-2 justify-center">
              <Button onClick={handleAnalyze} variant="outline">
                <Brain className="w-4 h-4 mr-2" />
                Try Analysis
              </Button>
              {hasAnalyzed && (
                <Button onClick={handleRefresh} variant="outline">
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Retry
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { confidence_score } = psychometricData;
  const confidenceLevel = getConfidenceLevel(confidence_score);

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Brain className="w-5 h-5" />
              Psychometric Insights
              {psychometricData.analysis_methods.includes('crystal_knows') && (
                <Badge variant="secondary" className="ml-2">
                  <Star className="w-3 h-3 mr-1" />
                  Crystal Knows
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              <Badge className={confidenceLevel.color}>
                {confidenceLevel.label} Confidence
              </Badge>
              {!hasAnalyzed ? (
                <Button
                  onClick={handleAnalyze}
                  disabled={loading}
                  variant="outline"
                >
                  <Brain className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                  Analyze
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={refreshing}
                >
                  <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        
        <CardContent>
          {/* Personality Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Personality Type */}
            <div className="text-center">
              <div 
                className="w-16 h-16 rounded-full flex items-center justify-center text-white font-bold text-2xl mx-auto mb-3"
                style={{ backgroundColor: getPersonalityColor(combined_insights.personality_type) }}
              >
                {combined_insights.personality_type[0]}
              </div>
              <h3 className="font-semibold text-lg">{combined_insights.personality_type} Personality</h3>
              <p className="text-sm text-gray-600 mt-1">{combined_insights.personality_description}</p>
            </div>
            
            {/* DISC Wheel */}
            <div className="text-center">
              <h4 className="font-medium mb-3">DISC Profile</h4>
              {renderPersonalityWheel()}
              <div className="grid grid-cols-2 gap-1 mt-2 text-xs">
                {Object.entries(psychometricData.personality_wheel.disc_wheel).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1">
                    <div 
                      className="w-2 h-2 rounded-full"
                      style={{ backgroundColor: getPersonalityColor(key) }}
                    />
                    <span>{key}: {Math.round(value)}%</span>
                  </div>
                ))}
              </div>
            </div>
            
            {/* Big Five Radar */}
            <div className="text-center">
              <h4 className="font-medium mb-3">Big Five Traits</h4>
              {renderBigFiveRadar()}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Detailed Analysis Tabs */}
      <Card>
        <CardContent className="p-0">
          <Tabs defaultValue="communication" className="w-full">
            <TabsList className="w-full justify-start">
              <TabsTrigger value="communication" className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Communication
              </TabsTrigger>
              <TabsTrigger value="sales" className="flex items-center gap-2">
                <Target className="w-4 h-4" />
                Sales Strategy
              </TabsTrigger>
              <TabsTrigger value="behavioral" className="flex items-center gap-2">
                <Users className="w-4 h-4" />
                Behavioral
              </TabsTrigger>
              <TabsTrigger value="predictions" className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Predictions
              </TabsTrigger>
            </TabsList>
            
            {/* Communication Tab */}
            <TabsContent value="communication" className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Communication Style */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <MessageCircle className="w-4 h-4" />
                    Communication Style
                  </h4>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="font-medium text-blue-800 mb-2">
                      Primary Style: {combined_insights.communication_style.primary_style}
                    </div>
                    <div className="space-y-2">
                      <div>
                        <div className="text-sm font-medium text-blue-700 mb-1">Preferences:</div>
                        <div className="flex flex-wrap gap-1">
                          {combined_insights.communication_style.preferences.map((pref, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {pref}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Email Guidelines */}
                <div className="space-y-4">
                  <h4 className="font-semibold flex items-center gap-2">
                    <Mail className="w-4 h-4" />
                    Email Guidelines
                  </h4>
                  <div className="space-y-3">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium mb-1">Subject Line:</div>
                      <div className="text-sm text-gray-700">{email_guidelines?.subject_line_style || 'Not available'}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium mb-1">Message Length:</div>
                      <div className="text-sm text-gray-700">{email_guidelines?.message_length || 'Not available'}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm font-medium mb-1">Tone:</div>
                      <div className="text-sm text-gray-700">{email_guidelines?.tone || 'Not available'}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Meeting Recommendations */}
              <div className="mt-6">
                <h4 className="font-semibold flex items-center gap-2 mb-4">
                  <Calendar className="w-4 h-4" />
                  Meeting Recommendations
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="font-medium text-green-800 mb-2">Optimal Duration</div>
                    <div className="text-sm text-green-700">{meeting_recommendations?.optimal_duration || 'Not available'}</div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="font-medium text-purple-800 mb-2">Best Time</div>
                    <div className="text-sm text-purple-700">{meeting_recommendations?.best_time || 'Not available'}</div>
                  </div>
                  <div className="p-4 bg-orange-50 rounded-lg">
                    <div className="font-medium text-orange-800 mb-2">Agenda Style</div>
                    <div className="text-sm text-orange-700">{meeting_recommendations?.agenda_style || 'Not available'}</div>
                  </div>
                </div>
                
                <div className="mt-4">
                  <div className="font-medium mb-2">Preparation Tips:</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {meeting_recommendations?.preparation_tips?.map((tip, index) => (
                      <div key={index} className="flex items-start gap-2">
                        <CheckCircle className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span className="text-sm">{tip}</span>
                      </div>
                    )) || <div className="text-sm text-gray-500">No preparation tips available</div>}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Sales Strategy Tab */}
            <TabsContent value="sales" className="p-6 space-y-6">
              {/* Sales Approach */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-4">
                  <Target className="w-4 h-4" />
                  Sales Strategy
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <div className="font-medium text-blue-800 mb-2">Primary Approach</div>
                      <div className="text-sm text-blue-700">{sales_intelligence.primary_approach}</div>
                    </div>
                    <div className="p-4 bg-green-50 rounded-lg">
                      <div className="font-medium text-green-800 mb-2">Presentation Style</div>
                      <div className="text-sm text-green-700">{sales_intelligence.presentation_style}</div>
                    </div>
                    <div className="p-4 bg-purple-50 rounded-lg">
                      <div className="font-medium text-purple-800 mb-2">Closing Technique</div>
                      <div className="text-sm text-purple-700">{sales_intelligence.closing_technique}</div>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="p-4 bg-orange-50 rounded-lg">
                      <div className="font-medium text-orange-800 mb-2">Objection Handling</div>
                      <div className="text-sm text-orange-700">{sales_intelligence.objection_handling}</div>
                    </div>
                    <div className="p-4 bg-red-50 rounded-lg">
                      <div className="font-medium text-red-800 mb-2">Follow-up Style</div>
                      <div className="text-sm text-red-700">{sales_intelligence.follow_up_style}</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Negotiation Strategy */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-4">
                  <Zap className="w-4 h-4" />
                  Negotiation Strategy
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="font-medium mb-2">Approach</div>
                    <div className="text-sm text-gray-700">{negotiation_strategy?.approach || 'Not available'}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="font-medium mb-2">Concession Strategy</div>
                    <div className="text-sm text-gray-700">{negotiation_strategy?.concession_strategy || 'Not available'}</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="font-medium mb-2">Decision Timeline</div>
                    <div className="text-sm text-gray-700">{negotiation_strategy?.decision_timeline || 'Not available'}</div>
                  </div>
                </div>
              </div>

              {/* Motivators & Strengths */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Heart className="w-4 h-4" />
                    Key Motivators
                  </h4>
                  <div className="space-y-2">
                    {sales_intelligence.key_motivators?.map((motivator, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Lightbulb className="w-4 h-4 text-yellow-500" />
                        <span className="text-sm">{motivator}</span>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Star className="w-4 h-4" />
                    Key Strengths
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {combined_insights.strengths.map((strength, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {strength}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* Behavioral Tab */}
            <TabsContent value="behavioral" className="p-6 space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4" />
                    Work Style
                  </h4>
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-blue-700">{combined_insights.behavioral_predictions.work_style}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Shield className="w-4 h-4" />
                    Stress Response
                  </h4>
                  <div className="p-4 bg-red-50 rounded-lg">
                    <div className="text-sm text-red-700">{combined_insights.behavioral_predictions.stress_response}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <Users className="w-4 h-4" />
                    Team Role
                  </h4>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-green-700">{combined_insights.behavioral_predictions.team_role}</div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4" />
                    Leadership Style
                  </h4>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-purple-700">{combined_insights.behavioral_predictions.leadership_style}</div>
                  </div>
                </div>
              </div>

              {/* Decision Making */}
              <div>
                <h4 className="font-semibold flex items-center gap-2 mb-3">
                  <Clock className="w-4 h-4" />
                  Decision Making Style
                </h4>
                <div className="p-4 bg-gray-50 rounded-lg">
                  <div className="text-sm text-gray-700">{sales_intelligence.decision_making_style || 'Not available'}</div>
                </div>
              </div>
            </TabsContent>

            {/* Predictions Tab */}
            <TabsContent value="predictions" className="p-6">
              {loadingPredictions && (
                <div className="flex flex-col items-center justify-center py-10 text-sm text-gray-500">
                  <RefreshCw className="w-8 h-8 mb-3 animate-spin text-primary-500" />
                  Loading behavioral predictions…
                </div>
              )}
              {predictionsQueryError && !loadingPredictions && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                  Could not load behavioral predictions. Use “Check for updates” to retry.
                </div>
              )}
              {!loadingPredictions && !predictionsQueryError && behavioralPredictions && (
                <div className="space-y-8">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-2">Decision making</h4>
                      <p className="text-sm text-gray-700">
                        <strong>Style:</strong> {(behavioralPredictions as BehavioralPrediction).decision_making?.style}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>Timeline:</strong> {(behavioralPredictions as BehavioralPrediction).decision_making?.timeline}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        <strong>Influencers:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).decision_making?.influencers || []).join(', ') || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Information needs:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).decision_making?.information_needs || []).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-2">Communication preferences</h4>
                      <p className="text-sm text-gray-700">
                        <strong>Channels:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).communication_preferences?.channel_priority || []).join(', ') || '—'}
                      </p>
                      <p className="text-sm text-gray-700 mt-1">
                        <strong>Frequency:</strong>{' '}
                        {(behavioralPredictions as BehavioralPrediction).communication_preferences?.frequency}
                      </p>
                      <p className="text-sm text-gray-600 mt-2">
                        <strong>Message style:</strong>{' '}
                        {(behavioralPredictions as BehavioralPrediction).communication_preferences?.message_style}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-2">Stress response</h4>
                      <p className="text-sm text-gray-600">
                        <strong>Triggers:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).stress_response?.triggers || []).join(', ') || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Indicators:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).stress_response?.indicators || []).join(', ') || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Management:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).stress_response?.management || []).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="rounded-lg border border-gray-100 bg-white p-4 shadow-sm">
                      <h4 className="font-semibold text-gray-900 mb-2">Motivation</h4>
                      <p className="text-sm text-gray-600">
                        <strong>Drivers:</strong>{' '}
                        {((behavioralPredictions as BehavioralPrediction).motivation_factors?.primary_drivers || []).join(', ') || '—'}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Recognition:</strong>{' '}
                        {(behavioralPredictions as BehavioralPrediction).motivation_factors?.recognition_style}
                      </p>
                      <p className="text-sm text-gray-600 mt-1">
                        <strong>Goals:</strong>{' '}
                        {(behavioralPredictions as BehavioralPrediction).motivation_factors?.goal_orientation}
                      </p>
                    </div>
                  </div>
                  <div className="flex justify-center">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={loadingPredictions}
                      onClick={() => refetchBehavioralPredictions()}
                    >
                      <RefreshCw className={`w-4 h-4 mr-2 ${loadingPredictions ? 'animate-spin' : ''}`} />
                      Check for updates
                    </Button>
                  </div>
                </div>
              )}
              {!loadingPredictions && !predictionsQueryError && !behavioralPredictions && (
                <div className="text-center py-8">
                  <BarChart3 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="font-medium text-gray-600 mb-2">Behavioral predictions</h3>
                  <p className="text-sm text-gray-500 mb-4">No prediction payload returned yet.</p>
                  <Button variant="outline" size="sm" onClick={() => refetchBehavioralPredictions()}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Check for updates
                  </Button>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Data Sources */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between text-sm text-gray-500">
            <div className="flex items-center gap-4">
              <span>Data Sources: {combined_insights.data_sources.join(', ')}</span>
              <span>•</span>
              <span>Confidence: {Math.round(confidence_score * 100)}%</span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" type="button" onClick={handleExportInsights}>
                <Download className="w-4 h-4 mr-1" />
                Export
              </Button>
              <Button variant="ghost" size="sm" type="button" onClick={() => void handleShareInsights()}>
                <Share2 className="w-4 h-4 mr-1" />
                Share
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PsychometricInsights; 
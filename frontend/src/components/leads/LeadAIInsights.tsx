import React, { useState } from 'react';
import { Brain, TrendingUp, User, MessageCircle, Target, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import aiInsightsService, { AIInsights } from '@/services/aiInsightsService';

interface LeadAIInsightsProps {
  leadId: number;
  leadName?: string;
}

function isValidInsights(data: unknown): data is AIInsights {
  if (!data || typeof data !== 'object') return false;
  const d = data as Partial<AIInsights>;
  return Boolean(d.lead_score && d.personality && d.recommendations);
}

const LeadAIInsights: React.FC<LeadAIInsightsProps> = ({ leadId }) => {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [hasAttempted, setHasAttempted] = useState(false);

  const loadInsights = async (refresh = false) => {
    try {
      if (refresh) setRefreshing(true);
      else setLoading(true);
      setHasAttempted(true);

      const data = await aiInsightsService.getLeadInsights(leadId, refresh);
      if (isValidInsights(data)) {
        setInsights(data);
        if (refresh) toast.success('AI analysis refreshed!');
      } else {
        setInsights(null);
        toast.error('No AI analysis available yet');
      }
    } catch (error) {
      console.error('Failed to load AI insights:', error);
      setInsights(null);
      toast.error('Error loading AI analysis');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!insights) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Insights
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6">
            <Brain className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">
              {hasAttempted ? 'No AI analysis available' : 'Run analysis when you are ready'}
            </p>
            <Button onClick={() => loadInsights(true)}>
              <Brain className="w-4 h-4 mr-2" />
              Run Analysis
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-5 h-5" />
            AI Insights
          </CardTitle>
          <Button
            variant="outline"
            size="sm"
            onClick={() => loadInsights(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Lead Scores
          </h4>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-3 bg-blue-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Quality</div>
              <div className={`text-2xl font-bold ${aiInsightsService.getScoreColor(insights.lead_score.quality)}`}>
                {Math.round(insights.lead_score.quality)}
              </div>
              <div className="text-xs text-gray-500">/ 100</div>
            </div>

            <div className="text-center p-3 bg-green-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Priority</div>
              <div className={`text-2xl font-bold ${aiInsightsService.getScoreColor(insights.lead_score.priority)}`}>
                {Math.round(insights.lead_score.priority)}
              </div>
              <div className="text-xs text-gray-500">/ 100</div>
            </div>

            <div className="text-center p-3 bg-purple-50 rounded-lg">
              <div className="text-sm text-gray-600 mb-1">Confidence</div>
              <Badge className={aiInsightsService.getConfidenceBadgeColor(insights.confidence_score)}>
                {aiInsightsService.formatConfidence(insights.confidence_score)}
              </Badge>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <User className="w-4 h-4" />
            Personality Profile
          </h4>

          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-sm"
                style={{ backgroundColor: aiInsightsService.getPersonalityColor(insights.personality.type) }}
              >
                {insights.personality.type}
              </div>
              <div>
                <div className="font-medium">{insights.personality.type} Personality Type</div>
                <div className="text-sm text-gray-600">
                  {aiInsightsService.getDiscDescription(insights.personality.type)}
                </div>
              </div>
            </div>

            <div className="mb-3">
              <div className="text-sm font-medium mb-1 flex items-center gap-1">
                <MessageCircle className="w-3 h-3" />
                Communication Style
              </div>
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {aiInsightsService.getCommunicationEmoji(insights.personality.communication?.[0])}
                </span>
                <span className="text-sm text-gray-700">
                  {insights.personality.communication?.[0] || '—'}
                </span>
              </div>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Strengths</div>
              <div className="flex flex-wrap gap-1">
                {(insights.personality.strengths || []).map((strength, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {strength}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-medium mb-3 flex items-center gap-2">
            <Target className="w-4 h-4" />
            Sales Recommendations
          </h4>
          <div className="space-y-3">
            <div className="p-3 bg-blue-50 rounded-lg">
              <div className="text-sm font-medium text-blue-800 mb-1">Approach</div>
              <div className="text-sm text-blue-700">{insights.recommendations.approach}</div>
            </div>
            {(insights.recommendations.tips || []).length > 0 && (
              <div>
                <div className="text-sm font-medium mb-2">Tips</div>
                <ul className="text-sm text-gray-700 space-y-1 list-disc list-inside">
                  {insights.recommendations.tips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default LeadAIInsights;

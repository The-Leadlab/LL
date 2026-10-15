import api from '@/lib/axios';

export interface LeadScore {
  quality: number;
  priority: number;
  confidence: number;
}

export interface PersonalityAnalysis {
  type: string;
  strengths: string[];
  communication: string[];
  confidence: number;
}

export interface SalesRecommendations {
  approach: string;
  tips: string[];
  challenges: string[];
}

export interface AIInsights {
  lead_id: number;
  lead_score: LeadScore;
  personality: PersonalityAnalysis;
  recommendations: SalesRecommendations;
  features_used: number;
  confidence_score: number;
}

export interface AIAnalytics {
  total_insights: number;
  avg_quality_score: number;
  avg_priority_score: number;
  avg_confidence: number;
  personality_distribution: Record<string, number>;
  provider_distribution: Record<string, number>;
}

export interface HighPriorityLead {
  lead_id: number;
  lead_name: string;
  company: string;
  job_title: string;
  priority_score: number;
  quality_score: number;
  personality_type: string;
  confidence: number;
  last_analyzed: string;
}

class AIInsightsService {
  /**
   * Get AI insights for lead
   */
  async getLeadInsights(leadId: number, refresh: boolean = false): Promise<AIInsights> {
    const response = await api.get(`/ai-insights/${leadId}/insights`, {
      params: { refresh }
    });
    return response.data;
  }

  /**
   * Start batch analysis for multiple leads
   */
  async batchAnalyzeLeads(leadIds: number[]): Promise<{
    success: boolean;
    message: string;
    lead_count: number;
    status: string;
  }> {
    const response = await api.post('/ai-insights/batch-analyze', leadIds);
    return response.data;
  }

  /**
   * Get AI insights analytics
   */
  async getAnalytics(): Promise<AIAnalytics> {
    const response = await api.get('/ai-insights/analytics');
    return response.data.data;
  }

  /**
   * Get high priority leads
   */
  async getHighPriorityLeads(
    minScore: number = 70.0,
    limit: number = 10
  ): Promise<HighPriorityLead[]> {
    const response = await api.get('/ai-insights/high-priority', {
      params: { min_score: minScore, limit }
    });
    return response.data.data;
  }

  /**
   * Color code based on DISC profile
   */
  getPersonalityColor(discType: string): string {
    const colors = {
      'D': '#ef4444', // Red - Dominant
      'I': '#f59e0b', // Amber - Influential
      'S': '#10b981', // Emerald - Steady
      'C': '#3b82f6', // Blue - Compliant
    };
    
    const primaryType = discType?.[0]?.toUpperCase() || 'D';
    return colors[primaryType as keyof typeof colors] || colors.D;
  }

  /**
   * Badge color based on confidence score
   */
  getConfidenceBadgeColor(confidence: number): string {
    if (confidence >= 0.8) return 'bg-green-100 text-green-800';
    if (confidence >= 0.6) return 'bg-yellow-100 text-yellow-800';
    return 'bg-red-100 text-red-800';
  }

  /**
   * Format confidence score as percentage
   */
  formatConfidence(confidence: number): string {
    return `${Math.round(confidence * 100)}%`;
  }

  /**
   * Colorize Quality/Priority score
   */
  getScoreColor(score: number): string {
    if (score >= 80) return 'text-green-600';
    if (score >= 60) return 'text-yellow-600';
    return 'text-red-600';
  }

  /**
   * DISC profile description
   */
  getDiscDescription(discType: string): string {
    const descriptions = {
      'D': 'Dominant - Results-oriented, decisive, competitive',
      'I': 'Influential - Outgoing, enthusiastic, persuasive',
      'S': 'Steady - Patient, loyal, supportive',
      'C': 'Compliant - Analytical, detail-oriented, systematic'
    };
    
    const primaryType = discType?.[0]?.toUpperCase() || 'D';
    return descriptions[primaryType as keyof typeof descriptions] || descriptions.D;
  }

  /**
   * Communication style emoji
   */
  getCommunicationEmoji(style: string): string {
    const emojis = {
      'direct': '🎯',
      'friendly': '😊',
      'patient': '🤝',
      'detailed': '📊',
      'professional': '💼'
    };
    
    const styleKey = style?.toLowerCase() || 'professional';
    for (const [key, emoji] of Object.entries(emojis)) {
      if (styleKey.includes(key)) return emoji;
    }
    return emojis.professional;
  }
}

export const aiInsightsService = new AIInsightsService();
export default aiInsightsService; 
import React, { useState, useEffect } from 'react';
import { Zap, Brain, TrendingUp, BarChart3, Users, Target, Search, Filter, Download } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import aiInsightsService, { AIAnalytics, HighPriorityLead } from '@/services/aiInsightsService';
import AIInsightsDashboard from '@/components/dashboard/AIInsightsDashboard';
import LeadAIScoreBadges from '@/components/leads/LeadAIScoreBadges';

export function AIInsightsPage() {
  const [analytics, setAnalytics] = useState<AIAnalytics | null>(null);
  const [highPriorityLeads, setHighPriorityLeads] = useState<HighPriorityLead[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPersonalityTypes, setSelectedPersonalityTypes] = useState<string[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [analyticsData, priorityLeads] = await Promise.all([
        aiInsightsService.getAnalytics(),
        aiInsightsService.getHighPriorityLeads(60, 20)
      ]);
      setAnalytics(analyticsData);
      setHighPriorityLeads(priorityLeads);
    } catch (error) {
      console.error('Failed to load AI Insights data:', error);
      toast.error('Error loading AI Insights data');
    } finally {
      setLoading(false);
    }
  };

  const filteredLeads = highPriorityLeads.filter(lead => {
    const matchesSearch = searchQuery === '' || 
      lead.lead_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.company?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.job_title?.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesPersonality = selectedPersonalityTypes.length === 0 ||
      selectedPersonalityTypes.includes(lead.personality_type);
    
    return matchesSearch && matchesPersonality;
  });

  const handlePersonalityFilter = (type: string) => {
    setSelectedPersonalityTypes(prev => 
      prev.includes(type) 
        ? prev.filter(t => t !== type)
        : [...prev, type]
    );
  };

  const handleBatchAnalyze = async () => {
    try {
      // Simulate lead IDs for demo
      const leadIds = Array.from({length: 10}, (_, i) => i + 1);
      await aiInsightsService.batchAnalyzeLeads(leadIds);
      toast.success('Batch analysis started!');
      setTimeout(() => loadData(), 2000); // Refresh after 2 seconds
    } catch (error) {
      toast.error('Failed to start batch analysis');
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
      <div className="flex items-center space-x-3">
          <Brain className="h-8 w-8 text-blue-600" />
        <h1 className="text-2xl font-semibold text-foreground">AI Insights</h1>
          <Badge className="bg-blue-100 text-blue-800">Live</Badge>
      </div>
        <div className="flex items-center gap-3">
          <Button onClick={handleBatchAnalyze} className="bg-gradient-to-r from-primary-600 to-primary-700 hover:from-blue-700 hover:to-purple-700 text-white border-0">
            <Brain className="w-4 h-4 mr-2" />
            Start Batch Analysis
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-64 w-full" />
          <div className="grid grid-cols-2 gap-6">
            <Skeleton className="h-48 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        </div>
      ) : (
        <>
          {/* Analytics Dashboard */}
          <AIInsightsDashboard />

          {/* Quick Stats */}
          {analytics && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card>
                <CardContent className="p-6">
                  <div className="flex items-center">
                    <Users className="h-8 w-8 text-blue-600" />
                                         <div className="ml-4">
                       <p className="text-sm font-medium text-muted-foreground">Total Insights</p>
                       <p className="text-2xl font-bold text-foreground">{analytics.total_insights}</p>
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardContent className="p-6">
                   <div className="flex items-center">
                     <TrendingUp className="h-8 w-8 text-green-600" />
                     <div className="ml-4">
                       <p className="text-sm font-medium text-muted-foreground">Avg. Quality</p>
                       <p className="text-2xl font-bold text-foreground">{analytics.avg_quality_score}</p>
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardContent className="p-6">
                   <div className="flex items-center">
                     <Target className="h-8 w-8 text-purple-600" />
                     <div className="ml-4">
                       <p className="text-sm font-medium text-muted-foreground">Avg. Priority</p>
                       <p className="text-2xl font-bold text-foreground">{analytics.avg_priority_score}</p>
                     </div>
                   </div>
                 </CardContent>
               </Card>

               <Card>
                 <CardContent className="p-6">
                   <div className="flex items-center">
                     <BarChart3 className="h-8 w-8 text-amber-600" />  
                     <div className="ml-4">
                       <p className="text-sm font-medium text-muted-foreground">High Priority</p>
                       <p className="text-2xl font-bold text-foreground">{highPriorityLeads.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* High Priority Leads Section */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                                 <CardTitle className="flex items-center gap-2">
                   <Target className="w-5 h-5" />
                   High Priority Leads
                 </CardTitle>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">
                    <Download className="w-4 h-4 mr-2" />
                    Export
                  </Button>
                </div>
              </div>
            </CardHeader>
            
            <CardContent>
              {/* Filters */}
              <div className="mb-6 space-y-4">
                <div className="flex items-center gap-4">
                  <div className="relative flex-1 max-w-sm">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                                         <input
                       type="text"
                       placeholder="Search leads..."
                       value={searchQuery}
                       onChange={(e) => setSearchQuery(e.target.value)}
                       className="pl-10 pr-4 py-2 w-full border border-border rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                     />
                  </div>
                </div>

                {/* Personality Type Filters */}
                                 <div className="flex items-center gap-2">
                   <Filter className="w-4 h-4 text-muted-foreground" />
                   <span className="text-sm text-muted-foreground mr-2">Personality Type:</span>
                   {['D', 'I', 'S', 'C'].map(type => (
                     <button
                       key={type}
                       onClick={() => handlePersonalityFilter(type)}
                       className={`w-8 h-8 rounded-full text-white font-bold text-sm transition-all ${
                         selectedPersonalityTypes.includes(type) ? 'ring-2 ring-black' : ''
                       }`}
                       style={{ backgroundColor: aiInsightsService.getPersonalityColor(type) }}
                     >
                       {type}
                     </button>
                   ))}
                   {selectedPersonalityTypes.length > 0 && (
                     <Button 
                       variant="outline" 
                       size="sm" 
                       onClick={() => setSelectedPersonalityTypes([])}
                     >
                       Clear
                     </Button>
                   )}
                </div>
              </div>

              {/* Leads Table */}
              <div className="space-y-3">
                {filteredLeads.length > 0 ? (
                  filteredLeads.map((lead) => (
                    <div key={lead.lead_id} className="p-4 border border-border rounded-lg hover:bg-muted transition-colors">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <h3 className="font-semibold text-foreground">{lead.lead_name}</h3>
                            <div
                              className="w-6 h-6 rounded-full flex items-center justify-center text-white text-xs font-bold"
                              style={{ backgroundColor: aiInsightsService.getPersonalityColor(lead.personality_type) }}
                              title={aiInsightsService.getDiscDescription(lead.personality_type)}
                            >
                              {lead.personality_type}
                            </div>
                          </div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {lead.job_title} @ {lead.company}
          </div>
        </div>

                        <div className="flex items-center gap-4">
                          <LeadAIScoreBadges
                            qualityScore={lead.quality_score}
                            priorityScore={lead.priority_score}
                            personalityType={lead.personality_type}
                            confidence={lead.confidence}
                            compact={false}
                          />
                          
                                                     <Button 
                             variant="outline" 
                             size="sm"
                             onClick={() => window.open(`/leads/${lead.lead_id}`, '_blank')}
                           >
                             Details
                           </Button>
          </div>
        </div>
      </div>
                  ))
                                 ) : (
                   <div className="text-center py-8 text-muted-foreground">
                     <Target className="w-12 h-12 mx-auto mb-4 opacity-50" />
                     <p>No leads found matching the criteria</p>
                   </div>
                 )}
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
} 
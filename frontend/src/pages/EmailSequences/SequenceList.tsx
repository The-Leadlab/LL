import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { emailSequencesAPI, EmailSequence, SequenceStats } from '@/services/api/email-sequences';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { useToast } from '@/hooks/use-toast';
import { Mail, Plus, Edit, Trash2, Play, Pause, TrendingUp, Users, CheckCircle, Reply, Loader2 } from 'lucide-react';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatDate } from '@/lib/utils';

export const SequenceList: React.FC = () => {
  const { t } = useTranslation('emails');
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const navigate = useNavigate();

  // Fetch sequences
  const { data: sequences, isLoading } = useQuery({
    queryKey: ['email-sequences'],
    queryFn: () => emailSequencesAPI.getAll()
  });

  // Fetch stats
  const { data: stats } = useQuery({
    queryKey: ['email-sequences', 'stats'],
    queryFn: emailSequencesAPI.getStats
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: emailSequencesAPI.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      toast({
        title: t('sequencesPage.successTitle'),
        description: t('sequencesPage.deleted')
      });
    }
  });

  // Toggle active mutation
  const toggleActiveMutation = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) =>
      emailSequencesAPI.update(id, { is_active }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['email-sequences'] });
      toast({
        title: t('sequencesPage.successTitle'),
        description: t('sequencesPage.statusUpdated')
      });
    }
  });

  const getSequenceStats = (sequenceId: number): SequenceStats | undefined => {
    return stats?.find(s => s.id === sequenceId);
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold">{t('campaigns')}</h1>
            <p className="mt-1 text-muted-foreground dark:text-muted-foreground">
              {t('sequencesPage.subtitle')}
            </p>
          </div>
          <Button variant="primary" onClick={() => navigate('/emails/outreach')}>
            <Plus className="h-4 w-4 mr-2" />
            {t('sequencesPage.launchColdOutreach')}
          </Button>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <Mail className="h-6 w-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.totalCampaigns')}</p>
                  <p className="text-2xl font-bold">{sequences?.length || 0}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-green-100 rounded-lg">
                  <Users className="h-6 w-6 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.totalEnrolled')}</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_enrolled, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <CheckCircle className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.completed')}</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_completed, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-orange-100 rounded-lg">
                  <Reply className="h-6 w-6 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.totalReplies')}</p>
                  <p className="text-2xl font-bold">
                    {sequences?.reduce((sum, s) => sum + s.total_replied, 0) || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Sequences List */}
        <div className="space-y-4">
          {sequences && sequences.length > 0 ? (
            sequences.map((sequence) => {
              const sequenceStats = getSequenceStats(sequence.id);
              return (
                <Card key={sequence.id} className="hover:shadow-lg transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-xl font-semibold">{sequence.name}</h3>
                          {sequence.is_active ? (
                            <Badge className="bg-green-100 text-green-800">
                              <Play className="h-3 w-3 mr-1" />
                              {t('sequencesPage.active')}
                            </Badge>
                          ) : (
                            <Badge variant="secondary">
                              <Pause className="h-3 w-3 mr-1" />
                              {t('sequencesPage.paused')}
                            </Badge>
                          )}
                        </div>
                        {sequence.description && (
                          <p className="text-muted-foreground dark:text-muted-foreground mb-4">{sequence.description}</p>
                        )}

                        {/* Steps Info */}
                        <div className="flex items-center gap-4 text-sm text-muted-foreground dark:text-muted-foreground mb-4">
                          <span>{t('sequencesPage.stepsCount', { count: sequence.steps.length })}</span>
                          <span>•</span>
                          <span>{t('sequencesPage.enrolledCount', { count: sequence.total_enrolled })}</span>
                          <span>•</span>
                          <span>{t('sequencesPage.created', { date: formatDate(sequence.created_at) })}</span>
                        </div>

                        {/* Performance Metrics */}
                        {sequenceStats && (
                          <div className="flex items-center gap-6 text-sm">
                            <div>
                              <span className="text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.replyRate')}</span>
                              <span className="ml-2 font-semibold text-green-600">
                                {sequenceStats.reply_rate.toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.completionRate')}</span>
                              <span className="ml-2 font-semibold text-blue-600">
                                {sequenceStats.completion_rate.toFixed(1)}%
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground dark:text-muted-foreground">{t('sequencesPage.activeLabel')}</span>
                              <span className="ml-2 font-semibold">
                                {sequenceStats.active_enrollments}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => navigate(`/email-sequences/${sequence.id}`)}
                        >
                          <Edit className="h-4 w-4 mr-1" />
                          {t('sequencesPage.edit')}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            toggleActiveMutation.mutate({
                              id: sequence.id,
                              is_active: !sequence.is_active
                            })
                          }
                        >
                          {sequence.is_active ? (
                            <>
                              <Pause className="h-4 w-4 mr-1" />
                              {t('sequencesPage.pause')}
                            </>
                          ) : (
                            <>
                              <Play className="h-4 w-4 mr-1" />
                              {t('sequencesPage.activate')}
                            </>
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            if (confirm(t('sequencesPage.confirmDelete'))) {
                              deleteMutation.mutate(sequence.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-red-600" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Mail className="mx-auto mb-4 h-16 w-16 text-gray-400 dark:text-muted-foreground" />
                <h3 className="mb-2 text-lg font-semibold">{t('sequencesPage.emptyTitle')}</h3>
                <p className="mb-4 text-muted-foreground dark:text-muted-foreground">
                  {t('sequencesPage.emptyBody')}
                </p>
                <Button variant="primary" onClick={() => navigate('/email-sequences/create')}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t('sequencesPage.createFirst')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default SequenceList;

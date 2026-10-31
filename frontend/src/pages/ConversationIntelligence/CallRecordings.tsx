import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { conversationsAPI, CallRecording } from '@/services/api/conversations';
import { leadsAPI } from '@/services/api';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PageContainer } from '@/components/ui/PageContainer';
import { Badge } from '@/components/ui/Badge';
import {
  Phone, Play, FileText, TrendingUp, Users,
  Clock, CheckCircle, Loader2, AlertCircle, Mic, Trash2
} from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';

const handlePlayRecording = async (recording: CallRecording, t: TFunction) => {
    try {
      const response = await fetch(recording.recording_url, { method: 'HEAD' });
      if (!response.ok) {
        console.error('Recording playback fetch failed', { recordingId: recording.id, status: response.status });
        toast.error(t('conv.recordingUnavailable'));
        return;
      }
      window.open(recording.recording_url, '_blank');
    } catch (error) {
      console.error('Recording playback fetch failed', { recordingId: recording.id, error });
      toast.error(t('conv.openRecordingFailed'));
    }
  };


export const CallRecordings: React.FC = () => {
  const { t } = useTranslation('messages');
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fetch recordings
  const { data: recordings, isLoading } = useQuery({
    queryKey: ['call-recordings'],
    queryFn: () => conversationsAPI.getRecordings()
  });

  const { data: leadsResponse } = useQuery({
    queryKey: ['leads-for-recordings'],
    queryFn: () => leadsAPI.getAll({ limit: 500 }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => conversationsAPI.deleteRecording(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['call-recordings'] });
    },
  });

  const leads = leadsResponse?.data?.results || [];
  const leadNameById = new Map<number, string>(
    leads.map((lead) => [lead.id, `${lead.first_name} ${lead.last_name}`.trim()])
  );

  // Fetch analytics
  const { data: analytics } = useQuery({
    queryKey: ['call-analytics'],
    queryFn: () => conversationsAPI.getAnalytics()
  });

  const getStatusBadge = (status: string) => {
    const styles: Record<string, { variant: any; icon: any; label: string }> = {
      pending: { variant: 'secondary', icon: Clock, label: t('conv.status.pending') },
      processing: { variant: 'default', icon: Loader2, label: t('conv.status.processing') },
      completed: { variant: 'default', icon: CheckCircle, label: t('conv.status.completed') },
      failed: { variant: 'destructive', icon: AlertCircle, label: t('conv.status.failed') }
    };
    const style = styles[status] || styles.pending;
    const Icon = style.icon;
    return (
      <Badge variant={style.variant} className={status === 'completed' ? 'bg-green-100 text-green-800' : ''}>
        <Icon className={`h-3 w-3 mr-1 ${status === 'processing' ? 'animate-spin' : ''}`} />
        {style.label}
      </Badge>
    );
  };

  const getSentimentBadge = (score?: number) => {
    if (score === undefined || score === null) return null;

    let color = 'bg-muted text-foreground';
    let label = t('conv.sentiment.neutral');

    if (score > 0.3) {
      color = 'bg-green-100 text-green-800';
      label = t('conv.sentiment.positive');
    } else if (score < -0.3) {
      color = 'bg-red-100 text-red-800';
      label = t('conv.sentiment.negative');
    }

    return (
      <Badge className={color}>
        {label} ({score.toFixed(2)})
      </Badge>
    );
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            <h1 className="text-3xl font-bold">{t('conv.title')}</h1>
            <p className="text-muted-foreground mt-1">
              {t('conv.subtitle')}
            </p>
          </div>
          <Button onClick={() => navigate('/conversations/upload')}>
            <Mic className="h-4 w-4 mr-2" />
            {t('conv.uploadRecording')}
          </Button>
        </div>

        {/* Analytics Stats */}
        {analytics && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-100 rounded-lg">
                    <Phone className="h-6 w-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('conv.totalCalls')}</p>
                    <p className="text-2xl font-bold">{analytics.total_calls}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-green-100 rounded-lg">
                    <CheckCircle className="h-6 w-6 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('conv.analyzed')}</p>
                    <p className="text-2xl font-bold">{analytics.analyzed_count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-100 rounded-lg">
                    <Clock className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('conv.avgDuration')}</p>
                    <p className="text-2xl font-bold">{analytics.avg_duration_minutes.toFixed(1)}m</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-100 rounded-lg">
                    <TrendingUp className="h-6 w-6 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{t('conv.avgSentiment')}</p>
                    <p className="text-2xl font-bold">{analytics.avg_sentiment_score.toFixed(2)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Recordings List */}
        <div className="space-y-4">
          {recordings && recordings.length > 0 ? (
            recordings.map((recording) => (
              <Card key={recording.id} className="hover:shadow-lg transition-shadow cursor-pointer"
                    onClick={() => navigate(`/conversations/recordings/${recording.id}`)}>
                <CardContent className="p-6">
                  <div className="flex items-start gap-4">
                    <div className="p-3 bg-blue-100 rounded-lg">
                      <Phone className="h-6 w-6 text-blue-600" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold">
                          {t('conv.callRecordingN', { id: recording.id })}
                        </h3>
                        {getStatusBadge(recording.transcription_status)}
                        {getSentimentBadge(recording.sentiment_score)}
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-muted-foreground mb-3">
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4" />
                          <span>{formatDuration(recording.duration_seconds)}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="h-4 w-4" />
                          <span>{recording.lead_name || leadNameById.get(recording.lead_id) || t('conv.leadN', { id: recording.lead_id })}</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Phone className="h-4 w-4" />
                          <span>{formatDate(recording.call_date)}</span>
                        </div>
                        {recording.analyzed_at && (
                          <div className="flex items-center gap-1">
                            <CheckCircle className="h-4 w-4 text-green-600" />
                            <span>{t('conv.analyzed')}</span>
                          </div>
                        )}
                      </div>

                      {/* Keywords & Topics */}
                      {recording.keywords && recording.keywords.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-2">
                          {recording.keywords.slice(0, 5).map((kw: any, idx: number) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {kw.keyword}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {recording.topics && recording.topics.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {recording.topics.slice(0, 3).map((topic: string, idx: number) => (
                            <Badge key={idx} className="bg-blue-100 text-blue-800 text-xs">
                              {topic}
                            </Badge>
                          ))}
                        </div>
                      )}

                      {/* Transcript Preview */}
                      {recording.transcript && (
                        <div className="mt-3 p-3 bg-muted/50 rounded-lg">
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {recording.transcript.substring(0, 200)}...
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-col gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayRecording(recording, t);
                        }}
                      >
                        <Play className="h-4 w-4 mr-1" />
                        {t('conv.play')}
                      </Button>
                      {recording.transcript && (
                        <Button variant="outline" size="sm" onClick={(e) => e.stopPropagation()}>
                          <FileText className="h-4 w-4 mr-1" />
                          {t('conv.transcript')}
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(t('conv.confirmDelete'))) {
                            deleteMutation.mutate(recording.id);
                          }
                        }}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t('conv.delete')}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Phone className="h-16 w-16 mx-auto mb-4 text-gray-400" />
                <h3 className="text-lg font-semibold mb-2">{t('conv.emptyTitle')}</h3>
                <p className="text-muted-foreground mb-4">
                  {t('conv.emptyBody')}
                </p>
                <Button onClick={() => navigate('/conversations/upload')}>
                  <Mic className="h-4 w-4 mr-2" />
                  {t('conv.uploadRecording')}
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </PageContainer>
  );
};

export default CallRecordings;
